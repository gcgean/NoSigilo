import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { initDb, queryAll, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

// Segredo do webhook do hub no ambiente de teste. Fica aqui em cima porque o
// teste precisa assinar o corpo com o mesmo valor que o app confere.
const HUB_WEBHOOK_SECRET_TESTE = 'segredo-de-teste-do-webhook';

type Ctx = {
  app: ReturnType<typeof createApp>;
  db: DbHandle;
  dbFile: string;
  cleanup: () => Promise<void>;
};

async function createTestCtx(): Promise<Ctx> {
  const dbFile = path.join(process.cwd(), 'data', `test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const db = await initDb({
    databaseFile: dbFile,
    migrationsDir: path.join(process.cwd(), 'migrations'),
    pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
  });
  const app = createApp({
    db,
    env: {
      FRONTEND_ORIGIN: 'http://localhost:3000',
      JWT_SECRET: 'test-secret',
      TRIAL_DAYS: 30,
      RESEND_API_KEY: '',
      RESEND_FROM_EMAIL: '',
      APP_NAME: 'NoSigilo Test',
      BILLING_TEST_EMAILS: '',
      // Sem isto a rota /api/webhooks/hub-billing responde 503 e nao da para
      // testar comissao de renovacao. Ligar o segredo so habilita a rota.
      HUB_BILLING_WEBHOOK_SECRET: HUB_WEBHOOK_SECRET_TESTE,
    },
  });
  const cleanup = async () => {
    try {
      await db.persist();
    } catch {}
    try {
      await db.close();
    } catch {}
    if (existsSync(dbFile)) unlinkSync(dbFile);
    const storageDir = path.join(process.cwd(), 'storage');
    if (existsSync(storageDir)) rmSync(storageDir, { recursive: true, force: true });
    const legacyUploadsDir = path.join(process.cwd(), 'uploads');
    if (existsSync(legacyUploadsDir)) rmSync(legacyUploadsDir, { recursive: true, force: true });
  };
  return { app, db, dbFile, cleanup };
}

async function createBootstrapSponsor(ctx: Ctx, options?: { email?: string; name?: string; password?: string }) {
  const id = `sponsor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = options?.email || `${id}@example.com`;
  const password = options?.password || 'senha123';
  const createdAt = new Date().toISOString();
  await run(
    ctx.db,
    `INSERT INTO users (
      id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, email, bcrypt.hashSync(password, 10), options?.name || 'Sponsor', 1, 1, 0, createdAt, createdAt, '2099-01-01T00:00:00.000Z', 'approved']
  );
  await ctx.db.persist();
  const login = await request(ctx.app).post('/api/auth/login').send({ email, password }).expect(200);
  return { id, email, password, token: login.body.token as string };
}

async function createInviteFor(ctx: Ctx, inviterToken: string) {
  const response = await request(ctx.app).post('/api/invites').set('Authorization', `Bearer ${inviterToken}`).expect(200);
  return response.body as { id: string; token: string; url: string };
}

async function registerInvitedUser(
  ctx: Ctx,
  inviterToken: string,
  data: { name: string; email: string; password: string; gender: string; birthDate?: string; city?: string; state?: string; lookingFor?: string[] }
) {
  const invite = await createInviteFor(ctx, inviterToken);
  const registerResponse = await request(ctx.app)
    .post('/api/auth/register')
    .send({ ...data, inviteToken: invite.token })
    .expect(201);
  return { invite, registerResponse, token: registerResponse.body.token as string, user: registerResponse.body.user as any };
}

/**
 * Dá acesso pago a um usuário de teste, empurrando o fim do trial.
 *
 * Desde f68f853 (25/07/2026) perfil "Homem" nasce SEM trial: o cadastro já
 * expira no próprio instante do registro, por decisão de produto (homem paga,
 * vê só a amostra grátis). Vários testes daqui registram homens e em seguida
 * exercitam rotas pagas — conversas, radar, visitas de perfil — e o que eles
 * querem provar não é o paywall, é o comportamento DEPOIS dele.
 *
 * Chamar isto deixa essa dependência explícita no teste, em vez de escondê-la
 * na escolha do gênero lá em cima. Para testar o paywall em si, registre sem
 * chamar esta função.
 */
async function grantPremium(ctx: Ctx, userId: string) {
  const umAno = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  await run(ctx.db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', [umAno, userId]);
}

describe('nosigilo backend', () => {
  let ctx: Ctx;
  let sponsorToken: string;

  beforeAll(async () => {
    ctx = await createTestCtx();
    const sponsor = await createBootstrapSponsor(ctx, { email: 'sponsor@example.com', name: 'Sponsor Principal' });
    sponsorToken = sponsor.token;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('register/login/me flow works', async () => {
    const reg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Teste',
      email: 'teste@example.com',
      password: 'senha123',
      birthDate: '1999-01-01',
      gender: 'Homem',
      lookingFor: ['Mulher'],
    });

    expect(reg.token).toBeTypeOf('string');
    expect(reg.user.email).toBe('teste@example.com');

    const token = reg.token;
    expect(token).toBeTypeOf('string');

    const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.email).toBe('teste@example.com');
    expect(me.body.invitedBy?.name).toBe('Sponsor Principal');
  });

  it('invite link is multi-use: stays active and accepts several signups until revoked', async () => {
    const invite = await createInviteFor(ctx, sponsorToken);

    const publicInfo = await request(ctx.app).get(`/api/invites/public/${invite.token}`).expect(200);
    expect(publicInfo.body.canRegister).toBe(true);
    expect(publicInfo.body.inviter.name).toBe('Sponsor Principal');

    const registerResponse = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Convidado Direto',
        email: 'direto@example.com',
        password: 'senha123',
        gender: 'Homem',
        inviteToken: invite.token,
      })
      .expect(201);
    expect(registerResponse.body.token).toBeTypeOf('string');
    expect(registerResponse.body.user.email).toBe('direto@example.com');
    expect(registerResponse.body.user.invitationStatus).toBe('approved');

    // O link permanece ativo (não vira 'approved'/uso único) após o 1º cadastro.
    const inviteList = await request(ctx.app).get('/api/invites').set('Authorization', `Bearer ${sponsorToken}`).expect(200);
    expect(inviteList.body.some((item: any) => item.id === invite.id && item.status !== 'revoked')).toBe(true);

    const stillOpen = await request(ctx.app).get(`/api/invites/public/${invite.token}`).expect(200);
    expect(stillOpen.body.canRegister).toBe(true);

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'direto@example.com', password: 'senha123' })
      .expect(200);
    expect(login.body.user.invitedBy?.name).toBe('Sponsor Principal');

    // Segundo cadastro com o MESMO link agora deve funcionar (multi-uso).
    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Convite Reutilizado',
        email: 'reutilizado@example.com',
        password: 'senha123',
        gender: 'Homem',
        inviteToken: invite.token,
      })
      .expect(201);

    // Após revogar, o link para de aceitar cadastros.
    await request(ctx.app)
      .post(`/api/invites/${invite.id}/revoke`)
      .set('Authorization', `Bearer ${sponsorToken}`)
      .expect(200);

    const afterRevoke = await request(ctx.app).get(`/api/invites/public/${invite.token}`).expect(200);
    expect(afterRevoke.body.canRegister).toBe(false);

    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Convite Apos Revogacao',
        email: 'pos-revogacao@example.com',
        password: 'senha123',
        gender: 'Homem',
        inviteToken: invite.token,
      })
      .expect(409);
  });

  it('sends a recovery code and allows changing the password', async () => {
    await registerInvitedUser(ctx, sponsorToken, {
      name: 'Reset User',
      email: 'reset-user@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });

    const requestCode = await request(ctx.app)
      .post('/api/auth/forgot-password/request')
      .send({ email: 'reset-user@example.com' })
      .expect(200);

    expect(requestCode.body.previewCode).toMatch(/^\d{6}$/);

    await request(ctx.app)
      .post('/api/auth/forgot-password/confirm')
      .send({
        email: 'reset-user@example.com',
        code: requestCode.body.previewCode,
        newPassword: 'novaSenha456',
      })
      .expect(200);

    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'reset-user@example.com', password: 'novaSenha456' })
      .expect(200);
  });

  it('admin endpoints use current database admin status even with an older token', async () => {
    const reg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Admin Promovido',
      email: 'admin-promovido@example.com',
      password: 'senha123',
      gender: 'Homem',
    });

    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [reg.user.id]);

    const adminUsers = await request(ctx.app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${reg.token}`)
      .expect(200);

    const adminUsersList = Array.isArray(adminUsers.body?.users) ? adminUsers.body.users : [];
    expect(Array.isArray(adminUsersList)).toBe(true);
    expect(typeof adminUsers.body?.total).toBe('number');
    expect(adminUsersList.some((entry: any) => entry.email === 'admin-promovido@example.com' && entry.isAdmin === true)).toBe(true);

    const finance = await request(ctx.app)
      .get('/api/admin/finance/summary')
      .set('Authorization', `Bearer ${reg.token}`)
      .expect(200);

    expect(finance.body).toMatchObject({
      revenue: expect.any(Number),
      subscribers: expect.any(Number),
      newToday: expect.any(Number),
      churnRate: expect.any(Number),
    });
  });

  it('admin can remove a photo uploaded by another user', async () => {
    const owner = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dona da Foto',
      email: 'dona-foto@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const admin = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Moderador Foto',
      email: 'moderador-foto@example.com',
      password: 'senha123',
      gender: 'Homem',
    });

    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.user.id]);

    const upload = await request(ctx.app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'moderacao.png', contentType: 'image/png' })
      .expect(200);
    const mediaId = String(upload.body.id);

    await request(ctx.app)
      .delete(`/api/admin/photos/${mediaId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    const mediaRow = await ctx.db.queryOne('SELECT id FROM media WHERE id = ? LIMIT 1', [mediaId]);
    expect(mediaRow).toBeNull();
  });

  it('admin deactivation blocks login until the account is reactivated', async () => {
    const target = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Moderado',
      email: 'perfil-moderado@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const admin = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Moderador Conta',
      email: 'moderador-conta@example.com',
      password: 'senha123',
      gender: 'Homem',
    });

    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.user.id]);

    await request(ctx.app)
      .put(`/api/admin/users/${target.user.id}/deactivate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'perfil-moderado@example.com', password: 'senha123' })
      .expect(403)
      .expect(({ body }) => {
        expect(body.error).toBe('account_deactivated_by_admin');
      });

    await request(ctx.app)
      .put(`/api/admin/users/${target.user.id}/reactivate`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'perfil-moderado@example.com', password: 'senha123' })
      .expect(200);
  });

  it('cities search and nearest work', async () => {
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'São Paulo',
      'sao paulo',
      'SP',
      -23.5475,
      -46.6361,
    ]);
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'Rio de Janeiro',
      'rio de janeiro',
      'RJ',
      -22.9068,
      -43.1729,
    ]);

    const search = await request(ctx.app).get('/api/cities').query({ q: 'sao', limit: 5 }).expect(200);
    expect(Array.isArray(search.body)).toBe(true);
    expect(search.body.some((c: any) => c.name === 'São Paulo')).toBe(true);

    const nearest = await request(ctx.app).get('/api/cities/nearest').query({ lat: -23.55, lon: -46.63 }).expect(200);
    expect(nearest.body.name).toBe('São Paulo');
    expect(nearest.body.state).toBe('SP');
  });

  it('uses profile city coordinates for nearby discovery before GPS permission', async () => {
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'Fortaleza',
      'fortaleza',
      'CE',
      -3.7319,
      -38.5267,
    ]);
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'Caucaia',
      'caucaia',
      'CE',
      -3.7361,
      -38.6531,
    ]);
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'São Paulo',
      'sao paulo',
      'SP',
      -23.5475,
      -46.6361,
    ]);

    const viewer = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Cidade Próxima',
      email: 'viewer-cidade-proxima@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
      lookingFor: ['Travesti'],
    });
    const nearby = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Cidade Vizinha',
      email: 'perfil-cidade-vizinha@example.com',
      password: 'senha123',
      gender: 'Travesti',
      city: 'Caucaia',
      state: 'CE',
    });
    const distant = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Cidade Distante',
      email: 'perfil-cidade-distante@example.com',
      password: 'senha123',
      gender: 'Travesti',
      city: 'São Paulo',
      state: 'SP',
    });

    const storedViewer = (await queryOne(
      ctx.db,
      'SELECT lat, lon, location_source FROM users WHERE id = ?',
      [viewer.user.id]
    )) as any;
    expect(storedViewer.location_source).toBe('profile_city');
    expect(Number(storedViewer.lat)).toBeCloseTo(-3.7319, 3);
    expect(Number(storedViewer.lon)).toBeCloseTo(-38.5267, 3);

    const search = await request(ctx.app)
      .get('/api/users')
      .query({ sort: 'nearby', radar: 10, genders: 'Travesti', limit: 1, page: 1 })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const nearbyResult = search.body.users[0];
    expect(nearbyResult).toBeTruthy();
    expect(String(nearbyResult.id)).toBe(String(nearby.user.id));
    expect(Number(nearbyResult.distanceKm)).toBeGreaterThan(0);
    expect(Number(nearbyResult.distanceKm)).toBeLessThan(50);
    expect(search.body.hasMore).toBe(true);

    const expandedSearch = await request(ctx.app)
      .get('/api/users')
      .query({ sort: 'nearby', radar: 10, genders: 'Travesti', limit: 1, page: 2 })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(String(expandedSearch.body.users[0]?.id)).toBe(String(distant.user.id));
    expect(Number(expandedSearch.body.users[0]?.distanceKm)).toBeGreaterThan(1000);

    const sameCity = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Mesma Cidade',
      email: 'perfil-mesma-cidade@example.com',
      password: 'senha123',
      gender: 'Travesti',
      city: 'Fortaleza',
      state: 'CE',
    });

    await run(ctx.db, 'UPDATE users SET is_premium = 1 WHERE id = ?', [viewer.user.id]);
    const matchCards = await request(ctx.app)
      .get('/api/match/cards')
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const nearbyMatchIndex = matchCards.body.findIndex((u: any) => String(u.id) === String(nearby.user.id));
    const distantMatchIndex = matchCards.body.findIndex((u: any) => String(u.id) === String(distant.user.id));
    expect(nearbyMatchIndex).toBeGreaterThanOrEqual(0);
    expect(distantMatchIndex).toBeGreaterThanOrEqual(0);
    expect(nearbyMatchIndex).toBeLessThan(distantMatchIndex);

    const nearbyPostId = `feed-city-near-${Math.random().toString(16).slice(2)}`;
    const distantPostId = `feed-city-far-${Math.random().toString(16).slice(2)}`;
    const sameCityPostId = `feed-city-same-${Math.random().toString(16).slice(2)}`;
    const now = Date.now();
    await run(
      ctx.db,
      'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sameCityPostId, sameCity.user.id, 'Conteúdo da mesma cidade', null, 0, new Date(now - 120_000).toISOString()]
    );
    await run(
      ctx.db,
      'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [nearbyPostId, nearby.user.id, 'Conteúdo da cidade vizinha', null, 0, new Date(now - 60_000).toISOString()]
    );
    await run(
      ctx.db,
      'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [distantPostId, distant.user.id, 'Conteúdo da cidade distante', null, 0, new Date(now).toISOString()]
    );
    await ctx.db.persist();

    const feed = await request(ctx.app)
      .get('/api/feed')
      .query({ limit: 40, page: 1 })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const feedIds = feed.body.posts.map((post: any) => String(post.id));
    expect(feedIds.indexOf(nearbyPostId)).toBeGreaterThanOrEqual(0);
    expect(feedIds.indexOf(distantPostId)).toBeGreaterThanOrEqual(0);
    expect(feedIds.indexOf(nearbyPostId)).toBeLessThan(feedIds.indexOf(distantPostId));

    const regionalPage1 = await request(ctx.app)
      .get('/api/feed')
      .query({ cityOnly: true, limit: 1, page: 1 })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(String(regionalPage1.body.posts[0]?.id)).toBe(sameCityPostId);
    expect(regionalPage1.body.hasMore).toBe(true);

    const regionalPage2 = await request(ctx.app)
      .get('/api/feed')
      .query({ cityOnly: true, limit: 1, page: 2, seenIds: sameCityPostId })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(String(regionalPage2.body.posts[0]?.id)).toBe(nearbyPostId);
    expect(regionalPage2.body.hasMore).toBe(true);

    const regionalPage3 = await request(ctx.app)
      .get('/api/feed')
      .query({ cityOnly: true, limit: 1, page: 3, seenIds: `${sameCityPostId},${nearbyPostId}` })
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(String(regionalPage3.body.posts[0]?.id)).toBe(distantPostId);

    const gpsUpdate = await request(ctx.app)
      .put('/api/location')
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ lat: -3.7361, lng: -38.6531 })
      .expect(200);
    expect(gpsUpdate.body.city).toBe('Caucaia');
    expect(gpsUpdate.body.state).toBe('CE');

    const gpsViewer = (await queryOne(
      ctx.db,
      'SELECT city, state, lat, lon, location_source FROM users WHERE id = ?',
      [viewer.user.id]
    )) as any;
    expect(gpsViewer.city).toBe('Caucaia');
    expect(gpsViewer.state).toBe('CE');
    expect(gpsViewer.location_source).toBe('gps');
    // GPS guardado arredondado (~1 km, LGPD).
    expect(Number(gpsViewer.lat)).toBe(-3.74);
    expect(Number(gpsViewer.lon)).toBe(-38.65);
  });

  it('onboarding suggestions returns matching users', async () => {
    const casal = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Casal Alpha',
      email: 'casal-alpha@example.com',
      password: 'senha123',
      birthDate: '1994-01-01',
      gender: 'Casal (Ele/Ela)',
      city: 'São Paulo',
      state: 'SP',
    });

    const maria = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Maria',
      email: 'maria@example.com',
      password: 'senha123',
      birthDate: '1998-01-01',
      gender: 'Mulher',
      city: 'São Paulo',
      state: 'SP',
      lookingFor: ['Homem'],
    });

    // A rota só devolve quem tem foto (rows.filter(r => r.avatar)): sugestão
    // de perfil sem rosto não convence ninguém a se cadastrar. Cadastro de
    // teste nasce sem avatar, então é preciso dar um aqui — senão a lista
    // volta vazia e o teste falha por um motivo que não é o que ele mede.
    await run(ctx.db, 'UPDATE users SET avatar = ? WHERE id IN (?, ?)', [
      '/uploads/fake-avatar.png', String(maria.user.id), String(casal.user.id),
    ]);

    const sug = await request(ctx.app).get('/api/onboarding/suggestions').query({ lookingFor: 'Mulher', city: 'São Paulo', state: 'SP' }).expect(200);
    expect(Array.isArray(sug.body)).toBe(true);
    expect(sug.body.some((u: any) => u.name === 'Maria')).toBe(true);

    const sugAudiencePriority = await request(ctx.app)
      .get('/api/onboarding/suggestions')
      .query({ lookingFor: 'Casal (Ele/Ela),Mulher,Homem', city: 'São Paulo', state: 'SP' })
      .expect(200);
    expect(Array.isArray(sugAudiencePriority.body)).toBe(true);
    expect(sugAudiencePriority.body[0]?.gender).toContain('Casal');
  });

  it('match cards hide liked/passed profiles and liked list returns liked users', async () => {
    const me = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Matcher',
      email: 'matcher@example.com',
      password: 'senha123',
      birthDate: '1992-01-01',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });

    const likedTarget = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Liked Target',
      email: 'liked-target@example.com',
      password: 'senha123',
      birthDate: '1995-01-01',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });

    const passedTarget = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Passed Target',
      email: 'passed-target@example.com',
      password: 'senha123',
      birthDate: '1996-01-01',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });

    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ userId: likedTarget.user.id })
      .expect(200);

    await request(ctx.app)
      .post('/api/match/pass')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ userId: passedTarget.user.id })
      .expect(200);

    const cards = await request(ctx.app).get('/api/match/cards').set('Authorization', `Bearer ${me.token}`).expect(200);
    expect(Array.isArray(cards.body)).toBe(true);
    expect(cards.body.some((u: any) => String(u.id) === String(likedTarget.user.id))).toBe(false);
    expect(cards.body.some((u: any) => String(u.id) === String(passedTarget.user.id))).toBe(false);

    const likedList = await request(ctx.app).get('/api/match/liked').set('Authorization', `Bearer ${me.token}`).expect(200);
    expect(Array.isArray(likedList.body)).toBe(true);
    expect(likedList.body.some((u: any) => String(u.id) === String(likedTarget.user.id))).toBe(true);
    expect(likedList.body.some((u: any) => String(u.id) === String(passedTarget.user.id))).toBe(false);
  });

  it('creates a conversation with automatic message when likes are mutual', async () => {
    const regA = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Mutual A',
      email: 'mutual-a@example.com',
      password: 'senha123',
      birthDate: '1991-01-01',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });

    // Ler mensagem é rota paga e Mutual A é Homem (sem trial): sem isto o
    // conteúdo volta censurado, que é o comportamento de outro teste.
    await grantPremium(ctx, String(regA.user.id));

    const regB = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Mutual B',
      email: 'mutual-b@example.com',
      password: 'senha123',
      birthDate: '1993-01-01',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });

    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${regA.token}`)
      .send({ userId: regB.user.id })
      .expect(200);

    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${regB.token}`)
      .send({ userId: regA.user.id })
      .expect(200);

    const convListA = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${regA.token}`)
      .expect(200);
    const convForA = convListA.body.find((conversation: any) => String(conversation.user?.id) === String(regB.user.id));
    expect(convForA?.id).toBeTypeOf('string');

    const convListB = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${regB.token}`)
      .expect(200);
    const convForB = convListB.body.find((conversation: any) => String(conversation.user?.id) === String(regA.user.id));
    expect(String(convForB?.id)).toBe(String(convForA.id));

    const msgsA = await request(ctx.app)
      .get(`/api/conversations/${convForA.id}/messages`)
      .set('Authorization', `Bearer ${regA.token}`)
      .expect(200);
    expect(msgsA.body.some((message: any) => String(message.content || '').includes('Vocês se curtiram mutuamente'))).toBe(true);

    const msgsB = await request(ctx.app)
      .get(`/api/conversations/${convForA.id}/messages`)
      .set('Authorization', `Bearer ${regB.token}`)
      .expect(200);
    expect(msgsB.body.some((message: any) => String(message.content || '').includes('Vocês se curtiram mutuamente'))).toBe(true);
  });

  it('hides admin profiles from regular users across discovery routes', async () => {
    const regularViewer = await createBootstrapSponsor(ctx, {
      email: 'viewer-admin-hidden@example.com',
      name: 'Viewer Comum',
    });

    const adminProfile = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Admin Oculto',
      email: 'admin-oculto@example.com',
      password: 'senha123',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });

    const regularProfile = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Visivel',
      email: 'perfil-visivel@example.com',
      password: 'senha123',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });

    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [adminProfile.user.id]);

    const adminPost = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${adminProfile.token}`)
      .send({ content: 'Post do admin oculto' })
      .expect(200);

    const regularPost = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${regularProfile.token}`)
      .send({ content: 'Post do perfil visivel' })
      .expect(200);

    const usersList = await request(ctx.app)
      .get('/api/users')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(200);

    expect(Array.isArray(usersList.body.users)).toBe(true);
    expect(usersList.body.users.some((user: any) => String(user.id) === String(adminProfile.user.id))).toBe(false);
    expect(usersList.body.users.some((user: any) => String(user.id) === String(regularProfile.user.id))).toBe(true);

    await request(ctx.app)
      .get(`/api/users/${adminProfile.user.id}`)
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(404);

    const visibleProfile = await request(ctx.app)
      .get(`/api/users/${regularProfile.user.id}`)
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(200);
    expect(String(visibleProfile.body.id)).toBe(String(regularProfile.user.id));

    const feed = await request(ctx.app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(200);

    // O PERFIL do admin fica escondido (lista, ficha e match acima), mas o
    // POST dele aparece para todo mundo assinado como NoSigilo — decisao de
    // produto do commit 730a16f (29/05/2026), para a plataforma ter voz
    // propria no feed. Este teste afirmava o contrario e ficou parado.
    const postDoAdmin = feed.body.posts.find((post: any) => String(post.id) === String(adminPost.body.id));
    expect(postDoAdmin).toBeTruthy();
    expect(postDoAdmin.author.name).toBe('NoSigilo');
    expect(postDoAdmin.author.avatar).toBeFalsy();
    expect(feed.body.posts.some((post: any) => String(post.id) === String(regularPost.body.id))).toBe(true);

    const matchCards = await request(ctx.app)
      .get('/api/match/cards')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(200);

    expect(matchCards.body.some((user: any) => String(user.id) === String(adminProfile.user.id))).toBe(false);
    expect(matchCards.body.some((user: any) => String(user.id) === String(regularProfile.user.id))).toBe(true);

    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .send({ userId: adminProfile.user.id })
      .expect(200);

    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .send({ userId: regularProfile.user.id })
      .expect(200);

    const likedList = await request(ctx.app)
      .get('/api/match/liked')
      .set('Authorization', `Bearer ${regularViewer.token}`)
      .expect(200);

    expect(likedList.body.some((user: any) => String(user.id) === String(adminProfile.user.id))).toBe(false);
    expect(likedList.body.some((user: any) => String(user.id) === String(regularProfile.user.id))).toBe(true);
  });

  it('expired users can view chat with locked incoming messages but cannot start or reply', async () => {
    const regA = await registerInvitedUser(ctx, sponsorToken, {
      name: 'A',
      email: 'a@example.com',
      password: 'senha123',
      birthDate: '1990-01-01',
      gender: 'Homem',
    });
    const tokenA = regA.token;
    const idA = regA.user.id;
    await run(ctx.db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', idA]);

    const regB = await registerInvitedUser(ctx, sponsorToken, {
      name: 'B',
      email: 'b@example.com',
      password: 'senha123',
      birthDate: '1990-01-01',
      gender: 'Mulher',
    });
    const tokenB = regB.token;
    const idB = regB.user.id;

    const conv = await request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ userId: idA })
      .expect(200);
    const conversationId = conv.body.id;
    expect(conversationId).toBeTypeOf('string');

    await run(ctx.db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', idA]);

    await request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userId: idB })
      .expect(403);

    await request(ctx.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'mensagem privada' })
      .expect(200);

    await request(ctx.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'resposta bloqueada' })
      .expect(403);

    const msgsLocked = await request(ctx.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const received = msgsLocked.body.find((m: any) => m.senderId === idB);
    expect(received.isLocked).toBe(true);
    expect(received.content).toBeNull();

    await run(ctx.db, 'UPDATE users SET is_premium = 1 WHERE id = ?', [idA]);

    const msgsUnlocked = await request(ctx.app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    const received2 = msgsUnlocked.body.find((m: any) => m.senderId === idB);
    expect(received2.isLocked).toBe(false);
    expect(received2.content).toBe('mensagem privada');
  });

  it('posts, uploads, likes and comments persist and can be read', async () => {
    const reg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor',
      email: 'autor@example.com',
      password: 'senha123',
      gender: 'Homem',
      // O feed filtra os autores pela preferência de quem olha, e não abre
      // exceção para os posts do próprio usuário. Com lookingFor só
      // ['Mulher'] o autor não encontra o que ele mesmo acabou de postar, e
      // o que este teste quer provar é que o post foi gravado e volta
      // inteiro — não como o filtro de preferência se comporta.
      lookingFor: ['Homem', 'Mulher'],
    });
    const token = reg.token;
    const userId = reg.user.id as string;

    const imageUpload = await request(ctx.app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'foto.png', contentType: 'image/png' })
      .expect(200);
    const imageId = imageUpload.body.id as string;
    expect(imageId).toBeTypeOf('string');

    const videoUpload = await request(ctx.app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('fake video'), { filename: 'video.mp4', contentType: 'video/mp4' })
      .expect(200);
    const videoId = videoUpload.body.id as string;
    expect(videoId).toBeTypeOf('string');

    await request(ctx.app).patch(`/api/media/${imageId}/main`).set('Authorization', `Bearer ${token}`).expect(200);

    const post = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Meu post', mediaIds: [imageId, videoId] })
      .expect(200);
    const postId = post.body.id as string;
    expect(postId).toBeTypeOf('string');

    const feed = await request(ctx.app).get('/api/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const created = feed.body.posts.find((p: any) => p.id === postId);
    expect(created).toBeTruthy();
    expect(created.mediaIds).toEqual([imageId, videoId]);
    expect(created.media.length).toBe(2);
    expect(created.likesCount).toBe(0);
    expect(created.commentsCount).toBe(0);
    expect(created.likedByMe).toBe(false);

    await request(ctx.app)
      .post('/api/likes')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'post', targetId: postId })
      .expect(200);

    const likes = await request(ctx.app)
      .get('/api/likes')
      .set('Authorization', `Bearer ${token}`)
      .query({ targetType: 'post', targetId: postId })
      .expect(200);
    expect(Array.isArray(likes.body)).toBe(true);
    expect(likes.body.some((l: any) => l.user?.id === userId)).toBe(true);

    await request(ctx.app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetType: 'post', targetId: postId, content: 'Comentário teste' })
      .expect(200);

    const comments = await request(ctx.app)
      .get('/api/comments')
      .set('Authorization', `Bearer ${token}`)
      .query({ targetType: 'post', targetId: postId })
      .expect(200);
    expect(Array.isArray(comments.body)).toBe(true);
    expect(comments.body.some((c: any) => c.content === 'Comentário teste' && c.user?.id === userId)).toBe(true);

    const recent = await request(ctx.app).get('/api/photos/recent').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(recent.body)).toBe(true);
    expect(recent.body.some((m: any) => m.id === imageId)).toBe(true);
    expect(recent.body.some((m: any) => m.id === videoId)).toBe(false);
  });

  it('feed hides posts from deactivated or banned profiles', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Feed',
      email: 'viewer-feed@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const viewerToken = viewerReg.token;

    const activeAuthorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Ativo',
      email: 'autor-ativo@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const deactivatedAuthorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Desativado',
      email: 'autor-desativado@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const bannedAuthorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Banido',
      email: 'autor-banido@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });

    const createPostAs = async (token: string, content: string) => {
      const response = await request(ctx.app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ content })
        .expect(200);
      return String(response.body.id);
    };

    const activePostId = await createPostAs(activeAuthorReg.token, 'Post ativo');
    const deactivatedPostId = await createPostAs(deactivatedAuthorReg.token, 'Post desativado');
    const bannedPostId = await createPostAs(bannedAuthorReg.token, 'Post banido');

    await run(ctx.db, 'UPDATE users SET is_deactivated = 1, deactivated_at = ? WHERE id = ?', [new Date().toISOString(), deactivatedAuthorReg.user.id]);
    await run(ctx.db, 'UPDATE users SET is_banned = 1, banned_at = ? WHERE id = ?', [new Date().toISOString(), bannedAuthorReg.user.id]);

    const feed = await request(ctx.app)
      .get('/api/feed')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(Array.isArray(feed.body.posts)).toBe(true);
    expect(feed.body.posts.some((post: any) => String(post.id) === activePostId)).toBe(true);
    expect(feed.body.posts.some((post: any) => String(post.id) === deactivatedPostId)).toBe(false);
    expect(feed.body.posts.some((post: any) => String(post.id) === bannedPostId)).toBe(false);
  });

  it('paginates feed and reaches older posts across pages', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Feed Paginação',
      email: 'viewer-feed-paginacao@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const viewerToken = viewerReg.token;

    const marker = '[TEST-FEED-PAGINACAO]';
    // 94 = 47 autores x 2 posts, exatamente o teto do feed por autor.
    //
    // Com um numero impar o ultimo autor fica com 1 post so, e esse post — que
    // e tambem o mais antigo dos 94 — nao apareceu em nenhuma das 40 paginas,
    // mesmo com hasMore ainda true. E o rabo da janela de 400 do ranking, nao
    // um problema de autor com post unico (o teste de posts/uploads acima tem
    // exatamente isso e passa). Fica registrado aqui porque e o tipo de coisa
    // que vale investigar se alguem reclamar de post sumido no fim do feed.
    const totalPosts = 94;
    const baseTime = Date.parse('2100-01-01T12:00:00.000Z');
    const expectedIds = new Set<string>();

    // Os 95 posts precisam vir de autores DIFERENTES, 2 no máximo por autor.
    // O feed corta em MAX_POSTS_PER_AUTHOR = 2 por página (anti-flood), então
    // com um autor só a paginação nunca alcançaria o 3º post dele — e o que
    // este teste mede é chegar aos posts ANTIGOS, não furar o teto.
    //
    // Os autores entram por SQL direto: 48 cadastros pela rota HTTP levariam
    // dezenas de segundos e nada aqui depende do fluxo de cadastro.
    const POSTS_POR_AUTOR = 2;
    const autores: string[] = [];
    for (let i = 0; i < Math.ceil(totalPosts / POSTS_POR_AUTOR); i += 1) {
      const autorId = `feed-page-autor-${i}-${Math.random().toString(16).slice(2)}`;
      await run(
        ctx.db,
        `INSERT INTO users (
          id, email, password_hash, name, gender, is_verified, is_premium, is_admin,
          created_at, trial_started_at, trial_ends_at, invite_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          autorId, `${autorId}@example.com`, 'x', `Autora Paginação ${i}`, 'Mulher',
          1, 0, 0, new Date(baseTime).toISOString(), new Date(baseTime).toISOString(),
          '2099-01-01T00:00:00.000Z', 'approved',
        ]
      );
      autores.push(autorId);
    }

    for (let i = 0; i < totalPosts; i += 1) {
      const postId = `feed-page-${i}-${Math.random().toString(16).slice(2)}`;
      const createdAt = new Date(baseTime - i * 60_000).toISOString();
      expectedIds.add(postId);
      await run(
        ctx.db,
        'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [postId, autores[Math.floor(i / POSTS_POR_AUTOR)], `${marker} Feed paginado ${i}`, null, 0, createdAt]
      );
    }
    await ctx.db.persist();

    const foundIds = new Set<string>();
    let page = 1;
    let hasMore = true;
    let safety = 0;

    // O teto de páginas existe só para o teste não girar para sempre. Ele
    // precisa ser folgado: os 95 posts marcados dividem as páginas com os
    // posts que os outros testes deixaram no banco compartilhado, então o
    // número de idas é bem maior que 95/20.
    while (hasMore && safety < 40) {
      const response = await request(ctx.app)
        .get('/api/feed')
        .query({ limit: 20, page })
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const posts = Array.isArray(response.body.posts) ? response.body.posts : [];
      for (const post of posts) {
        if (String(post.content || '').includes(marker)) {
          foundIds.add(String(post.id));
        }
      }

      hasMore = Boolean(response.body.hasMore);
      page += 1;
      safety += 1;
    }

    expect(foundIds.size).toBe(totalPosts);
    for (const id of expectedIds) {
      expect(foundIds.has(id)).toBe(true);
    }
  });

  it('prioritizes nearby and affinity content before distant posts in the feed', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Feed Relevante',
      email: 'viewer-feed-relevante@example.com',
      password: 'senha123',
      gender: 'Homem',
      lookingFor: ['Mulher'],
    });
    const viewerToken = viewerReg.token;

    const nearbyAuthorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autora Perto',
      email: 'autora-perto@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const farAuthorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autora Distante',
      email: 'autora-distante@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });

    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ?, city = ?, state = ? WHERE id = ?', [-3.7319, -38.5267, 'Fortaleza', 'CE', viewerReg.user.id]);
    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ?, city = ?, state = ? WHERE id = ?', [-3.7362, -38.4966, 'Fortaleza', 'CE', nearbyAuthorReg.user.id]);
    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ?, city = ?, state = ? WHERE id = ?', [-23.5505, -46.6333, 'São Paulo', 'SP', farAuthorReg.user.id]);

    const now = Date.parse('2200-01-01T12:00:00.000Z');
    const nearbyPostId = `feed-relevant-near-${Math.random().toString(16).slice(2)}`;
    const farPostId = `feed-relevant-far-${Math.random().toString(16).slice(2)}`;
    await run(
      ctx.db,
      'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [nearbyPostId, nearbyAuthorReg.user.id, 'Perto e com afinidade', null, 0, new Date(now - 2 * 60_000).toISOString()]
    );
    await run(
      ctx.db,
      'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [farPostId, farAuthorReg.user.id, 'Longe e mais frio', null, 0, new Date(now - 60_000).toISOString()]
    );

    const conversationId = `conv-feed-${Math.random().toString(16).slice(2)}`;
    const pair = [String(viewerReg.user.id), String(nearbyAuthorReg.user.id)].sort((a, b) => a.localeCompare(b));
    await run(ctx.db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [
      conversationId,
      pair[0],
      pair[1],
      new Date(now - 30_000).toISOString(),
    ]);
    await run(ctx.db, "INSERT INTO likes (id, user_id, target_type, target_id, created_at, reaction) VALUES (?, ?, 'user', ?, ?, ?)", [
      `like-feed-${Math.random().toString(16).slice(2)}`,
      viewerReg.user.id,
      nearbyAuthorReg.user.id,
      new Date(now - 20_000).toISOString(),
      'heart',
    ]);
    await ctx.db.persist();

    const feed = await request(ctx.app)
      .get('/api/feed')
      .query({ limit: 5, page: 1 })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(Array.isArray(feed.body.posts)).toBe(true);
    expect(String(feed.body.posts[0]?.id)).toBe(nearbyPostId);
    expect(feed.body.posts[0]?.feedContext?.label).toBeTruthy();
    expect(Number(feed.body.insights?.nearbyActiveCount || 0)).toBeGreaterThanOrEqual(1);
  });

  it('reels mostram so quem casa com o interesse, do mais novo para o mais antigo', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Rap',
      email: 'viewer-rap@example.com',
      password: 'senha123',
      gender: 'Homem',
      lookingFor: ['Mulher'],
    });
    const viewerToken = viewerReg.token;

    const interestedRecentReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Mulher Recente',
      email: 'mulher-recente@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const interestedOlderReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Mulher Antiga',
      email: 'mulher-antiga@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const uninterestedNewestReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Homem Novo',
      email: 'homem-novo@example.com',
      password: 'senha123',
      gender: 'Homem',
    });

    const createReelPostAs = async (token: string, content: string) => {
      const upload = await request(ctx.app)
        .post('/api/media/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('fake video'), { filename: `${content}.mp4`, contentType: 'video/mp4' })
        .expect(200);

      const post = await request(ctx.app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({ content, mediaIds: [upload.body.id], reelsOnly: true })
        .expect(200);

      return String(post.body.id);
    };

    const interestedRecentPostId = await createReelPostAs(interestedRecentReg.token, 'Rap recente');
    const interestedOlderPostId = await createReelPostAs(interestedOlderReg.token, 'Rap antigo');
    const uninterestedNewestPostId = await createReelPostAs(uninterestedNewestReg.token, 'Rap fora do interesse');

    // Datas em 2101, depois das fixtures do teste de paginacao (que usa 2100)
    // e de tudo o mais que este arquivo grava. Todos os testes daqui dividem
    // o mesmo banco, entao um feed pedido com limit 10 e datas de 2026 vinha
    // cheio de posts de outros testes e nao chegava nestes tres.
    //
    // O que importa entre eles continua igual: 'antigo' e um dia antes de
    // 'recente', e o post fora do interesse e o mais novo dos tres — para o
    // teste poder provar que o interesse ganha da data.
    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2101-04-18T12:00:00.000Z', interestedRecentPostId]);
    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2101-04-17T12:00:00.000Z', interestedOlderPostId]);
    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2101-04-18T18:00:00.000Z', uninterestedNewestPostId]);

    const feed = await request(ctx.app)
      .get('/api/feed')
      .query({ includeReelsOnly: true, limit: 10 })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(Array.isArray(feed.body.posts)).toBe(true);

    // A afirmacao e sobre a ORDEM RELATIVA dos tres posts deste teste, nao
    // sobre quem ocupa o topo absoluto do feed.
    //
    // Todos os testes deste arquivo dividem o mesmo banco, e o de paginacao
    // cria 94 posts datados de 2100 — eles encabecam qualquer feed pedido
    // depois. Fixar as tres primeiras posicoes fazia este teste depender da
    // ordem de execucao do arquivo inteiro, e nao do comportamento que ele
    // quer provar: perfil do interesse antes dos demais, e dentro de cada
    // grupo o mais novo primeiro.
    const posicoes = new Map<string, number>(
      feed.body.posts.map((post: any, i: number) => [String(post.id), i] as [string, number])
    );

    // Perfil fora do interesse do viewer NAO aparece — e cortado no proprio
    // SQL (genderFilter), nao rebaixado na ordenacao.
    //
    // Este teste afirmava o contrario: que o post fora do interesse vinha em
    // terceiro, atras dos dois. Era o comportamento antigo. Aqui o autor fora
    // do interesse postou o mais RECENTE dos tres e mesmo assim nao entra, o
    // que prova a regra de forma mais forte do que a ordem provava.
    expect(posicoes.has(uninterestedNewestPostId)).toBe(false);

    // Entre os que casam com o interesse, o mais novo primeiro.
    expect(posicoes.has(interestedRecentPostId)).toBe(true);
    expect(posicoes.has(interestedOlderPostId)).toBe(true);
    expect(posicoes.get(interestedRecentPostId)!).toBeLessThan(posicoes.get(interestedOlderPostId)!);
  });

  it('paginates reels feed beyond 200 items without truncation', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Rap Paginação',
      email: 'viewer-rap-paginacao@example.com',
      password: 'senha123',
      gender: 'Homem',
      lookingFor: ['Mulher'],
    });
    const viewerToken = viewerReg.token;

    const authorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autora Rap Paginação',
      email: 'author-rap-paginacao@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const authorId = String(authorReg.user.id);

    const marker = '[TEST-REELS-PAGINACAO]';
    const baseTime = Date.parse('2099-04-19T12:00:00.000Z');
    for (let i = 0; i < 230; i += 1) {
      const postId = `reel-page-${i}-${Math.random().toString(16).slice(2)}`;
      const createdAt = new Date(baseTime - i * 60_000).toISOString();
      await run(
        ctx.db,
        'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [postId, authorId, `${marker} Rap paginado ${i}`, null, 1, createdAt]
      );
    }
    await ctx.db.persist();

    const foundMarkerIds = new Set<string>();
    let page = 1;
    let hasMore = true;
    let safety = 0;
    const previousPageIds = new Set<string>();

    while (hasMore && safety < 16) {
      const response = await request(ctx.app)
        .get('/api/feed')
        .query({ includeReelsOnly: true, limit: 50, page })
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      const posts = Array.isArray(response.body.posts) ? response.body.posts : [];
      expect(posts.length).toBeLessThanOrEqual(50);

      const currentPageIds = new Set<string>(posts.map((post: any) => String(post.id)));
      if (safety > 0) {
        const overlap = [...currentPageIds].some((id) => previousPageIds.has(id));
        expect(overlap).toBe(false);
      }
      previousPageIds.clear();
      for (const id of currentPageIds) previousPageIds.add(id);

      for (const post of posts) {
        if (String(post.content || '').includes(marker)) {
          foundMarkerIds.add(String(post.id));
        }
      }

      hasMore = Boolean(response.body.hasMore);
      page += 1;
      safety += 1;
    }

    expect(foundMarkerIds.size).toBe(230);
  });

  it('likes and comments generate notifications for post owner', async () => {
    const ownerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Owner',
      email: 'owner-post@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;

    const actorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Actor',
      email: 'actor-post@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const actorToken = actorReg.token;
    const actorId = actorReg.user.id as string;

    // Saber QUEM curtiu é recurso pago: para não-assinante o backend troca
    // o nome por "Alguém" e apaga o actorId da notificação (comentário não é
    // censurado, só a curtida). O dono aqui é Homem, que nasce sem trial.
    await grantPremium(ctx, ownerId);

    const post = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ content: 'Post do owner' })
      .expect(200);
    const postId = post.body.id as string;
    expect(postId).toBeTypeOf('string');

    await request(ctx.app)
      .post('/api/likes')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ targetType: 'post', targetId: postId })
      .expect(200);

    await request(ctx.app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ targetType: 'post', targetId: postId, content: 'Comentário do actor' })
      .expect(200);

    const notifs = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(Array.isArray(notifs.body)).toBe(true);
    expect(notifs.body.some((n: any) => n.type === 'post.liked' && n.data?.postId === postId && n.data?.actorId === actorId)).toBe(true);
    expect(notifs.body.some((n: any) => n.type === 'post.commented' && n.data?.postId === postId && n.data?.actorId === actorId)).toBe(true);

    const notifsActor = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${actorToken}`).expect(200);
    expect(notifsActor.body.some((n: any) => n.type === 'post.liked' || n.type === 'post.commented')).toBe(false);
    expect(ownerId).toBeTypeOf('string');
  });

  it('favoriting a user generates notification for the favorited profile', async () => {
    const targetReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Favoritado',
      email: 'favoritado@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const targetToken = targetReg.token;
    const targetId = String(targetReg.user.id);

    const actorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Favoritador',
      email: 'favoritador@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const actorToken = actorReg.token;
    const actorId = String(actorReg.user.id);

    await request(ctx.app)
      .post('/api/likes')
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ targetType: 'user', targetId })
      .expect(200);

    const targetNotifs = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${targetToken}`)
      .expect(200);

    expect(Array.isArray(targetNotifs.body)).toBe(true);
    expect(
      targetNotifs.body.some(
        (n: any) => n.type === 'profile.favorited' && n.data?.actorId === actorId
      )
    ).toBe(true);
  });

  it('private photos require approval and generate notifications', async () => {
    const ownerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dono',
      email: 'dono@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;

    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Visitante',
      email: 'visitante@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const viewerToken = viewerReg.token;
    const viewerId = viewerReg.user.id as string;

    const privUpload = await request(ctx.app)
      .post('/api/media/upload')
      .query({ isPrivate: 1 })
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'priv.png', contentType: 'image/png' })
      .expect(200);
    const privateMediaId = privUpload.body.id as string;
    expect(privateMediaId).toBeTypeOf('string');

    await request(ctx.app)
      .get(`/api/users/${ownerId}/photos`)
      .query({ visibility: 'private' })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    const reqAccess = await request(ctx.app)
      .post('/api/private-photos/requests')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ userId: ownerId })
      .expect(200);
    expect(reqAccess.body.status).toBe('pending');

    const ownerNotifs = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const notif = ownerNotifs.body.find((n: any) => n.type === 'private_photos.request');
    expect(notif).toBeTruthy();
    expect(notif.data.requesterId).toBe(viewerId);

    const pendingList = await request(ctx.app)
      .get('/api/private-photos/requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(Array.isArray(pendingList.body)).toBe(true);
    expect(pendingList.body.some((item: any) => item.id === String(notif.data.requestId) && item.status === 'pending')).toBe(true);

    await request(ctx.app)
      .post(`/api/private-photos/requests/${notif.data.requestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const approvedList = await request(ctx.app)
      .get('/api/private-photos/requests')
      .query({ status: 'approved' })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(approvedList.body.some((item: any) => item.id === String(notif.data.requestId) && item.status === 'approved')).toBe(true);

    const viewerNotifs = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${viewerToken}`).expect(200);
    expect(viewerNotifs.body.some((n: any) => n.type === 'private_photos.approved')).toBe(true);

    const privPhotos = await request(ctx.app)
      .get(`/api/users/${ownerId}/photos`)
      .query({ visibility: 'private' })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(Array.isArray(privPhotos.body)).toBe(true);
    expect(privPhotos.body.some((p: any) => p.id === privateMediaId)).toBe(true);

    const url = privPhotos.body.find((p: any) => p.id === privateMediaId).url as string;
    const fileRes = await request(ctx.app).get(url).expect(200);
    expect(String(fileRes.headers['content-type'] || '')).toContain('image/');

    await request(ctx.app)
      .post(`/api/private-photos/requests/${notif.data.requestId}/revoke`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(ctx.app)
      .get(`/api/users/${ownerId}/photos`)
      .query({ visibility: 'private' })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    const viewerNotifsAfterRevoke = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${viewerToken}`).expect(200);
    expect(viewerNotifsAfterRevoke.body.some((n: any) => n.type === 'private_photos.revoked')).toBe(true);
  });

  it('profile visits generate notification for visited user', async () => {
    const ownerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Visitado',
      email: 'perfil-visitado@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;

    const visitorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Visitante Perfil',
      email: 'visitante-perfil@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const visitorToken = visitorReg.token;
    const visitorId = visitorReg.user.id as string;

    await request(ctx.app)
      .post(`/api/users/${ownerId}/visit`)
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);

    const ownerNotifs = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const visitNotif = ownerNotifs.body.find((n: any) => n.type === 'profile.visited');
    expect(visitNotif).toBeTruthy();
    expect(visitNotif.data?.actorId).toBe(visitorId);
    expect(visitNotif.data?.actorName).toBe('Visitante Perfil');
    expect(String(visitNotif.description || '')).toContain('Visitante Perfil');

    const visitorNotifs = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${visitorToken}`)
      .expect(200);
    expect(visitorNotifs.body.some((n: any) => n.type === 'profile.visited')).toBe(false);
  });

  it('profile visit notifications respect cooldown and user settings', async () => {
    const ownerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dono Visitas',
      email: 'dono-visitas@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;
    // Ver quem visitou o perfil é rota paga, e o dono é Homem (sem trial).
    await grantPremium(ctx, ownerId);

    const visitorOneReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Visitante Um',
      email: 'visitante-um@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const visitorOneToken = visitorOneReg.token;
    const visitorOneId = visitorOneReg.user.id as string;

    await request(ctx.app)
      .post(`/api/users/${ownerId}/visit`)
      .set('Authorization', `Bearer ${visitorOneToken}`)
      .expect(200);

    await request(ctx.app)
      .post(`/api/users/${ownerId}/visit`)
      .set('Authorization', `Bearer ${visitorOneToken}`)
      .expect(200);

    const ownerNotifsAfterCooldownCheck = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const visitNotifsFromVisitorOne = ownerNotifsAfterCooldownCheck.body.filter(
      (n: any) => n.type === 'profile.visited' && n.data?.actorId === visitorOneId
    );
    expect(visitNotifsFromVisitorOne).toHaveLength(1);

    const visits = await request(ctx.app)
      .get('/api/profile/visits')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const groupedVisit = visits.body.find((item: any) => item.visitor?.id === visitorOneId);
    expect(groupedVisit).toBeTruthy();
    expect(groupedVisit.visitsCount).toBe(2);

    await request(ctx.app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ notificationVisits: false })
      .expect(200);

    const visitorTwoReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Visitante Dois',
      email: 'visitante-dois@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const visitorTwoToken = visitorTwoReg.token;
    const visitorTwoId = visitorTwoReg.user.id as string;

    await request(ctx.app)
      .post(`/api/users/${ownerId}/visit`)
      .set('Authorization', `Bearer ${visitorTwoToken}`)
      .expect(200);

    const ownerNotifsWithDisabledSetting = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      ownerNotifsWithDisabledSetting.body.some((n: any) => n.type === 'profile.visited' && n.data?.actorId === visitorTwoId)
    ).toBe(false);
  });

  it('friends requests persist and can be read', async () => {
    const regA = await registerInvitedUser(ctx, sponsorToken, { name: 'A2', email: 'a2@example.com', password: 'senha123', gender: 'Homem' });
    const tokenA = regA.token;
    const idA = regA.user.id as string;

    const regB = await registerInvitedUser(ctx, sponsorToken, { name: 'B2', email: 'b2@example.com', password: 'senha123', gender: 'Mulher' });
    const tokenB = regB.token;
    const idB = regB.user.id as string;

    const reqRes = await request(ctx.app).post('/api/friends').set('Authorization', `Bearer ${tokenA}`).send({ userId: idB }).expect(200);
    const requestId = reqRes.body.id as string;
    expect(requestId).toBeTypeOf('string');

    const bFriends1 = await request(ctx.app).get('/api/friends').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(bFriends1.body.incoming.some((r: any) => r.id === requestId && r.fromUser?.id === idA)).toBe(true);

    await request(ctx.app).post(`/api/friends/${requestId}/respond`).set('Authorization', `Bearer ${tokenB}`).send({ accept: true }).expect(200);

    const aFriends2 = await request(ctx.app).get('/api/friends').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(aFriends2.body.friends.some((f: any) => f.id === idB)).toBe(true);

    const bFriends2 = await request(ctx.app).get('/api/friends').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(bFriends2.body.friends.some((f: any) => f.id === idA)).toBe(true);
  });

  it('lists conversations after sending a message', async () => {
    const regA = await registerInvitedUser(ctx, sponsorToken, {
      name: 'ConvA',
      email: 'conva@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const tokenA = regA.token;
    const idA = regA.user.id as string;

    const regB = await registerInvitedUser(ctx, sponsorToken, {
      name: 'ConvB',
      email: 'convb@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const tokenB = regB.token;
    const idB = regB.user.id as string;

    // Abrir conversa é rota paga, e ConvA é Homem (sem trial).
    await grantPremium(ctx, idA);

    const conv = await request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userId: idB })
      .expect(200);
    const conversationId = conv.body.id as string;

    await request(ctx.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Oi, tudo bem?' })
      .expect(200);

    const list = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((c: any) => c.id === conversationId && c.user?.id === idA)).toBe(true);
  });

  it('search endpoint returns other active profiles for authenticated user', async () => {
    const viewerReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'BuscaViewer',
      email: 'busca-viewer@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });
    const viewerToken = viewerReg.token;
    const viewerId = String(viewerReg.user.id);

    const targetReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'BuscaTarget',
      email: 'busca-target@example.com',
      password: 'senha123',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });
    const targetId = String(targetReg.user.id);

    const response = await request(ctx.app)
      .get('/api/users')
      .query({ search: 'BuscaTarget', limit: 20, page: 1 })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(Array.isArray(response.body?.users)).toBe(true);
    expect(response.body.users.some((u: any) => String(u.id) === targetId)).toBe(true);
    expect(response.body.users.some((u: any) => String(u.id) === viewerId)).toBe(false);
  });

  it('allows highlighting a conversation with note and prioritizes it in list', async () => {
    const regA = await registerInvitedUser(ctx, sponsorToken, {
      name: 'DestA',
      email: 'desta@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const tokenA = regA.token;

    const regB = await registerInvitedUser(ctx, sponsorToken, {
      name: 'DestB',
      email: 'destb@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const idB = regB.user.id as string;

    const regC = await registerInvitedUser(ctx, sponsorToken, {
      name: 'DestC',
      email: 'destc@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const idC = regC.user.id as string;

    // Abrir conversa é rota paga, e DestA é Homem (sem trial).
    await grantPremium(ctx, String(regA.user.id));

    const convAB = await request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userId: idB })
      .expect(200);

    const convAC = await request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userId: idC })
      .expect(200);

    await request(ctx.app)
      .post(`/api/conversations/${convAC.body.id}/messages`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ content: 'Mensagem recente' })
      .expect(200);

    await request(ctx.app)
      .patch(`/api/conversations/${convAB.body.id}/highlight`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ highlighted: true, note: 'chamar em Fortaleza', color: 'violet' })
      .expect(200);

    const list = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body[0]?.id).toBe(convAB.body.id);
    expect(list.body[0]?.isHighlighted).toBe(true);
    expect(list.body[0]?.highlightNote).toBe('chamar em Fortaleza');
    expect(list.body[0]?.highlightColor).toBe('violet');
  });

  it('premium users can create events with notifications enabled', async () => {
    const hostReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'EventoA',
      email: 'eventoa@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });
    const hostToken = hostReg.token;
    const hostId = hostReg.user.id as string;

    const guestReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'EventoB',
      email: 'eventob@example.com',
      password: 'senha123',
      gender: 'Mulher',
      city: 'Fortaleza',
      state: 'CE',
    });
    const guestToken = guestReg.token;
    const guestId = guestReg.user.id as string;

    await request(ctx.app)
      .put('/api/location')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ lat: -3.7319, lng: -38.5267 })
      .expect(200);

    await request(ctx.app)
      .put('/api/location')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ lat: -3.7325, lng: -38.527 })
      .expect(200);

    await request(ctx.app)
      .post('/api/subscriptions/checkout')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ planId: 'premium_monthly' })
      .expect(200);

    const created = await request(ctx.app)
      .post('/api/events')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Encontro teste',
        location: 'Fortaleza',
        notificationSettings: {
          enabled: true,
          targetCities: ['Fortaleza, CE'],
          radius: 10,
        },
      })
      .expect(200);

    expect(created.body.id).toBeTypeOf('string');
    expect(created.body.notificationsSent).toBeGreaterThanOrEqual(1);

    const guestNotifs = await request(ctx.app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(guestNotifs.body.some((n: any) => n.type === 'event_invitation')).toBe(true);

    const guestConversations = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${guestToken}`)
      .expect(200);
    expect(guestConversations.body.some((c: any) => c.user?.id === hostId)).toBe(true);

    expect(guestId).toBeTypeOf('string');
  });

  it('radar delivers, marks view and opens conversation from the received alert', async () => {
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'Fortaleza',
      'fortaleza',
      'CE',
      -3.7319,
      -38.5267,
    ]);

    const sender = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Casal Radar',
      email: 'radar-casal@example.com',
      password: 'senha123',
      gender: 'Casal (Ele/Ela)',
      city: 'Fortaleza',
      state: 'CE',
    });

    const viewer = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Radar',
      email: 'radar-viewer@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });

    // Radar e leitura de mensagem são rotas pagas, e o viewer é Homem (sem
    // trial). Sem isto o conteúdo da mensagem chega censurado, que é o
    // comportamento testado em "expired users can view chat with locked
    // incoming messages" — não o deste teste.
    await grantPremium(ctx, String(viewer.user.id));

    await request(ctx.app)
      .post('/api/radar')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({
        city: 'Fortaleza',
        state: 'CE',
        message: 'Casal na cidade hoje querendo conversar com calma.',
        targetGender: ['male'],
        radius: 25,
        durationHours: 1,
        isAnonymous: false,
        showOnlyOnline: false,
      })
      .expect(200);

    const incoming = await request(ctx.app).get('/api/radar').set('Authorization', `Bearer ${viewer.token}`).expect(200);
    expect(Array.isArray(incoming.body.incoming)).toBe(true);
    expect(incoming.body.incoming.length).toBeGreaterThan(0);
    expect(incoming.body.incoming[0].message).toContain('Casal na cidade');
    expect(typeof incoming.body.incoming[0].zoneLabel).toBe('string');
    expect(Array.isArray(incoming.body.heatmap?.zones)).toBe(true);
    expect(Number(incoming.body.heatmap?.totalActive || 0)).toBeGreaterThanOrEqual(1);

    const viewerConversations = await request(ctx.app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    const radarConversation = viewerConversations.body.find((c: any) => c?.user?.id === sender.user.id);
    expect(radarConversation?.id).toBeTypeOf('string');

    const viewerMessages = await request(ctx.app)
      .get(`/api/conversations/${radarConversation.id}/messages`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(Array.isArray(viewerMessages.body)).toBe(true);
    expect(
      viewerMessages.body.some((m: any) => m.senderId === sender.user.id && String(m.content || '').includes('Casal na cidade hoje'))
    ).toBe(true);

    const contact = await request(ctx.app)
      .post(`/api/radar/${incoming.body.incoming[0].id}/contact`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(contact.body.conversationId).toBeTypeOf('string');
    expect(contact.body.conversationId).toBe(radarConversation.id);

    const mine = await request(ctx.app).get('/api/radar').set('Authorization', `Bearer ${sender.token}`).expect(200);
    expect(mine.body.myBroadcasts[0].deliveriesCount).toBeGreaterThanOrEqual(1);
    expect(mine.body.myBroadcasts[0].viewsCount).toBeGreaterThanOrEqual(1);
    expect(mine.body.myBroadcasts[0].responsesCount).toBeGreaterThanOrEqual(1);
    expect(
      mine.body.myBroadcasts[0].deliveries.some((entry: any) => entry.viewer.name === 'Viewer Radar' && !!entry.viewedAt && !!entry.contactedAt)
    ).toBe(true);
  });

  it('returns radar highlights for nearby compatible users without needing to open the radar page', async () => {
    await run(ctx.db, 'INSERT INTO cities (name, name_norm, state, lat, lon) VALUES (?, ?, ?, ?, ?)', [
      'Fortaleza',
      'fortaleza',
      'CE',
      -3.7319,
      -38.5267,
    ]);

    const sender = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Radar Destaque',
      email: 'radar-destaque@example.com',
      password: 'senha123',
      gender: 'Casal (Ele/Ela)',
      city: 'Fortaleza',
      state: 'CE',
    });

    const viewer = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Highlight',
      email: 'radar-highlight-viewer@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });

    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ? WHERE id = ?', [-3.732, -38.5269, sender.user.id]);
    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ? WHERE id = ?', [-3.735, -38.52, viewer.user.id]);

    await request(ctx.app)
      .post('/api/radar')
      .set('Authorization', `Bearer ${sender.token}`)
      .send({
        city: 'Fortaleza',
        state: 'CE',
        message: 'Radar quente perto de você agora.',
        targetGender: ['male'],
        radius: 25,
        durationHours: 1,
        isAnonymous: false,
        showOnlyOnline: false,
      })
      .expect(200);

    const highlights = await request(ctx.app)
      .get('/api/radar/highlights')
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);

    expect(Array.isArray(highlights.body.highlights)).toBe(true);
    expect(highlights.body.highlights.length).toBeGreaterThan(0);
    expect(highlights.body.highlights[0].message).toContain('Radar quente perto de você');
    expect(Number(highlights.body.highlights[0].distanceKm || 0)).toBeGreaterThanOrEqual(0);
  });

  it('allows the logged device to subscribe and unsubscribe from push notifications', async () => {
    const invited = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Push User',
      email: 'push-user@example.com',
      password: 'senha123',
      gender: 'Homem',
    });

    const publicKey = await request(ctx.app)
      .get('/api/push/public-key')
      .set('Authorization', `Bearer ${invited.token}`)
      .expect(200);
    expect(typeof publicKey.body.publicKey).toBe('string');
    expect(publicKey.body.publicKey.length).toBeGreaterThan(20);

    const endpoint = 'https://push.example.com/subscriptions/device-1';
    await request(ctx.app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${invited.token}`)
      .send({
        endpoint,
        expirationTime: null,
        keys: {
          p256dh: 'BExampleP256dhValue123456789',
          auth: 'AuthValue123',
        },
      })
      .expect(200);

    const stored = await ctx.db.queryOne('SELECT user_id, endpoint FROM push_subscriptions WHERE endpoint = ? LIMIT 1', [endpoint]);
    expect((stored as any)?.user_id).toBe(invited.user.id);
    expect((stored as any)?.endpoint).toBe(endpoint);

    await request(ctx.app)
      .post('/api/push/unsubscribe')
      .set('Authorization', `Bearer ${invited.token}`)
      .send({ endpoint })
      .expect(200);

    const removed = await ctx.db.queryOne('SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1', [endpoint]);
    expect(removed).toBeNull();
  });
  // ── Stories: favoritos e perfis fixados ───────────────────────────────────
  //
  // As duas listas apontam para lados opostos e é fácil trocá-las ao mexer no
  // feed de stories, então os testes prendem exatamente essa diferença:
  //
  //   favoritos → quem PODE VER o meu story restrito (muda permissão)
  //   fixados   → quem eu vejo primeiro (muda só a minha ordem)
  it('story de favoritos so aparece para quem esta na lista', async () => {
    const autor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Favoritos', email: 'autor-fav@example.com', password: 'senha123', gender: 'Homem',
    });
    const amigo = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Amigo Favorito', email: 'amigo-fav@example.com', password: 'senha123', gender: 'Homem',
    });
    const estranho = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Estranho', email: 'estranho-fav@example.com', password: 'senha123', gender: 'Homem',
    });

    // Só quem o autor curtiu pode entrar na lista de favoritos.
    await request(ctx.app)
      .post('/api/likes')
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ targetType: 'user', targetId: amigo.user.id })
      .expect(200);

    const candidatos = await request(ctx.app)
      .get('/api/story-favorites')
      .set('Authorization', `Bearer ${autor.token}`)
      .expect(200);
    expect(candidatos.body.candidates.map((c: any) => c.id)).toContain(amigo.user.id);
    expect(candidatos.body.candidates.map((c: any) => c.id)).not.toContain(estranho.user.id);

    // Publicar restrito sem ninguém na lista é recusado: seria um story que
    // ninguém vê, e quase certamente não é o que a pessoa quis fazer.
    await request(ctx.app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ text: 'ninguem ve', background: 'sunset', audience: 'favorites', favoriteIds: [] })
      .expect(400);

    const criado = await request(ctx.app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ text: 'so para os favoritos', background: 'sunset', audience: 'favorites', favoriteIds: [amigo.user.id] })
      .expect(200);
    expect(criado.body.audience).toBe('favorites');

    const doAmigo = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${amigo.token}`)
      .expect(200);
    const visto = doAmigo.body.stories.find((st: any) => st.id === criado.body.id);
    expect(visto).toBeTruthy();
    expect(visto.audience).toBe('favorites');

    const doEstranho = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${estranho.token}`)
      .expect(200);
    expect(doEstranho.body.stories.some((st: any) => st.id === criado.body.id)).toBe(false);

    // O id sozinho não abre o story: ver e curtir também checam a lista.
    await request(ctx.app)
      .post(`/api/stories/${criado.body.id}/view`)
      .set('Authorization', `Bearer ${estranho.token}`)
      .send({})
      .expect(403);
    await request(ctx.app)
      .post(`/api/stories/${criado.body.id}/like`)
      .set('Authorization', `Bearer ${estranho.token}`)
      .send({})
      .expect(403);

    // Tirar da lista tira o acesso ao story que já está no ar — a permissão é
    // lida na hora, não congelada no momento do post.
    await request(ctx.app)
      .put('/api/story-favorites')
      .set('Authorization', `Bearer ${autor.token}`)
      .send({ favoriteIds: [] })
      .expect(200);

    const depois = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${amigo.token}`)
      .expect(200);
    expect(depois.body.stories.some((st: any) => st.id === criado.body.id)).toBe(false);
  });

  it('perfil fixado vem primeiro e nao muda quem pode ver', async () => {
    const comum = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Comum', email: 'autor-comum@example.com', password: 'senha123', gender: 'Homem',
    });
    const fixado = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Fixado', email: 'autor-fixado@example.com', password: 'senha123', gender: 'Homem',
    });
    const fa = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Fa', email: 'fa-stories@example.com', password: 'senha123', gender: 'Homem',
    });

    // O fixado posta ANTES, então sem o pin ele ficaria atrás do mais recente.
    const storyFixado = await request(ctx.app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${fixado.token}`)
      .send({ text: 'do perfil fixado', background: 'sunset' })
      .expect(200);
    const storyComum = await request(ctx.app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${comum.token}`)
      .send({ text: 'do perfil comum', background: 'sunset' })
      .expect(200);

    const antes = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${fa.token}`)
      .expect(200);
    const posAntes = (id: string) => antes.body.stories.findIndex((st: any) => st.id === id);
    expect(posAntes(storyComum.body.id)).toBeLessThan(posAntes(storyFixado.body.id));

    const pin = await request(ctx.app)
      .post('/api/story-pins')
      .set('Authorization', `Bearer ${fa.token}`)
      .send({ userId: fixado.user.id })
      .expect(200);
    expect(pin.body.pinned).toBe(true);

    const depois = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${fa.token}`)
      .expect(200);
    expect(depois.body.stories[0].id).toBe(storyFixado.body.id);
    expect(depois.body.stories[0].author.pinnedByMe).toBe(true);
    // Fixar não é curtir: o filtro "que eu curti" continua sem este perfil.
    expect(depois.body.stories[0].author.likedByMe).toBe(false);

    // Fixar é privado: não muda nada na fileira de quem foi fixado.
    const daVisaoDoFixado = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${fixado.token}`)
      .expect(200);
    expect(daVisaoDoFixado.body.stories.every((st: any) => st.author.pinnedByMe === false)).toBe(true);

    // O mesmo endpoint desfixa.
    const desfaz = await request(ctx.app)
      .post('/api/story-pins')
      .set('Authorization', `Bearer ${fa.token}`)
      .send({ userId: fixado.user.id })
      .expect(200);
    expect(desfaz.body.pinned).toBe(false);

    const semPin = await request(ctx.app)
      .get('/api/stories')
      .set('Authorization', `Bearer ${fa.token}`)
      .expect(200);
    expect(semPin.body.stories[0].id).toBe(storyComum.body.id);
  });

  it('quem foi fixado ve a lista de fas, e so ele', async () => {
    const idolo = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Idolo', email: 'idolo-fas@example.com', password: 'senha123', gender: 'Mulher',
    });
    const fa = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Fa Numero Um', email: 'fa-numero-um@example.com', password: 'senha123', gender: 'Homem',
    });
    const terceiro = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Terceiro', email: 'terceiro-fas@example.com', password: 'senha123', gender: 'Mulher',
    });

    await request(ctx.app)
      .post('/api/story-pins')
      .set('Authorization', `Bearer ${fa.token}`)
      .send({ userId: idolo.user.id })
      .expect(200);

    const lista = await request(ctx.app)
      .get('/api/story-fans')
      .set('Authorization', `Bearer ${idolo.token}`)
      .expect(200);
    expect(lista.body.fans.map((x: any) => x.id)).toContain(fa.user.id);

    // A lista é de quem fixou VOCÊ. Ninguém mais enxerga esse vínculo.
    const doTerceiro = await request(ctx.app)
      .get('/api/story-fans')
      .set('Authorization', `Bearer ${terceiro.token}`)
      .expect(200);
    expect(doTerceiro.body.fans.map((x: any) => x.id)).not.toContain(fa.user.id);

    // Desfixar tira da lista na hora.
    await request(ctx.app)
      .post('/api/story-pins')
      .set('Authorization', `Bearer ${fa.token}`)
      .send({ userId: idolo.user.id })
      .expect(200);

    const depois = await request(ctx.app)
      .get('/api/story-fans')
      .set('Authorization', `Bearer ${idolo.token}`)
      .expect(200);
    expect(depois.body.fans.map((x: any) => x.id)).not.toContain(fa.user.id);

    // Ver a lista é pago, igual a ver quem assistiu ao story. O fã é Homem,
    // que nasce sem trial, então serve de caso não-assinante.
    await request(ctx.app)
      .get('/api/story-fans')
      .set('Authorization', `Bearer ${fa.token}`)
      .expect(403);
  });

  // ── Comissao de promotor: renovacao paga gera comissao nova ───────────────
  //
  // O bug que este teste existe para nunca mais voltar: ensurePromoterCommission
  // checava so subscriber_user_id, sem periodo. O promotor ganhava UMA comissao
  // por assinante para sempre, e toda renovacao era descartada em silencio —
  // enquanto a landing prometia "20% via Pix todo mes".
  it('renovacao paga gera comissao nova, e o mesmo evento repetido nao', async () => {
    const promotor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Promotor Renovacao', email: 'promotor-renov@example.com', password: 'senha123', gender: 'Mulher',
    });
    await run(
      ctx.db,
      `INSERT INTO promoters (id, user_id, full_name, pix_key, status, accepted_terms_at, activated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `promoter-renov-${Date.now()}`, String(promotor.user.id), 'Promotor Renovacao',
        'promotor-renov@example.com', 'active',
        new Date().toISOString(), new Date().toISOString(), new Date().toISOString(),
      ]
    );

    // Assinante convidado PELO promotor: e o vinculo que a comissao usa
    // (invite_link_entries -> invite_links.inviter_user_id).
    const assinante = await registerInvitedUser(ctx, promotor.token, {
      name: 'Assinante Renovacao', email: 'assinante-renov@example.com', password: 'senha123', gender: 'Homem',
    });
    const hubCustomerId = 'cus-renov-teste';
    await run(ctx.db, 'UPDATE users SET hub_customer_id = ? WHERE id = ?', [hubCustomerId, String(assinante.user.id)]);

    const pagamento = async () => {
      const corpo = { customerId: hubCustomerId, payload: { amount: 990 } };
      const bruto = JSON.stringify(corpo);
      const assinatura = createHmac('sha256', HUB_WEBHOOK_SECRET_TESTE).update(Buffer.from(bruto)).digest('hex');
      await request(ctx.app)
        .post('/api/webhooks/hub-billing')
        .set('x-hub-event', 'payment.approved')
        .set('x-hub-signature', `sha256=${assinatura}`)
        .set('Content-Type', 'application/json')
        .send(corpo)
        .expect(200);
    };

    // O webhook responde antes de processar (para o gateway nao dar timeout),
    // entao o teste espera o efeito aparecer no banco em vez de assumir que ja
    // aconteceu quando o 200 voltou.
    const contarComissoes = async () => {
      const row = (await ctx.db.queryOne(
        'SELECT COUNT(*) AS c FROM promoter_commissions WHERE subscriber_user_id = ?',
        [String(assinante.user.id)]
      )) as any;
      return Number(row?.c || 0);
    };
    const esperarComissoes = async (quantas: number) => {
      for (let i = 0; i < 40; i += 1) {
        if ((await contarComissoes()) >= quantas) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(await contarComissoes()).toBe(quantas);
    };

    await pagamento();
    await esperarComissoes(1);

    // Mesmo evento de novo dentro do mesmo mes: continua uma so. E o que
    // protege contra reentrega de webhook pelo gateway.
    await pagamento();
    await new Promise((r) => setTimeout(r, 250));
    expect(await contarComissoes()).toBe(1);

    // Vira o mes: em vez de mexer no relogio, envelhecemos a comissao que
    // existe. O proximo pagamento cai num periodo em que nao ha comissao.
    await run(
      ctx.db,
      "UPDATE promoter_commissions SET period = '2020-01' WHERE subscriber_user_id = ?",
      [String(assinante.user.id)]
    );

    await pagamento();
    await esperarComissoes(2);

    const total = (await ctx.db.queryOne(
      'SELECT SUM(commission_amount) AS s FROM promoter_commissions WHERE subscriber_user_id = ?',
      [String(assinante.user.id)]
    )) as any;
    // 20% de R$ 9,90 em cada um dos dois meses.
    expect(Number(total?.s || 0)).toBe(396);
  });

  // ── Comunicado unico sobre o pagamento de comissao ────────────────────────
  it('comunicado de regras: previa nao envia, e cada promotor recebe uma unica vez', async () => {
    const admin = await createBootstrapSponsor(ctx, { email: 'admin-comunicado@example.com', name: 'Admin Comunicado' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.id]);

    const promotor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Promotor Comunicado', email: 'promotor-comunicado@example.com', password: 'senha123', gender: 'Mulher',
    });
    const promotorId = String(promotor.user.id);
    const agora = new Date().toISOString();
    await run(
      ctx.db,
      `INSERT INTO promoters (id, user_id, full_name, pix_key, status, accepted_terms_at, activated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`promoter-comunicado-${Date.now()}`, promotorId, 'Promotor Comunicado', 'pix-comunicado', 'active', agora, agora, agora]
    );
    // Uma comissao aprovada normal e uma do retroativo.
    await run(
      ctx.db,
      `INSERT INTO promoter_commissions (id, promoter_user_id, subscriber_user_id, subscription_amount, commission_amount, status, period, event_type, created_at)
       VALUES (?, ?, ?, 990, 198, 'approved', '2026-08', 'payment.approved', ?),
              (?, ?, ?, 990, 198, 'approved', '2026-09', 'backfill_renovacao', ?)`,
      [`c1-${Date.now()}`, promotorId, 'assinante-x', agora, `c2-${Date.now()}`, promotorId, 'assinante-x', agora]
    );

    const contarAvisos = async () => Number(((await ctx.db.queryOne(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'promoter.rules_notice'",
      [promotorId]
    )) as any)?.c || 0);

    const previa = await request(ctx.app)
      .post('/api/admin/promoters/send-rules-notice')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ dryRun: true })
      .expect(200);
    const linha = previa.body.promotores.find((p: any) => p.userId === promotorId);
    expect(linha.saldoCents).toBe(396);
    expect(linha.creditadoCents).toBe(198);
    expect(linha.textoNoApp).toContain('R$ 1,98 de renovações');
    expect(linha.textoNoApp).toContain('R$ 10,00');
    // A previa nao pode ter enviado nada.
    expect(await contarAvisos()).toBe(0);

    const envio = await request(ctx.app)
      .post('/api/admin/promoters/send-rules-notice')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(200);
    expect(envio.body.enviados).toBeGreaterThanOrEqual(1);
    expect(await contarAvisos()).toBe(1);

    // Segundo clique: ninguem recebe de novo.
    const repetido = await request(ctx.app)
      .post('/api/admin/promoters/send-rules-notice')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({})
      .expect(200);
    expect(repetido.body.enviados).toBe(0);
    expect(await contarAvisos()).toBe(1);

    // Rota de admin.
    await request(ctx.app)
      .post('/api/admin/promoters/send-rules-notice')
      .set('Authorization', `Bearer ${promotor.token}`)
      .send({ dryRun: true })
      .expect(403);
  });

  // ── Match: conta desativada some da area de Match ─────────────────────────
  it('match nao mostra perfil desativado, nem na lista de curtidos, e recusa curtir', async () => {
    const eu = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Matcher Desativados', email: 'matcher-desativados@example.com', password: 'senha123',
      birthDate: '1990-01-01', gender: 'Homem', city: 'Fortaleza', state: 'CE',
    });
    const ativa = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Ativo Match', email: 'perfil-ativo-match@example.com', password: 'senha123',
      birthDate: '1994-01-01', gender: 'Mulher', city: 'Fortaleza', state: 'CE',
    });
    const curtidaAntes = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Curtida Depois Desativada', email: 'curtida-desativada@example.com', password: 'senha123',
      birthDate: '1994-01-01', gender: 'Mulher', city: 'Fortaleza', state: 'CE',
    });
    const desativada = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Perfil Desativado Match', email: 'perfil-desativado-match@example.com', password: 'senha123',
      birthDate: '1994-01-01', gender: 'Mulher', city: 'Fortaleza', state: 'CE',
    });

    // Curti enquanto ainda estava ativa.
    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${eu.token}`)
      .send({ userId: curtidaAntes.user.id })
      .expect(200);

    await run(ctx.db, 'UPDATE users SET is_deactivated = 1 WHERE id IN (?, ?)', [
      String(desativada.user.id), String(curtidaAntes.user.id),
    ]);

    const cards = await request(ctx.app).get('/api/match/cards').set('Authorization', `Bearer ${eu.token}`).expect(200);
    const idsNosCards = cards.body.map((u: any) => String(u.id));
    expect(idsNosCards).toContain(String(ativa.user.id));
    expect(idsNosCards).not.toContain(String(desativada.user.id));

    const curtidos = await request(ctx.app).get('/api/match/liked').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(curtidos.body.map((u: any) => String(u.id))).not.toContain(String(curtidaAntes.user.id));

    // Card que ficou aberto na tela antes da desativacao nao gera match.
    await request(ctx.app)
      .post('/api/match/like')
      .set('Authorization', `Bearer ${eu.token}`)
      .send({ userId: desativada.user.id })
      .expect(404);

    // Reativou: volta aos curtidos sozinho, porque a curtida nao foi apagada.
    await run(ctx.db, 'UPDATE users SET is_deactivated = 0 WHERE id = ?', [String(curtidaAntes.user.id)]);
    const depois = await request(ctx.app).get('/api/match/liked').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(depois.body.map((u: any) => String(u.id))).toContain(String(curtidaAntes.user.id));
  });

  // ── Match: atividade recente reordena dentro da faixa de proximidade ──────
  it('match mostra primeiro quem esta ativo, sem passar na frente da proximidade', async () => {
    const eu = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Viewer Atividade', email: 'viewer-atividade@example.com', password: 'senha123',
      birthDate: '1990-01-01', gender: 'Homem', city: 'Fortaleza', state: 'CE', lookingFor: ['Mulher'],
    });
    const cria = async (nome: string, email: string) => registerInvitedUser(ctx, sponsorToken, {
      name: nome, email, password: 'senha123', birthDate: '1994-01-01', gender: 'Mulher', city: 'Fortaleza', state: 'CE',
    });
    // Cadastrada POR ULTIMO de proposito: antes, "cadastro mais recente" era o
    // desempate e ela vinha na frente mesmo sumida.
    const ativa24h = await cria('Ativa 24h', 'ativa-24h@example.com');
    const ativa7d = await cria('Ativa 7d', 'ativa-7d@example.com');
    const distanteAtiva = await cria('Distante Ativa', 'distante-ativa@example.com');
    const sumida = await cria('Sumida', 'sumida@example.com');

    const horas = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const fortaleza = { lat: -3.7319, lon: -38.5267 };
    await run(ctx.db, 'UPDATE users SET lat = ?, lon = ? WHERE id IN (?, ?, ?, ?)', [
      fortaleza.lat, fortaleza.lon, String(eu.user.id), String(ativa24h.user.id), String(ativa7d.user.id), String(sumida.user.id),
    ]);
    // Porto Alegre: outra faixa de distancia, mesmo estando ativa agora.
    await run(ctx.db, "UPDATE users SET lat = -30.0346, lon = -51.2177, state = 'RS', city = 'Porto Alegre' WHERE id = ?", [String(distanteAtiva.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [horas(2), String(ativa24h.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [horas(72), String(ativa7d.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [horas(1), String(distanteAtiva.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [horas(24 * 60), String(sumida.user.id)]);

    const cards = await request(ctx.app).get('/api/match/cards').set('Authorization', `Bearer ${eu.token}`).expect(200);
    const pos = (id: string) => cards.body.findIndex((u: any) => String(u.id) === id);

    const p24 = pos(String(ativa24h.user.id));
    const p7 = pos(String(ativa7d.user.id));
    const pSumida = pos(String(sumida.user.id));
    const pDistante = pos(String(distanteAtiva.user.id));
    for (const p of [p24, p7, pSumida, pDistante]) expect(p).toBeGreaterThanOrEqual(0);

    // Dentro de Fortaleza: 24h -> 7 dias -> sumida.
    expect(p24).toBeLessThan(p7);
    expect(p7).toBeLessThan(pSumida);
    // Proximidade manda: a sumida de Fortaleza ainda vem antes da ativa de Porto Alegre.
    expect(pSumida).toBeLessThan(pDistante);
  });

  // ── Notificações: miniatura, avatar e post aberto direto ──────────────────
  it('notificacao de curtida traz miniatura do post e o post abre direto por id', async () => {
    const dona = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dona do Post Notif', email: 'dona-post-notif@example.com', password: 'senha123', gender: 'Mulher',
    });
    const fa = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Curtidor Notif', email: 'curtidor-notif@example.com', password: 'senha123', gender: 'Mulher',
    });
    // Quem curte precisa ter avatar para o card mostrar o rosto.
    const avatarUp = await request(ctx.app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${fa.token}`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'avatar.png', contentType: 'image/png' })
      .expect(200);
    await request(ctx.app).patch(`/api/media/${avatarUp.body.id}/main`).set('Authorization', `Bearer ${fa.token}`).expect(200);

    const foto = await request(ctx.app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${dona.token}`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), { filename: 'post.png', contentType: 'image/png' })
      .expect(200);
    const post = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${dona.token}`)
      .send({ content: 'Post com foto para a notificacao', mediaIds: [foto.body.id] })
      .expect(200);
    const postId = String(post.body.id);

    await request(ctx.app)
      .post('/api/likes')
      .set('Authorization', `Bearer ${fa.token}`)
      .send({ targetType: 'post', targetId: postId })
      .expect(200);

    // Dona precisa ser premium para ver quem curtiu (senao o autor e censurado).
    await grantPremium(ctx, String(dona.user.id));

    const lista = await request(ctx.app).get('/api/notifications?preview=1').set('Authorization', `Bearer ${dona.token}`).expect(200);
    const n = lista.body.find((x: any) => x.type === 'post.liked' && x.data?.postId === postId);
    expect(n).toBeTruthy();
    expect(n.preview?.imageUrl).toMatch(/^\/uploads\//);
    expect(n.preview?.removed).toBe(false);
    expect(n.actorAvatar).toMatch(/^\/uploads\//);

    // O sino usa o contador leve; a lista sem ?preview=1 nao paga as consultas de miniatura.
    const sino = await request(ctx.app).get('/api/notifications/unread').set('Authorization', `Bearer ${dona.token}`).expect(200);
    expect(sino.body.count).toBeGreaterThanOrEqual(1);
    const semPreview = await request(ctx.app).get('/api/notifications').set('Authorization', `Bearer ${dona.token}`).expect(200);
    expect(semPreview.body.find((x: any) => x.data?.postId === postId)?.preview).toBeUndefined();

    // O post abre direto, com contagem e autor.
    const aberto = await request(ctx.app).get(`/api/posts/${postId}`).set('Authorization', `Bearer ${dona.token}`).expect(200);
    expect(aberto.body.post.id).toBe(postId);
    expect(aberto.body.post.likesCount).toBe(1);
    expect(aberto.body.post.media.length).toBe(1);
    expect(aberto.body.post.author.id).toBe(String(dona.user.id));

    // Apagado: a notificacao avisa que sumiu, e a rota responde 404.
    await run(ctx.db, 'DELETE FROM posts WHERE id = ?', [postId]);
    const depois = await request(ctx.app).get('/api/notifications?preview=1').set('Authorization', `Bearer ${dona.token}`).expect(200);
    const n2 = depois.body.find((x: any) => x.type === 'post.liked' && x.data?.postId === postId);
    expect(n2.preview?.removed).toBe(true);
    await request(ctx.app).get(`/api/posts/${postId}`).set('Authorization', `Bearer ${dona.token}`).expect(404);
  });

  // ── Match: "passar" duplicado nao pode derrubar o servidor ─────────────────
  it('dois passar simultaneos no mesmo perfil respondem ok e gravam uma vez so', async () => {
    const eu = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Passador Duplo', email: 'passador-duplo@example.com', password: 'senha123', gender: 'Homem',
    });
    const alvo = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Alvo Passado', email: 'alvo-passado@example.com', password: 'senha123', gender: 'Mulher',
    });
    // Toque duplo: as duas chamadas saem antes de qualquer resposta. Entre
    // 14 e 15/09/2026 a segunda violava a chave unica e derrubava o backend.
    const passar = () => request(ctx.app)
      .post('/api/match/pass')
      .set('Authorization', `Bearer ${eu.token}`)
      .send({ userId: alvo.user.id });
    const [a, b] = await Promise.all([passar(), passar()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const linhas = (await ctx.db.queryOne(
      'SELECT COUNT(*) AS c FROM match_passes WHERE user_id = ? AND passed_user_id = ?',
      [String(eu.user.id), String(alvo.user.id)]
    )) as any;
    expect(Number(linhas?.c || 0)).toBe(1);
  });

  // ── Editar a propria publicacao ────────────────────────────────────────────
  it('dono edita o texto do post; outra pessoa nao; post sem midia nao fica vazio', async () => {
    const dono = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dono Edicao', email: 'dono-edicao@example.com', password: 'senha123', gender: 'Mulher',
    });
    const outro = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Outro Edicao', email: 'outro-edicao@example.com', password: 'senha123', gender: 'Mulher',
    });
    const post = await request(ctx.app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ content: 'Texto original' })
      .expect(200);
    const postId = String(post.body.id);

    const editado = await request(ctx.app)
      .patch(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ content: '  Texto corrigido  ' })
      .expect(200);
    expect(editado.body.content).toBe('Texto corrigido');

    const aberto = await request(ctx.app).get(`/api/posts/${postId}`).set('Authorization', `Bearer ${dono.token}`).expect(200);
    expect(aberto.body.post.content).toBe('Texto corrigido');

    await request(ctx.app)
      .patch(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${outro.token}`)
      .send({ content: 'invasao' })
      .expect(403);

    // Post so de texto: apagar o texto deixaria uma publicacao vazia.
    await request(ctx.app)
      .patch(`/api/posts/${postId}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ content: '   ' })
      .expect(400);
  });

  // ── Conversa criada duas vezes ao mesmo tempo ──────────────────────────────
  it('duas criacoes simultaneas da mesma conversa devolvem o mesmo id', async () => {
    const a = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Conversa Dupla A', email: 'conversa-dupla-a@example.com', password: 'senha123', gender: 'Mulher',
    });
    const b = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Conversa Dupla B', email: 'conversa-dupla-b@example.com', password: 'senha123', gender: 'Mulher',
    });
    const criar = () => request(ctx.app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ userId: b.user.id });
    const [r1, r2] = await Promise.all([criar(), criar()]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.id).toBeTruthy();
    expect(r1.body.id).toBe(r2.body.id);
  });
  // ── Suporte: pedir atendente humano ─────────────────────────────────────────
  it('cliente pede atendente: conversa fica com a equipe ate alguem responder', async () => {
    const cliente = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Cliente Atendente', email: 'cliente-atendente@example.com', password: 'senha123', gender: 'Mulher',
    });
    const equipe = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Equipe Atendente', email: 'equipe-atendente@example.com', password: 'senha123', gender: 'Homem',
    });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [equipe.user.id]);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const antes = await request(ctx.app).get('/api/promoter/support').set(auth(cliente.token)).expect(200);
    expect(antes.body.humanRequested).toBe(false);

    const pedido = await request(ctx.app).post('/api/promoter/support/human').set(auth(cliente.token)).expect(200);
    expect(pedido.body.jaEstavaComEquipe).toBe(false);

    const depois = await request(ctx.app).get('/api/promoter/support').set(auth(cliente.token)).expect(200);
    expect(depois.body.humanRequested).toBe(true);
    // Pedido do cliente + retorno imediato do suporte; autor nunca vai para o cliente.
    expect(depois.body.messages.map((m: any) => m.senderType)).toEqual(['promoter', 'admin']);
    expect(depois.body.messages[1]).not.toHaveProperty('isAi');

    // Pedir de novo não duplica.
    const repetido = await request(ctx.app).post('/api/promoter/support/human').set(auth(cliente.token)).expect(200);
    expect(repetido.body.jaEstavaComEquipe).toBe(true);

    const lista = await request(ctx.app).get('/api/admin/promoter-support').set(auth(equipe.token)).expect(200);
    const chat = lista.body.chats.find((c: any) => c.userId === cliente.user.id);
    expect(chat.humanRequested).toBe(true);

    await request(ctx.app)
      .post(`/api/admin/promoter-support/${cliente.user.id}`)
      .set(auth(equipe.token))
      .send({ message: 'Oi, sou da equipe. Como posso ajudar?' })
      .expect(200);

    const final = await request(ctx.app).get('/api/promoter/support').set(auth(cliente.token)).expect(200);
    expect(final.body.humanRequested).toBe(false);
  });
  // ── Perfil de casal: dados do parceiro ──────────────────────────────────────
  it('casal salva os dados do parceiro junto com o resto do perfil', async () => {
    const casal = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Casal Parceiro', email: 'casal-parceiro@example.com', password: 'senha123', gender: 'Casal (Ele/Ela)',
    });
    const r = await request(ctx.app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${casal.token}`)
      .send({
        sexualOrientation: 'Bissexual',
        ethnicity: 'Parda',
        partnerName: 'Ana',
        partnerSexualOrientation: 'Heterossexual',
        partnerEthnicity: 'Branca',
        partnerHair: 'Castanho',
        partnerEyes: 'Verdes',
        partnerHeight: '1,65',
        partnerBodyType: 'Magra',
        lookingFor: ['Casal (Ele/Ela)', 'Mulher'],
      });
    expect(r.status).toBe(200);
    expect(r.body.partnerSexualOrientation).toBe('Heterossexual');
    expect(r.body.partnerEthnicity).toBe('Branca');
    expect(r.body.partnerName).toBe('Ana');
    expect(r.body.ethnicity).toBe('Parda');
    expect(r.body.lookingFor).toEqual(['Casal (Ele/Ela)', 'Mulher']);
  });

  it('perfil recusado diz qual campo esta errado', async () => {
    const u = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Campo Errado', email: 'campo-errado@example.com', password: 'senha123', gender: 'Mulher',
    });
    const r = await request(ctx.app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ campoQueNaoExiste: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.message).toContain('campoQueNaoExiste');
  });
  // ── Buscar Vídeos: coleções da pessoa ───────────────────────────────────────
  it('colecoes de videos: vistos, curtidos e comentados respondem e validam', async () => {
    const u = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Colecao Videos', email: 'colecao-videos@example.com', password: 'senha123', gender: 'Mulher',
    });
    const auth = { Authorization: `Bearer ${u.token}` };

    const vistos = await request(ctx.app).post('/api/videos/by-ids').set(auth).send({ mediaIds: ['nao-existe-1', 'nao-existe-2'] });
    expect(vistos.status).toBe(200);
    expect(vistos.body.videos).toEqual([]);

    const vazio = await request(ctx.app).post('/api/videos/by-ids').set(auth).send({ mediaIds: [] });
    expect(vazio.status).toBe(200);

    for (const tipo of ['curtidos', 'comentados']) {
      const r = await request(ctx.app).get(`/api/videos/minhas?tipo=${tipo}`).set(auth);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.body.videos)).toBe(true);
    }

    const invalido = await request(ctx.app).get('/api/videos/minhas?tipo=outro').set(auth);
    expect(invalido.status).toBe(400);
  });
  // ── Verificação em duas etapas por e-mail ───────────────────────────────────
  it('verificacao em duas etapas: ligar, aparelho novo pede codigo, aparelho de confianca entra direto', async () => {
    const email = 'dois-fatores@example.com';
    const u = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dois Fatores', email, password: 'senha123', gender: 'Mulher',
    });
    const auth = { Authorization: `Bearer ${u.token}` };
    const entrar = (extra: Record<string, unknown> = {}) =>
      request(ctx.app).post('/api/auth/login').send({ email, password: 'senha123', ...extra });

    // Desligada: entra direto.
    const semVerificacao = await entrar();
    expect(semVerificacao.status).toBe(200);
    expect(semVerificacao.body.token).toBeTruthy();

    // Ligar exige confirmar o código do e-mail.
    const inicio = await request(ctx.app).post('/api/auth/2fa/enable/start').set(auth);
    expect(inicio.status).toBe(200);
    expect(inicio.body.previewCode).toMatch(/^\d{6}$/);
    const errado = inicio.body.previewCode === '000000' ? '111111' : '000000';
    const confirmaErrado = await request(ctx.app).post('/api/auth/2fa/enable/confirm').set(auth)
      .send({ challengeId: inicio.body.challengeId, code: errado });
    expect(confirmaErrado.status).toBe(400);
    const confirma = await request(ctx.app).post('/api/auth/2fa/enable/confirm').set(auth)
      .send({ challengeId: inicio.body.challengeId, code: inicio.body.previewCode });
    expect(confirma.status).toBe(200);
    const aparelhoQueLigou = confirma.body.deviceToken as string;
    expect(aparelhoQueLigou).toBeTruthy();

    // Aparelho novo: senha certa não basta.
    const novo = await entrar();
    expect(novo.status).toBe(200);
    expect(novo.body.token).toBeUndefined();
    expect(novo.body.requires2fa).toBe(true);
    expect(novo.body.emailMasked).not.toContain('dois-fatores');

    const codigoErrado = novo.body.previewCode === '000000' ? '111111' : '000000';
    const tentativaErrada = await request(ctx.app).post('/api/auth/login/2fa')
      .send({ challengeId: novo.body.challengeId, code: codigoErrado });
    expect(tentativaErrada.status).toBe(400);
    expect(tentativaErrada.body.error).toBe('code_invalido');

    const certo = await request(ctx.app).post('/api/auth/login/2fa')
      .send({ challengeId: novo.body.challengeId, code: novo.body.previewCode, trustDevice: true });
    expect(certo.status).toBe(200);
    expect(certo.body.token).toBeTruthy();
    const aparelhoNovo = certo.body.deviceToken as string;
    expect(aparelhoNovo).toBeTruthy();

    // Código já usado não serve de novo.
    const reuso = await request(ctx.app).post('/api/auth/login/2fa')
      .send({ challengeId: novo.body.challengeId, code: novo.body.previewCode });
    expect(reuso.status).toBe(400);

    // Aparelho de confiança entra direto — os dois.
    expect((await entrar({ deviceToken: aparelhoNovo })).body.token).toBeTruthy();
    expect((await entrar({ deviceToken: aparelhoQueLigou })).body.token).toBeTruthy();

    // Lista de aparelhos marca o atual.
    const lista = await request(ctx.app).get(`/api/auth/2fa?deviceToken=${aparelhoNovo}`).set(auth);
    expect(lista.body.enabled).toBe(true);
    expect(lista.body.devices).toHaveLength(2);
    expect(lista.body.devices.filter((d: any) => d.current)).toHaveLength(1);

    // "Perdi o celular": tira a confiança de todos.
    await request(ctx.app).delete('/api/auth/2fa/devices').set(auth).expect(200);
    expect((await entrar({ deviceToken: aparelhoNovo })).body.requires2fa).toBe(true);

    // Desligar pede a senha.
    await request(ctx.app).post('/api/auth/2fa/disable').set(auth).send({ password: 'errada' }).expect(401);
    await request(ctx.app).post('/api/auth/2fa/disable').set(auth).send({ password: 'senha123' }).expect(200);
    expect((await entrar()).body.token).toBeTruthy();
  });

  it('verificacao em duas etapas: cinco erros matam o codigo', async () => {
    const email = 'dois-fatores-erros@example.com';
    const u = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dois Fatores Erros', email, password: 'senha123', gender: 'Mulher',
    });
    await run(ctx.db, 'UPDATE users SET two_factor_email = 1 WHERE id = ?', [u.user.id]);
    const novo = await request(ctx.app).post('/api/auth/login').send({ email, password: 'senha123' });
    expect(novo.body.requires2fa).toBe(true);
    const errado = novo.body.previewCode === '000000' ? '111111' : '000000';
    let ultimo: any;
    for (let i = 0; i < 5; i += 1) {
      ultimo = await request(ctx.app).post('/api/auth/login/2fa').send({ challengeId: novo.body.challengeId, code: errado });
    }
    expect(ultimo.body.error).toBe('code_esgotado');
    const certoDepois = await request(ctx.app).post('/api/auth/login/2fa')
      .send({ challengeId: novo.body.challengeId, code: novo.body.previewCode });
    expect(certoDepois.status).toBe(400);
  });
  // ── Embaixador Oficial ──────────────────────────────────────────────────────
  it('embaixador oficial: ranking, condecorar, esconder selo e revogar', async () => {
    const promotor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Promotor Ranking', email: 'promotor-ranking@example.com', password: 'senha123', gender: 'Homem',
    });
    const admin = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Admin Ranking', email: 'admin-ranking@example.com', password: 'senha123', gender: 'Homem',
    });
    const visitante = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Visitante Ranking', email: 'visitante-ranking@example.com', password: 'senha123', gender: 'Mulher',
    });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.user.id]);
    const comoAdmin = { Authorization: `Bearer ${admin.token}` };
    const comoPromotor = { Authorization: `Bearer ${promotor.token}` };

    await request(ctx.app).post('/api/promoter/activate').set(comoPromotor)
      .send({ fullName: 'Promotor Ranking', pixKey: 'pix-ranking@example.com', acceptTerms: true }).expect(200);

    // Duas assinaturas pagas trazidas por ele.
    const agora = new Date().toISOString();
    for (const [id, assinante] of [['pc-r1', 'assinante-1'], ['pc-r2', 'assinante-2']]) {
      await run(ctx.db,
        "INSERT INTO promoter_commissions (id, promoter_user_id, subscriber_user_id, subscription_amount, commission_amount, status, period, event_type, created_at) VALUES (?, ?, ?, 990, 198, 'approved', '2026-09', 'payment.approved', ?)",
        [id, promotor.user.id, assinante, agora]);
    }

    const ranking = await request(ctx.app).get('/api/admin/promoters/ranking?periodo=total').set(comoAdmin).expect(200);
    const linha = ranking.body.ranking.find((r: any) => r.userId === promotor.user.id);
    expect(linha.receitaCents).toBe(1980);
    expect(linha.assinantes).toBe(2);
    expect(linha.embaixadorDesde).toBeNull();

    // Promotor não vê o ranking do admin, só a própria posição.
    await request(ctx.app).get('/api/admin/promoters/ranking').set(comoPromotor).expect(403);
    const posicao = await request(ctx.app).get('/api/promoter/ranking').set(comoPromotor).expect(200);
    expect(posicao.body.posicao).toBeGreaterThan(0);

    // Só promotor pode ser condecorado.
    await request(ctx.app).post(`/api/admin/promoters/${visitante.user.id}/embaixador`).set(comoAdmin).send({}).expect(400);

    await request(ctx.app).post(`/api/admin/promoters/${promotor.user.id}/embaixador`).set(comoAdmin)
      .send({ nota: 'top de setembro' }).expect(200);

    const perfil = await request(ctx.app).get(`/api/users/${promotor.user.id}`).set({ Authorization: `Bearer ${visitante.token}` }).expect(200);
    const dados = perfil.body.user ?? perfil.body;
    expect(dados.officialAmbassador).toBe(true);
    expect(dados.badges).toContain('official_ambassador');

    // Premium grátis via trial estendido.
    const comTitulo = await ctx.db.queryOne('SELECT trial_ends_at, embaixador_oficial_em FROM users WHERE id = ?', [promotor.user.id]) as any;
    expect(String(comTitulo.trial_ends_at)).toContain('2099');

    // Esconder o selo: some do perfil público, o título continua.
    await request(ctx.app).put('/api/embaixador/visibilidade').set(comoPromotor).send({ oculto: true }).expect(200);
    const escondido = await request(ctx.app).get(`/api/users/${promotor.user.id}`).set({ Authorization: `Bearer ${visitante.token}` }).expect(200);
    const dadosEscondido = escondido.body.user ?? escondido.body;
    expect(dadosEscondido.officialAmbassador).toBe(false);
    expect(dadosEscondido.badges ?? []).not.toContain('official_ambassador');

    // Revogar devolve o trial de antes.
    await request(ctx.app).delete(`/api/admin/promoters/${promotor.user.id}/embaixador`).set(comoAdmin).expect(200);
    const depois = await ctx.db.queryOne('SELECT trial_ends_at, embaixador_oficial_em FROM users WHERE id = ?', [promotor.user.id]) as any;
    expect(depois.embaixador_oficial_em).toBeNull();
    expect(String(depois.trial_ends_at || '')).not.toContain('2099');
  });
  // ── Contos: categoria, trava, lidos e admin ─────────────────────────────────
  it('contos: categoria obrigatoria, trava de conteudo proibido, lidos e moderacao', async () => {
    const autor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Contos', email: 'autor-contos@example.com', password: 'senha123', gender: 'Mulher',
    });
    const leitor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Leitor Contos', email: 'leitor-contos@example.com', password: 'senha123', gender: 'Homem',
    });
    const admin = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Admin Contos', email: 'admin-contos@example.com', password: 'senha123', gender: 'Homem',
    });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.user.id]);
    const A = { Authorization: `Bearer ${autor.token}` };
    const L = { Authorization: `Bearer ${leitor.token}` };
    const ADM = { Authorization: `Bearer ${admin.token}` };
    const texto = 'Fomos a uma casa de swing no sabado e a noite foi inesquecivel para nos dois.';

    // Sem categoria não publica.
    const sem = await request(ctx.app).post('/api/experiences').set(A).send({ title: 'Noite', description: texto });
    expect(sem.status).toBe(400);
    expect(sem.body.message).toContain('categoria');

    const ok = await request(ctx.app).post('/api/experiences').set(A).send({ title: 'Noite no clube', description: texto, categoria: 'swing' });
    expect(ok.body.status).toBe('publicado');

    // Conteúdo com menor vai para revisão: autor vê, leitor não.
    const proibido = await request(ctx.app).post('/api/experiences').set(A)
      .send({ title: 'Lembranca', description: 'Ela tinha 16 anos quando tudo aconteceu naquela festa.', categoria: 'confissao' });
    expect(proibido.body.status).toBe('em_revisao');
    const feedAutor = await request(ctx.app).get('/api/feed/experiences').set(A);
    expect(feedAutor.body.experiences.find((e: any) => e.id === proibido.body.id)?.emRevisao).toBe(true);
    const feedLeitor = await request(ctx.app).get('/api/feed/experiences').set(L);
    expect(feedLeitor.body.experiences.find((e: any) => e.id === proibido.body.id)).toBeUndefined();

    // Filtro por categoria, contador e leitura.
    const cats = await request(ctx.app).get('/api/experiences/categorias').set(L);
    expect(cats.body.categorias.find((c: any) => c.slug === 'swing').total).toBeGreaterThanOrEqual(1);
    const soSwing = await request(ctx.app).get('/api/feed/experiences?categoria=swing').set(L);
    expect(soSwing.body.experiences.every((e: any) => e.categoria === 'swing')).toBe(true);

    const naoLidosAntes = await request(ctx.app).get('/api/feed/experiences?leitura=nao_lidos').set(L);
    expect(naoLidosAntes.body.experiences.some((e: any) => e.id === ok.body.id)).toBe(true);
    await request(ctx.app).post(`/api/experiences/${ok.body.id}/lido`).set(L).expect(200);
    await request(ctx.app).post(`/api/experiences/${ok.body.id}/lido`).set(L).expect(200); // repetir não quebra
    const naoLidosDepois = await request(ctx.app).get('/api/feed/experiences?leitura=nao_lidos').set(L);
    expect(naoLidosDepois.body.experiences.some((e: any) => e.id === ok.body.id)).toBe(false);
    const lidos = await request(ctx.app).get('/api/feed/experiences?leitura=lidos').set(L);
    expect(lidos.body.experiences.find((e: any) => e.id === ok.body.id)?.lido).toBe(true);

    // Mais votados responde.
    await request(ctx.app).get('/api/feed/experiences?ordem=votados').set(L).expect(200);

    // Admin: lista com revisão primeiro, reclassifica, aprova e remove.
    await request(ctx.app).get('/api/admin/contos').set(L).expect(403);
    const listaAdmin = await request(ctx.app).get('/api/admin/contos').set(ADM).expect(200);
    expect(listaAdmin.body.contos[0].status).toBe('em_revisao');
    expect(listaAdmin.body.contagem.revisao).toBeGreaterThanOrEqual(1);
    await request(ctx.app).patch(`/api/admin/contos/${ok.body.id}`).set(ADM).send({ categoria: 'exibicionismo' }).expect(200);
    const reclass = await request(ctx.app).get('/api/feed/experiences?categoria=exibicionismo').set(L);
    expect(reclass.body.experiences.some((e: any) => e.id === ok.body.id)).toBe(true);
    await request(ctx.app).delete(`/api/admin/contos/${proibido.body.id}`).set(ADM).expect(200);
    const apagado = await request(ctx.app).get('/api/feed/experiences').set(A);
    expect(apagado.body.experiences.some((e: any) => e.id === proibido.body.id)).toBe(false);

    // Varredura dos antigos segura o que a trava pega.
    await run(ctx.db, "INSERT INTO experiences (id, user_id, title, description, created_at, status) VALUES ('antigo-1', ?, 'Antigo', 'Transei com meu pai quando visitei o sitio da familia.', ?, 'publicado')", [autor.user.id, new Date().toISOString()]);
    const varredura = await request(ctx.app).post('/api/admin/contos/varredura').set(ADM).expect(200);
    expect(varredura.body.segurados).toBeGreaterThanOrEqual(1);
    const antigo = await ctx.db.queryOne("SELECT status FROM experiences WHERE id = 'antigo-1'") as any;
    expect(antigo.status).toBe('em_revisao');
  });
  // ── Mural do perfil: recado só aparece depois que o dono aprova ─────────────
  it('mural: assinante deixa recado pendente, so o dono ve, e aparece depois de aprovado', async () => {
    const dona = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Dona Mural', email: 'dona-mural@example.com', password: 'senha123', gender: 'Mulher',
    });
    const autor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Mural', email: 'autor-mural@example.com', password: 'senha123', gender: 'Homem',
    });
    const curioso = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Curioso Mural', email: 'curioso-mural@example.com', password: 'senha123', gender: 'Homem',
    });
    const D = { Authorization: `Bearer ${dona.token}` };
    const A = { Authorization: `Bearer ${autor.token}` };
    const C = { Authorization: `Bearer ${curioso.token}` };

    // Sem assinatura não escreve (mural não pode virar atalho grátis do chat).
    await run(ctx.db, "UPDATE users SET is_premium = 0, trial_ends_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [curioso.user.id]);
    const semPremium = await request(ctx.app).post(`/api/users/${dona.user.id}/mural`).set(C).send({ conteudo: 'Oi, adorei o perfil' });
    expect(semPremium.status).toBe(403);

    // Ninguém escreve no próprio mural.
    await request(ctx.app).post(`/api/users/${dona.user.id}/mural`).set(D).send({ conteudo: 'Oi eu mesma' }).expect(400);

    await run(ctx.db, 'UPDATE users SET is_premium = 1 WHERE id = ?', [autor.user.id]);
    const criado = await request(ctx.app).post(`/api/users/${dona.user.id}/mural`).set(A).send({ conteudo: 'Olá, adoramos o perfil!' });
    expect(criado.status).toBe(200);
    expect(criado.body.status).toBe('pendente');

    // Segundo recado enquanto o primeiro está pendente: recusado.
    await request(ctx.app).post(`/api/users/${dona.user.id}/mural`).set(A).send({ conteudo: 'Outro recado' }).expect(409);

    // Pendente: visitante não vê; a dona vê para aprovar.
    const antesVisitante = await request(ctx.app).get(`/api/users/${dona.user.id}/mural`).set(C).expect(200);
    expect(antesVisitante.body.recados).toHaveLength(0);
    const antesDona = await request(ctx.app).get(`/api/users/${dona.user.id}/mural`).set(D).expect(200);
    expect(antesDona.body.recados[0].status).toBe('pendente');

    // Só a dona aprova.
    const id = antesDona.body.recados[0].id;
    await request(ctx.app).patch(`/api/mural/${id}`).set(A).send({ acao: 'aprovar' }).expect(404);
    await request(ctx.app).patch(`/api/mural/${id}`).set(D).send({ acao: 'aprovar' }).expect(200);

    const depois = await request(ctx.app).get(`/api/users/${dona.user.id}/mural`).set(C).expect(200);
    expect(depois.body.recados).toHaveLength(1);
    expect(depois.body.recados[0].conteudo).toBe('Olá, adoramos o perfil!');

    // Visitante não apaga; a dona apaga.
    await request(ctx.app).delete(`/api/mural/${id}`).set(C).expect(404);
    await request(ctx.app).delete(`/api/mural/${id}`).set(D).expect(200);
  });

  // Compra de tokens: o aviso de pagamento do produto Tokens credita uma vez só,
  // e token comprado não vira dia de Premium.
  it('compra de tokens: credita uma vez e nao vira dia de premium', async () => {
    const comprador = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Comprador Tokens', email: 'comprador-tokens@example.com', password: 'senha123', gender: 'Homem',
    });
    const uid = String(comprador.user.id);
    await run(ctx.db, "INSERT INTO system_settings (key, value, updated_at) VALUES ('tokens_produto_id', 'prod-tokens-teste', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [new Date().toISOString()]);
    await run(ctx.db, 'UPDATE users SET hub_customer_id = ? WHERE id = ?', ['cus-tokens-teste', uid]);
    await run(
      ctx.db,
      "INSERT INTO compras_tokens (id, user_id, pacote, tokens, valor_cents, metodo, order_id, status, criado_em) VALUES ('compra-1', ?, 'p150', 150, 990, 'PIX', 'ord-tokens-1', 'pendente', ?)",
      [uid, new Date().toISOString()]
    );
    const antes = (await queryOne(ctx.db, 'SELECT COALESCE(token_points,0) AS p, COALESCE(token_free_days,0) AS d FROM users WHERE id = ?', [uid])) as any;

    const avisar = async () => {
      const corpo = { customerId: 'cus-tokens-teste', productId: 'prod-tokens-teste', payload: { originType: 'order', originId: 'ord-tokens-1', amount: 990 } };
      const bruto = JSON.stringify(corpo);
      const assinatura = createHmac('sha256', HUB_WEBHOOK_SECRET_TESTE).update(Buffer.from(bruto)).digest('hex');
      await request(ctx.app).post('/api/webhooks/hub-billing')
        .set('x-hub-event', 'payment.approved').set('x-hub-signature', `sha256=${assinatura}`)
        .set('Content-Type', 'application/json').send(corpo).expect(200);
      await new Promise((r) => setTimeout(r, 150)); // o webhook processa depois de responder
    };
    await avisar();
    await avisar(); // repetido: não credita de novo

    const depois = (await queryOne(ctx.db, 'SELECT COALESCE(token_points,0) AS p, COALESCE(tokens_comprados,0) AS c, COALESCE(token_free_days,0) AS d FROM users WHERE id = ?', [uid])) as any;
    expect(Number(depois.p) - Number(antes.p)).toBe(150);
    expect(Number(depois.c)).toBe(150);
    expect(Number(depois.d)).toBe(Number(antes.d)); // 150 comprados não viraram dia
    const compra = (await queryOne(ctx.db, "SELECT status FROM compras_tokens WHERE id = 'compra-1'")) as any;
    expect(compra.status).toBe('paga');
  });

  // Pedidos de contato: mulher/casal recebe mensagem de desconhecido como pedido.
  it('pedido de contato: mensagem de desconhecido vira pedido, aceitar vira conversa', async () => {
    const ela = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Ela Pedido', email: 'ela-pedido@example.com', password: 'senha123', gender: 'Mulher',
    });
    const ele = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Ele Pedido', email: 'ele-pedido@example.com', password: 'senha123', gender: 'Homem',
    });
    // Homem não tem período grátis: dá acesso para poder mandar mensagem.
    await run(ctx.db, 'UPDATE users SET is_premium = 1, hub_license_end_at = ? WHERE id = ?', [new Date(Date.now() + 30 * 86_400_000).toISOString(), String(ele.user.id)]);
    const A = { Authorization: `Bearer ${ela.token}` };
    const B = { Authorization: `Bearer ${ele.token}` };

    const conv = await request(ctx.app).post('/api/conversations').set(B).send({ userId: String(ela.user.id) }).expect(200);
    expect(conv.body.pedido).toBe(true);
    await request(ctx.app).post(`/api/conversations/${conv.body.id}/messages`).set(B).send({ content: 'Oi, tudo bem?' }).expect(200);

    const listaDela = await request(ctx.app).get('/api/conversations').set(A).expect(200);
    const c1 = listaDela.body.find((c: any) => c.id === conv.body.id);
    expect(c1.pedido).toBe(true);
    const contagem = await request(ctx.app).get('/api/conversations/unread-count').set(A).expect(200);
    expect(contagem.body.conversationsCount).toBe(0);
    expect(contagem.body.pedidosCount).toBe(1);

    const listaDele = await request(ctx.app).get('/api/conversations').set(B).expect(200);
    const c2 = listaDele.body.find((c: any) => c.id === conv.body.id);
    expect(c2.pedidoEnviado).toBe(true);
    expect(c2.user.lastSeenAt).toBeNull();

    // Destacar sem tokens: recusado.
    await request(ctx.app).post(`/api/conversations/${conv.body.id}/pedido/destacar`).set(B).send({}).expect(400);
    // Só quem recebeu aceita.
    await request(ctx.app).post(`/api/conversations/${conv.body.id}/pedido/aceitar`).set(B).send({}).expect(404);
    await request(ctx.app).post(`/api/conversations/${conv.body.id}/pedido/aceitar`).set(A).send({}).expect(200);
    const depois = await request(ctx.app).get('/api/conversations').set(A).expect(200);
    expect(depois.body.find((c: any) => c.id === conv.body.id).pedido).toBe(false);
  });

  // Trocar e-mail: senha atual + código enviado ao e-mail novo.
  it('troca de e-mail pede senha, recusa e-mail em uso e troca com o codigo', async () => {
    const dono = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Troca Email', email: 'troca-email@example.com', password: 'senha123', gender: 'Mulher',
    });
    await registerInvitedUser(ctx, sponsorToken, {
      name: 'Outro Email', email: 'ocupado@example.com', password: 'senha123', gender: 'Homem',
    });
    const D = { Authorization: `Bearer ${dono.token}` };

    await request(ctx.app).post('/api/auth/email/trocar').set(D).send({ novoEmail: 'novo@example.com', senha: 'errada' }).expect(400);
    await request(ctx.app).post('/api/auth/email/trocar').set(D).send({ novoEmail: 'ocupado@example.com', senha: 'senha123' }).expect(409);

    const pedido = await request(ctx.app).post('/api/auth/email/trocar').set(D).send({ novoEmail: 'Novo@Example.com', senha: 'senha123' }).expect(200);
    expect(pedido.body.challengeId).toBeTruthy();
    expect(pedido.body.previewCode).toMatch(/^\d{6}$/);

    await request(ctx.app).post('/api/auth/email/confirmar').set(D).send({ challengeId: pedido.body.challengeId, code: '000000' === pedido.body.previewCode ? '111111' : '000000' }).expect(400);
    const ok = await request(ctx.app).post('/api/auth/email/confirmar').set(D).send({ challengeId: pedido.body.challengeId, code: pedido.body.previewCode }).expect(200);
    expect(ok.body.email).toBe('novo@example.com');
    const linha = (await queryOne(ctx.db, 'SELECT email FROM users WHERE id = ?', [String(dono.user.id)])) as any;
    expect(linha.email).toBe('novo@example.com');
  });

  // Vídeo processando em segundo plano: o post só aparece para os outros
  // quando o vídeo terminar; o autor vê o dele (no perfil) desde já.
  it('post com video ainda processando fica escondido dos outros e visivel para o autor', async () => {
    const autora = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autora Video', email: 'autora-video@example.com', password: 'senha123', gender: 'Mulher',
    });
    const outro = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Outro Video', email: 'outro-video@example.com', password: 'senha123', gender: 'Homem',
    });
    const A = { Authorization: `Bearer ${autora.token}` };
    const O = { Authorization: `Bearer ${outro.token}` };
    await run(ctx.db,
      "INSERT INTO media (id, user_id, filename, original_name, mime_type, size, is_private, is_main, source, processando, created_at) VALUES ('mid-proc', ?, 'v.mp4', 'v.mp4', 'video/mp4', 10, 0, 0, 'post', 1, ?)",
      [String(autora.user.id), new Date().toISOString()]);

    const criado = await request(ctx.app).post('/api/posts').set(A).send({ content: 'meu video', mediaIds: ['mid-proc'] }).expect(200);
    expect(criado.body.processando).toBe(true);
    const postId = criado.body.id;

    await request(ctx.app).get(`/api/posts/${postId}`).set(O).expect(404);
    await request(ctx.app).get(`/api/posts/${postId}`).set(A).expect(200);
    const doPerfilOutro = await request(ctx.app).get(`/api/users/${autora.user.id}/posts`).set(O).expect(200);
    expect(doPerfilOutro.body.posts.map((p: any) => p.id)).not.toContain(postId);
    const doPerfilDona = await request(ctx.app).get(`/api/users/${autora.user.id}/posts`).set(A).expect(200);
    const meu = doPerfilDona.body.posts.find((p: any) => p.id === postId);
    expect(meu?.processando).toBe(true);

    // Terminou de processar: aparece para todos.
    await run(ctx.db, 'UPDATE media SET processando = 0 WHERE id = ?', ['mid-proc']);
    await run(ctx.db, 'UPDATE posts SET processando = 0 WHERE id = ?', [postId]);
    await request(ctx.app).get(`/api/posts/${postId}`).set(O).expect(200);
  });

  // Pagar comissões avisa o promotor no chat de suporte: valor, chave Pix e de
  // quais comissões é o pagamento (o e-mail sozinho falhava com a cota do Resend).
  it('pagar comissoes avisa o promotor no chat de suporte com valor e itens', async () => {
    const promotor = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Promotor Pagamento', email: 'promotor-pagto@example.com', password: 'senha123', gender: 'Homem',
    });
    const admin = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Admin Pagamento', email: 'admin-pagto@example.com', password: 'senha123', gender: 'Homem',
    });
    const assinante = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Carla Assinante', email: 'carla-pagto@example.com', password: 'senha123', gender: 'Mulher',
    });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [admin.user.id]);
    await request(ctx.app).post('/api/promoter/activate').set({ Authorization: `Bearer ${promotor.token}` })
      .send({ fullName: 'Promotor Pagamento', pixKey: 'chave-pix-1234', acceptTerms: true }).expect(200);

    const agora = new Date().toISOString();
    const comissoes: Array<[string, number, string, string]> = [['pc-p1', 600, 'payment.approved', '2026-08'], ['pc-p2', 600, 'backfill_renovacao', '2026-09']];
    for (const [id, valor, evento, periodo] of comissoes) {
      await run(ctx.db,
        "INSERT INTO promoter_commissions (id, promoter_user_id, subscriber_user_id, subscription_amount, commission_amount, status, period, event_type, created_at) VALUES (?, ?, ?, 990, ?, 'approved', ?, ?, ?)",
        [id, String(promotor.user.id), String(assinante.user.id), valor, periodo, evento, agora]);
    }

    const r = await request(ctx.app).post('/api/admin/promoter-commissions/batch-pay')
      .set({ Authorization: `Bearer ${admin.token}` }).send({ promoterUserId: String(promotor.user.id) }).expect(200);
    expect(r.body.paid).toBe(2);
    expect(r.body.chatAvisos).toBe(1);

    const msgs = (await queryAll(ctx.db, "SELECT sender_type, message FROM promoter_support_messages WHERE promoter_user_id = ?", [String(promotor.user.id)])) as any[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].sender_type).toBe('admin');
    expect(msgs[0].message).toContain('12,00');
    expect(msgs[0].message).toContain('1234');
    expect(msgs[0].message).toContain('Carla');
    expect(msgs[0].message).toContain('renovação');
    expect(msgs[0].message).toContain('2 comissões');
  });

  it('pedidos de contato: homem para mulher vira pedido; responder aceita; excluir esconde só de quem recebeu', async () => {
    const reg = (name: string, email: string, gender: string) =>
      registerInvitedUser(ctx, sponsorToken, { name, email, password: 'senha123', gender });
    const homem = await reg('Pedro Pedido', 'pedido-homem@example.com', 'Homem');
    const homem2 = await reg('Paulo Pedido', 'pedido-homem2@example.com', 'Homem');
    const mulher = await reg('Maria Pedido', 'pedido-mulher@example.com', 'Mulher');
    await grantPremium(ctx, String(homem.user.id));
    await grantPremium(ctx, String(homem2.user.id));
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const abrir = async (token: string) => {
      const r = await request(ctx.app).post('/api/conversations').set(auth(token)).send({ userId: mulher.user.id }).expect(200);
      expect(r.body.pedido).toBe(true);
      await request(ctx.app).post(`/api/conversations/${r.body.id}/messages`).set(auth(token)).send({ content: 'Oi!' }).expect(200);
      return String(r.body.id);
    };
    const c1 = await abrir(homem.token);
    const c2 = await abrir(homem2.token);

    // Para ela: os dois aparecem como pedido e não contam como não lidas.
    let lista = (await request(ctx.app).get('/api/conversations').set(auth(mulher.token)).expect(200)).body as any[];
    expect(lista.find((c) => c.id === c1)?.pedido).toBe(true);
    expect(lista.find((c) => c.id === c2)?.pedido).toBe(true);
    const unread = (await request(ctx.app).get('/api/conversations/unread-count').set(auth(mulher.token)).expect(200)).body;
    expect(unread.pedidosCount).toBe(2);

    // Para ele: pedido enviado.
    const doHomem = (await request(ctx.app).get('/api/conversations').set(auth(homem.token)).expect(200)).body as any[];
    expect(doHomem.find((c) => c.id === c1)?.pedidoEnviado).toBe(true);

    // Destacar sem tokens: 400 saldo_insuficiente (nunca 401, que deslogaria).
    const semSaldo = await request(ctx.app).post(`/api/conversations/${c1}/pedido/destacar`).set(auth(homem.token)).expect(400);
    expect(semSaldo.body.error).toBe('saldo_insuficiente');
    // Quem recebeu não pode destacar; quem mandou não pode aceitar.
    await request(ctx.app).post(`/api/conversations/${c1}/pedido/destacar`).set(auth(mulher.token)).expect(400);
    await request(ctx.app).post(`/api/conversations/${c1}/pedido/aceitar`).set(auth(homem.token)).expect(404);

    // Com tokens: destaca, debita 20 e gasta a parte comprada primeiro.
    await run(ctx.db, 'UPDATE users SET token_points = 30, tokens_comprados = 25 WHERE id = ?', [String(homem.user.id)]);
    await request(ctx.app).post(`/api/conversations/${c1}/pedido/destacar`).set(auth(homem.token)).expect(200);
    const saldo = (await ctx.db.queryOne('SELECT token_points, tokens_comprados FROM users WHERE id = ?', [String(homem.user.id)])) as any;
    expect(Number(saldo.token_points)).toBe(10);
    expect(Number(saldo.tokens_comprados)).toBe(5);
    const deNovo = await request(ctx.app).post(`/api/conversations/${c1}/pedido/destacar`).set(auth(homem.token)).expect(200);
    expect(deNovo.body.jaDestacado).toBe(true);

    // Ela responde o 1º (= aceita) e exclui o 2º.
    await request(ctx.app).post(`/api/conversations/${c1}/messages`).set(auth(mulher.token)).send({ content: 'Oi, Pedro' }).expect(200);
    await request(ctx.app).post(`/api/conversations/${c2}/pedido/excluir`).set(auth(mulher.token)).expect(200);

    lista = (await request(ctx.app).get('/api/conversations').set(auth(mulher.token)).expect(200)).body as any[];
    expect(lista.find((c) => c.id === c1)?.pedido).toBe(false);
    expect(lista.some((c) => c.id === c2)).toBe(false);
    // Quem mandou o excluído continua vendo a conversa (não fica sabendo).
    const doHomem2 = (await request(ctx.app).get('/api/conversations').set(auth(homem2.token)).expect(200)).body as any[];
    expect(doHomem2.some((c) => c.id === c2)).toBe(true);
    const unread2 = (await request(ctx.app).get('/api/conversations/unread-count').set(auth(mulher.token)).expect(200)).body;
    expect(unread2.pedidosCount).toBe(0);

    // Métricas do admin.
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(homem2.user.id)]);
    const met = (await request(ctx.app).get('/api/admin/analytics/pedidos?dias=30').set(auth(homem2.token)).expect(200)).body;
    expect(met.geral.total).toBeGreaterThanOrEqual(2);
    expect(met.geral.aceitos).toBeGreaterThanOrEqual(1);
    expect(met.geral.excluidos).toBeGreaterThanOrEqual(1);
    expect(met.destaque.vendidos).toBeGreaterThanOrEqual(1);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(homem2.user.id)]);
  });

  it('avisos do Telegram: admin escolhe por contato; padrão é receber todos; só admin mexe', async () => {
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Avisos', email: 'admin-avisos@example.com', password: 'senha123', gender: 'Mulher' });
    const comum = await registerInvitedUser(ctx, sponsorToken, { name: 'Comum Avisos', email: 'comum-avisos@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    await ctx.db.persist();
    const auth = { Authorization: `Bearer ${adm.token}` };

    const antes = (await request(ctx.app).get('/api/admin/telegram-avisos').set(auth).expect(200)).body;
    const eu = antes.contatos.find((c: any) => c.id === adm.user.id);
    expect(eu.personalizado).toBe(false);
    expect(eu.avisos.length).toBe(antes.tipos.length);
    expect(antes.contatos.some((c: any) => c.id === comum.user.id)).toBe(false);

    await request(ctx.app).put('/api/admin/telegram-avisos').set(auth).send({ userId: adm.user.id, avisos: ['pagamentos', 'servidor'] }).expect(200);
    const depois = (await request(ctx.app).get('/api/admin/telegram-avisos').set(auth).expect(200)).body;
    const eu2 = depois.contatos.find((c: any) => c.id === adm.user.id);
    expect(eu2.avisos).toEqual(['pagamentos', 'servidor']);
    expect(eu2.personalizado).toBe(true);

    // Tipo inexistente e contato que não é admin são recusados.
    await request(ctx.app).put('/api/admin/telegram-avisos').set(auth).send({ userId: adm.user.id, avisos: ['qualquer'] }).expect(400);
    await request(ctx.app).put('/api/admin/telegram-avisos').set(auth).send({ userId: comum.user.id, avisos: [] }).expect(404);
    // Quem não é admin não acessa.
    await request(ctx.app).get('/api/admin/telegram-avisos').set('Authorization', `Bearer ${comum.token}`).expect(403);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(adm.user.id)]);
  });

  it('suporte aceita print do usuário (com ou sem texto) e recusa mensagem vazia ou link externo', async () => {
    const u = await registerInvitedUser(ctx, sponsorToken, { name: 'Print Suporte', email: 'print-suporte@example.com', password: 'senha123', gender: 'Mulher' });
    const auth = { Authorization: `Bearer ${u.token}` };
    await request(ctx.app).post('/api/promoter/support').set(auth).send({ message: '', imageUrl: '/uploads/abc-123.webp' }).expect(200);
    await request(ctx.app).post('/api/promoter/support').set(auth).send({ message: 'Olha a tela', imageUrl: '/uploads/def.webp' }).expect(200);
    await request(ctx.app).post('/api/promoter/support').set(auth).send({ message: 'só texto' }).expect(200);
    await request(ctx.app).post('/api/promoter/support').set(auth).send({ message: '   ' }).expect(400);
    await request(ctx.app).post('/api/promoter/support').set(auth).send({ message: 'x', imageUrl: 'https://malicioso.com/a.png' }).expect(400);
    const lista = (await request(ctx.app).get('/api/promoter/support').set(auth).expect(200)).body.messages as any[];
    const minhas = lista.filter((m) => m.senderType === 'promoter');
    expect(minhas.map((m) => m.imageUrl)).toEqual(['/uploads/abc-123.webp', '/uploads/def.webp', null]);
  });

  it('cadastros por período: conta só quem entrou entre as datas (horário de Brasília) e une a cidade', async () => {
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Periodo', email: 'admin-periodo@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    const criar = async (n: number, cidade: string, uf: string, criadoEm: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Periodo ${n}`, email: `periodo-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await run(ctx.db, 'UPDATE users SET city = ?, state = ?, created_at = ? WHERE id = ?', [cidade, uf, criadoEm, String(r.user.id)]);
    };
    // 01/03 00:30 em Brasília = 01/03 03:30Z (dentro); 28/02 23:30 Brasília = 01/03 02:30Z (fora).
    await criar(1, 'Cidade Periodo', 'ZZ', '2025-03-01T03:30:00.000Z');
    await criar(2, 'cidade periodo', 'ZZ', '2025-03-05T12:00:00.000Z');
    await criar(3, 'Cidade Periodo', 'ZZ', '2025-03-01T02:30:00.000Z');
    // 10/03 23:59 Brasília = 11/03 02:59Z (dentro); 11/03 00:10 Brasília = 11/03 03:10Z (fora).
    await criar(4, 'Outra Periodo', 'YY', '2025-03-11T02:59:00.000Z');
    await criar(5, 'Outra Periodo', 'YY', '2025-03-11T03:10:00.000Z');
    await ctx.db.persist();
    const auth = { Authorization: `Bearer ${adm.token}` };

    const r = (await request(ctx.app).get('/api/admin/analytics/cidades-periodo?de=2025-03-01&ate=2025-03-10').set(auth).expect(200)).body;
    const cidade = r.cidades.find((c: any) => c.label === 'Cidade Periodo, ZZ');
    expect(cidade).toMatchObject({ novos: 2, total: 3 });
    expect(r.cidades.find((c: any) => c.label === 'Outra Periodo, YY')).toMatchObject({ novos: 1, total: 1 });
    expect(r.estados.find((e: any) => e.label === 'ZZ')).toMatchObject({ novos: 2 });

    await request(ctx.app).get('/api/admin/analytics/cidades-periodo?de=2025-03-10&ate=2025-03-01').set(auth).expect(400);
    await request(ctx.app).get('/api/admin/analytics/cidades-periodo?de=ontem&ate=2025-03-01').set(auth).expect(400);
    await request(ctx.app).get('/api/admin/analytics/cidades-periodo?de=2025-03-01&ate=2025-03-10').set('Authorization', `Bearer ${sponsorToken}`).expect(403);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(adm.user.id)]);
  });

  it('nome troca na hora; tipo de perfil só por pedido com motivo que o admin aprova ou recusa', async () => {
    const u = await registerInvitedUser(ctx, sponsorToken, { name: 'Nome Antigo', email: 'troca-nome@example.com', password: 'senha123', gender: 'Homem' });
    const auth = { Authorization: `Bearer ${u.token}` };

    // Nome: vale na hora, sem fila.
    const r = await request(ctx.app).post('/api/profile/name-change-request').set(auth).send({ name: 'Nome Novo Agora' }).expect(200);
    expect(r.body.name).toBe('Nome Novo Agora');
    const me = (await ctx.db.queryOne('SELECT name FROM users WHERE id = ?', [String(u.user.id)])) as any;
    expect(me.name).toBe('Nome Novo Agora');
    await request(ctx.app).post('/api/profile/name-change-request').set(auth).send({ name: 'Sponsor Principal' }).expect(409);

    // Gênero: o PUT do perfil continua sem mudar.
    await request(ctx.app).put('/api/profile').set(auth).send({ gender: 'Mulher' });
    expect(((await ctx.db.queryOne('SELECT gender FROM users WHERE id = ?', [String(u.user.id)])) as any).gender).toBe('Homem');

    // Pedido exige motivo e tipo válido.
    await request(ctx.app).post('/api/profile/gender-change-request').set(auth).send({ gender: 'Mulher', reason: 'curto' }).expect(400);
    await request(ctx.app).post('/api/profile/gender-change-request').set(auth).send({ gender: 'Alien', reason: 'motivo bem explicado aqui' }).expect(400);
    await request(ctx.app).post('/api/profile/gender-change-request').set(auth).send({ gender: 'Casal (Ele/Ela)', reason: 'Agora estou com minha namorada' }).expect(200);
    await request(ctx.app).post('/api/profile/gender-change-request').set(auth).send({ gender: 'Mulher', reason: 'outro pedido qualquer' }).expect(409);
    const sit = (await request(ctx.app).get('/api/profile/gender-change-request').set(auth).expect(200)).body;
    expect(sit.request).toMatchObject({ requestedGender: 'Casal (Ele/Ela)', status: 'pending' });

    // Admin vê, recusa com motivo; depois a pessoa pede de novo e o admin aprova.
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Genero', email: 'admin-genero@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    const admAuth = { Authorization: `Bearer ${adm.token}` };
    let lista = (await request(ctx.app).get('/api/admin/gender-change-requests').set(admAuth).expect(200)).body.requests as any[];
    const pedido = lista.find((p) => p.userId === u.user.id);
    expect(pedido).toMatchObject({ currentGender: 'Homem', requestedGender: 'Casal (Ele/Ela)', reason: 'Agora estou com minha namorada' });
    await request(ctx.app).post(`/api/admin/gender-change-requests/${pedido.id}/reject`).set(admAuth).send({ note: 'Mande uma foto do casal' }).expect(200);
    expect(((await ctx.db.queryOne('SELECT gender FROM users WHERE id = ?', [String(u.user.id)])) as any).gender).toBe('Homem');
    expect((await request(ctx.app).get('/api/profile/gender-change-request').set(auth)).body.request).toMatchObject({ status: 'rejected', reviewNote: 'Mande uma foto do casal' });

    await request(ctx.app).post('/api/profile/gender-change-request').set(auth).send({ gender: 'Casal (Ele/Ela)', reason: 'Já mandei a foto do casal' }).expect(200);
    lista = (await request(ctx.app).get('/api/admin/gender-change-requests').set(admAuth).expect(200)).body.requests as any[];
    const segundo = lista.find((p) => p.userId === u.user.id);
    await request(ctx.app).post(`/api/admin/gender-change-requests/${segundo.id}/approve`).set(admAuth).expect(200);
    expect(((await ctx.db.queryOne('SELECT gender FROM users WHERE id = ?', [String(u.user.id)])) as any).gender).toBe('Casal (Ele/Ela)');
    // Decidido não decide de novo; usuário comum não acessa o admin.
    await request(ctx.app).post(`/api/admin/gender-change-requests/${segundo.id}/reject`).set(admAuth).expect(404);
    await request(ctx.app).get('/api/admin/gender-change-requests').set(auth).expect(403);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(adm.user.id)]);
  });

  it('grupo do evento: dono modera (fixa, apaga, silencia, promove, bane); membros respondem entre si', async () => {
    const reg = async (n: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Grupo ${n}`, email: `grupo-mod-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dono = await reg('dono');
    const ana = await reg('ana');
    const bia = await reg('bia');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const ev = await request(ctx.app).post('/api/events').set(auth(dono.token)).send({ title: 'Evento Moderado', location: 'Fortaleza' }).expect(200);
    const eventId = String(ev.body.id);
    const g = await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(ana.token)).expect(200);
    const groupId = String(g.body.groupId);
    await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(bia.token)).expect(200);

    // Dono = quem criou o evento.
    const det = (await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(ana.token)).expect(200)).body;
    expect(det.members.find((m: any) => m.id === dono.user.id)).toMatchObject({ role: 'organizer', isModerator: true });
    expect(det.myRole).toBe('member');

    // Link e resposta entre membros.
    const m1 = (await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(ana.token)).send({ content: 'Entrem: https://exemplo.com/grupo' }).expect(200)).body;
    await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(bia.token)).send({ content: 'Valeu, Ana!', replyToId: m1.id }).expect(200);
    let msgs = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(dono.token)).expect(200)).body as any[];
    expect(msgs.find((m) => m.content === 'Entrem: https://exemplo.com/grupo')).toBeTruthy();
    expect(msgs.find((m) => m.content === 'Valeu, Ana!').replyTo).toMatchObject({ id: m1.id, senderName: 'Grupo ana' });

    // Membro comum não modera.
    await request(ctx.app).post(`/api/groups/${groupId}/pin`).set(auth(bia.token)).send({ messageId: m1.id }).expect(403);
    await request(ctx.app).delete(`/api/groups/${groupId}/messages/${m1.id}`).set(auth(bia.token)).expect(403);
    await request(ctx.app).post(`/api/groups/${groupId}/members/${ana.user.id}/mute`).set(auth(bia.token)).send({ muted: true }).expect(403);

    // Dono fixa e promove a Ana; Ana (moderadora) silencia a Bia.
    const pin = (await request(ctx.app).post(`/api/groups/${groupId}/pin`).set(auth(dono.token)).send({ messageId: m1.id }).expect(200)).body;
    expect(pin.pinned).toMatchObject({ id: m1.id });
    await request(ctx.app).post(`/api/groups/${groupId}/members/${ana.user.id}/role`).set(auth(dono.token)).send({ role: 'moderator' }).expect(200);
    await request(ctx.app).post(`/api/groups/${groupId}/members/${ana.user.id}/role`).set(auth(bia.token)).send({ role: 'member' }).expect(403);
    await request(ctx.app).post(`/api/groups/${groupId}/members/${bia.user.id}/mute`).set(auth(ana.token)).send({ muted: true }).expect(200);
    const silenciada = await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(bia.token)).send({ content: 'oi?' }).expect(403);
    expect(silenciada.body.error).toBe('muted');
    // Moderadora não mexe no dono.
    await request(ctx.app).post(`/api/groups/${groupId}/members/${dono.user.id}/mute`).set(auth(ana.token)).send({ muted: true }).expect(403);
    await request(ctx.app).delete(`/api/groups/${groupId}/members/${dono.user.id}`).set(auth(ana.token)).expect(403);

    // Apagar a fixada desfixa e tira a citação da resposta.
    await request(ctx.app).delete(`/api/groups/${groupId}/messages/${m1.id}`).set(auth(dono.token)).expect(200);
    const det2 = (await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(dono.token)).expect(200)).body;
    expect(det2.pinned).toBeNull();
    msgs = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(dono.token)).expect(200)).body as any[];
    expect(msgs.find((m) => m.content === 'Valeu, Ana!').replyTo).toBeNull();

    // Banir: sai e não volta confirmando presença de novo.
    await request(ctx.app).delete(`/api/groups/${groupId}/members/${bia.user.id}?ban=1`).set(auth(ana.token)).expect(200);
    await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(bia.token)).expect(200);
    await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(bia.token)).expect(403);
  });

  it('grupo: foto de visualização única abre uma vez por membro; silenciar notificações é por pessoa', async () => {
    const reg = async (n: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `VU ${n}`, email: `grupo-vu-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dono = await reg('dono');
    const ana = await reg('ana');
    const bia = await reg('bia');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const ev = await request(ctx.app).post('/api/events').set(auth(dono.token)).send({ title: 'Evento VU', location: 'Fortaleza' }).expect(200);
    const g = await request(ctx.app).post(`/api/events/${ev.body.id}/attend`).set(auth(ana.token)).expect(200);
    const groupId = String(g.body.groupId);
    await request(ctx.app).post(`/api/events/${ev.body.id}/attend`).set(auth(bia.token)).expect(200);

    // Foto da Ana (mídia de chat dela).
    const mediaId = `media-vu-${Date.now()}`;
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 0, 0, 'chat', ?)", [mediaId, String(ana.user.id), `${mediaId}.webp`, new Date().toISOString()]);
    await ctx.db.persist();
    const enviada = (await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(ana.token)).send({ mediaId, isViewOnce: true }).expect(200)).body;

    // Na lista, ninguém recebe o endereço da foto.
    const lista = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(bia.token)).expect(200)).body as any[];
    expect(lista.find((m) => m.id === enviada.id)).toMatchObject({ isViewOnce: true, viewedByMe: false, mediaUrl: null });

    // Bia abre uma vez; na segunda, 410. Quem enviou não abre.
    const vista = (await request(ctx.app).post(`/api/groups/${groupId}/messages/${enviada.id}/view`).set(auth(bia.token)).expect(200)).body;
    expect(vista.mediaUrl).toBe(`/uploads/${mediaId}.webp`);
    await request(ctx.app).post(`/api/groups/${groupId}/messages/${enviada.id}/view`).set(auth(bia.token)).expect(410);
    await request(ctx.app).post(`/api/groups/${groupId}/messages/${enviada.id}/view`).set(auth(ana.token)).expect(400);
    // O dono ainda pode abrir a dele.
    await request(ctx.app).post(`/api/groups/${groupId}/messages/${enviada.id}/view`).set(auth(dono.token)).expect(200);
    const daAna = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(ana.token)).expect(200)).body as any[];
    expect(daAna.find((m) => m.id === enviada.id).viewsCount).toBe(2);
    const daBia = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(bia.token)).expect(200)).body as any[];
    expect(daBia.find((m) => m.id === enviada.id).viewedByMe).toBe(true);

    // Silenciar notificações: só para quem pediu.
    await request(ctx.app).post(`/api/groups/${groupId}/notificacoes`).set(auth(bia.token)).send({ silenciar: true }).expect(200);
    expect((await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(bia.token)).expect(200)).body.notificacoesSilenciadas).toBe(true);
    expect((await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(ana.token)).expect(200)).body.notificacoesSilenciadas).toBe(false);
  });

  it('evento encerrado: vai para Encerrados, não aceita presença e o grupo vira só leitura', async () => {
    const reg = async (n: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Encerrado ${n}`, email: `ev-encerrado-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dono = await reg('dono');
    const ana = await reg('ana');
    const bia = await reg('bia');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const ev = await request(ctx.app).post('/api/events').set(auth(dono.token)).send({ title: 'Evento Que Passa', location: 'Fortaleza', date: '2099-12-31', time: '20:00' }).expect(200);
    const eventId = String(ev.body.id);
    const g = await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(ana.token)).expect(200);
    const groupId = String(g.body.groupId);
    await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(ana.token)).send({ content: 'antes do evento' }).expect(200);

    // A data passa.
    const row = (await ctx.db.queryOne('SELECT payload_json FROM events WHERE id = ?', [eventId])) as any;
    const payload = JSON.parse(String(row.payload_json));
    payload.date = '2020-01-10';
    await run(ctx.db, 'UPDATE events SET payload_json = ? WHERE id = ?', [JSON.stringify(payload), eventId]);
    await ctx.db.persist();

    const todos = (await request(ctx.app).get('/api/events').set(auth(ana.token)).expect(200)).body as any[];
    expect(todos.find((e) => e.id === eventId)?.encerrado).toBe(true);
    const proximos = (await request(ctx.app).get('/api/events?upcoming=true').set(auth(ana.token)).expect(200)).body as any[];
    expect(proximos.some((e) => e.id === eventId)).toBe(false);

    const recusa = await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(bia.token)).expect(400);
    expect(recusa.body.error).toBe('evento_encerrado');

    const grupo = (await request(ctx.app).get(`/api/groups/${groupId}`).set(auth(ana.token)).expect(200)).body;
    expect(grupo.encerrado).toBe(true);
    const bloqueio = await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(ana.token)).send({ content: 'depois' }).expect(403);
    expect(bloqueio.body.error).toBe('grupo_encerrado');
    // As mensagens antigas continuam legíveis.
    const msgs = (await request(ctx.app).get(`/api/groups/${groupId}/messages`).set(auth(ana.token)).expect(200)).body as any[];
    expect(msgs.some((m) => m.content === 'antes do evento')).toBe(true);
    const lista = (await request(ctx.app).get('/api/groups').set(auth(ana.token)).expect(200)).body as any[];
    expect(lista.find((x) => x.groupId === groupId)?.encerrado).toBe(true);
  });

  it('quem curtiu a publicação: só o dono vê a lista, com a reação de cada um', async () => {
    const reg = async (n: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Curte ${n}`, email: `quem-curtiu-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dona = await reg('dona');
    const ana = await reg('ana');
    const bia = await reg('bia');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const postId = `post-curtidas-${Date.now()}`;
    await run(ctx.db, "INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, 'Meu post', '[]', ?)", [postId, String(dona.user.id), new Date().toISOString()]);
    await ctx.db.persist();
    await request(ctx.app).post('/api/likes').set(auth(ana.token)).send({ targetType: 'post', targetId: postId, reaction: 'fire' }).expect(200);
    await request(ctx.app).post('/api/likes').set(auth(bia.token)).send({ targetType: 'post', targetId: postId }).expect(200);

    const r = (await request(ctx.app).get(`/api/posts/${postId}/likes`).set(auth(dona.token)).expect(200)).body;
    expect(r.likes.map((l: any) => l.name).sort()).toEqual(['Curte ana', 'Curte bia']);
    expect(r.likes.find((l: any) => l.name === 'Curte ana').reaction).toBe('fire');
    await request(ctx.app).get(`/api/posts/${postId}/likes`).set(auth(ana.token)).expect(403);
  });

  it('aba Grupos do chat: conta mensagens novas por grupo, zera ao abrir e respeita grupo silenciado', async () => {
    const reg = async (n: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Lidas ${n}`, email: `grupo-lidas-${n}@example.com`, password: 'senha123', gender: 'Mulher' });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dono = await reg('dono');
    const ana = await reg('ana');
    const bia = await reg('bia');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const ev = await request(ctx.app).post('/api/events').set(auth(dono.token)).send({ title: 'Evento Lidas', location: 'Fortaleza', date: '2099-12-31' }).expect(200);
    const g = await request(ctx.app).post(`/api/events/${ev.body.id}/attend`).set(auth(ana.token)).expect(200);
    const groupId = String(g.body.groupId);
    await request(ctx.app).post(`/api/events/${ev.body.id}/attend`).set(auth(bia.token)).expect(200);

    await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(bia.token)).send({ content: 'oi 1' }).expect(200);
    await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(bia.token)).send({ content: 'oi 2' }).expect(200);

    const daAna = (await request(ctx.app).get('/api/groups').set(auth(ana.token)).expect(200)).body as any[];
    expect(daAna.find((x) => x.groupId === groupId)).toMatchObject({ unreadCount: 2, lastSenderName: 'Lidas bia', lastMessagePreview: 'oi 2' });
    expect((await request(ctx.app).get('/api/conversations/unread-count').set(auth(ana.token)).expect(200)).body.gruposCount).toBe(1);
    // Quem mandou não conta as próprias.
    expect(((await request(ctx.app).get('/api/groups').set(auth(bia.token)).expect(200)).body as any[]).find((x) => x.groupId === groupId).unreadCount).toBe(0);

    // Abriu = leu.
    await new Promise((r) => setTimeout(r, 5));
    await request(ctx.app).post(`/api/groups/${groupId}/read`).set(auth(ana.token)).expect(200);
    expect(((await request(ctx.app).get('/api/groups').set(auth(ana.token)).expect(200)).body as any[]).find((x) => x.groupId === groupId).unreadCount).toBe(0);
    expect((await request(ctx.app).get('/api/conversations/unread-count').set(auth(ana.token)).expect(200)).body.gruposCount).toBe(0);

    // Silenciado: a mensagem nova aparece no grupo, mas não entra no total do Chat.
    await request(ctx.app).post(`/api/groups/${groupId}/notificacoes`).set(auth(ana.token)).send({ silenciar: true }).expect(200);
    await new Promise((r) => setTimeout(r, 5));
    await request(ctx.app).post(`/api/groups/${groupId}/messages`).set(auth(bia.token)).send({ content: 'oi 3' }).expect(200);
    const depois = ((await request(ctx.app).get('/api/groups').set(auth(ana.token)).expect(200)).body as any[]).find((x) => x.groupId === groupId);
    expect(depois).toMatchObject({ unreadCount: 1, silenciado: true });
    expect((await request(ctx.app).get('/api/conversations/unread-count').set(auth(ana.token)).expect(200)).body.gruposCount).toBe(0);
  });

  it('A Casa: admin abre, cota de homens, sala dos casais, chat sem link e cabine com aceite', async () => {
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const casal = await registerInvitedUser(ctx, sponsorToken, { name: 'Casal Casa', email: 'casal-casa@example.com', password: 'senha123', gender: 'Casal (Ele/Ela)' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(casal.user.id)]);
    const homens: Awaited<ReturnType<typeof registerInvitedUser>>[] = [];
    for (let i = 0; i < 3; i++) {
      const h = await registerInvitedUser(ctx, sponsorToken, { name: `Homem Casa ${i}`, email: `homem-casa-${i}@example.com`, password: 'senha123', gender: 'Homem' });
      await grantPremium(ctx, String(h.user.id));
      homens.push(h);
    }
    await request(ctx.app).post('/api/casa/abrir-agora').set(auth(homens[0].token)).send({ minutos: 60 }).expect(403);
    await request(ctx.app).post('/api/casa/abrir-agora').set(auth(casal.token)).send({ minutos: 60 }).expect(200);
    const info = (await request(ctx.app).get('/api/casa').set(auth(casal.token)).expect(200)).body;
    expect(info.aberta).toBe(true);
    expect(info.salas.map((s: any) => s.id)).toEqual(['salao', 'casais', 'quarto', 'cuckold', 'glory']);
    expect(info.salas[0]).toMatchObject({ pessoas: [], cabines: [] });

    const entrouCasal = (await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200)).body;
    expect(entrouCasal.eu.podeFalar).toBe(true);
    // 1 casal na sala: até 2 homens (folga da sala vazia); o terceiro espera.
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[0].token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[1].token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[2].token)).expect(409);
    await request(ctx.app).post('/api/casa/casais/entrar').set(auth(homens[2].token)).expect(403);
    // No Cuckold o solteiro entra sem fila; de lá, o casal chama ele para o Salão e ele passa na frente.
    await request(ctx.app).post('/api/casa/cuckold/entrar').set(auth(homens[2].token)).expect(200);
    await request(ctx.app).post('/api/casa/cuckold/entrar').set(auth(casal.token)).expect(200);
    await request(ctx.app).post('/api/casa/cuckold/chamar-pra-sala').set(auth(homens[2].token)).send({ para: String(casal.user.id), destino: 'salao' }).expect(403);
    await request(ctx.app).post('/api/casa/cuckold/chamar-pra-sala').set(auth(casal.token)).send({ para: String(homens[2].user.id), destino: 'casais' }).expect(400);
    await request(ctx.app).post('/api/casa/cuckold/chamar-pra-sala').set(auth(casal.token)).send({ para: String(homens[2].user.id), destino: 'salao' }).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[2].token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/sair').set(auth(homens[2].token)).expect(200);

    await request(ctx.app).post('/api/casa/salao/mensagem').set(auth(casal.token)).send({ texto: 'Boa noite, sala!' }).expect(200);
    await request(ctx.app).post('/api/casa/salao/mensagem').set(auth(homens[0].token)).send({ texto: 'me chama em wa.me/5585' }).expect(400);
    // Pedir ou mandar contato: a mensagem é barrada e a Lola avisa, mas ninguém sai da Casa.
    for (const texto of ['me passa seu número', 'qual seu insta?', 'me chama no zap', 'segue lá @casalquente', '85 9 9999-8888']) {
      await new Promise((r) => setTimeout(r, 1300));
      const barrada = (await request(ctx.app).post('/api/casa/salao/mensagem').set(auth(homens[0].token)).send({ texto }).expect(400)).body;
      expect(barrada.message).toMatch(/contato não é permitido/);
    }
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[0].token)).expect(200);

    const convite = (await request(ctx.app).post('/api/casa/salao/convidar').set(auth(casal.token)).send({ para: String(homens[0].user.id) }).expect(200)).body;
    // Cabine da Casa: porta fecha por padrão; abre só quando os dois querem; quem espia pede para entrar.
    const cab = (await request(ctx.app).post(`/api/casa/convite/${convite.id}/responder`).set(auth(homens[0].token)).send({ aceitar: true }).expect(200)).body;
    expect(cab.cabineId).toBeTruthy();
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/espiar`).set(auth(homens[1].token)).expect(403); // porta fechada
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/porta`).set(auth(casal.token)).send({ abrir: true }).expect(200);
    expect((await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/porta`).set(auth(homens[0].token)).send({ abrir: true }).expect(200)).body.aberta).toBe(true);
    // Esquentar: só liga quando os dois topam; provocação só com a cabine quente.
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/provocacao`).set(auth(casal.token)).send({}).expect(409);
    expect((await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/esquentar`).set(auth(casal.token)).send({ quer: true }).expect(200)).body.quente).toBe(false);
    expect((await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/esquentar`).set(auth(homens[0].token)).send({ quer: true }).expect(200)).body.quente).toBe(true);
    const espiando = (await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/espiar`).set(auth(homens[1].token)).expect(200)).body.cabine;
    expect(espiando.souEspectador).toBe(true);
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/mensagem`).set(auth(homens[1].token)).send({ texto: 'oi' }).expect(403);
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/mensagem`).set(auth(casal.token)).send({ texto: 'que delícia' }).expect(200);
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/pedir`).set(auth(homens[1].token)).expect(200);
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/entrada/${String(homens[1].user.id)}`).set(auth(casal.token)).send({ aprovar: true }).expect(200);
    let estadoCab = (await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(estadoCab.membros.length).toBe(2); // falta a aprovação do outro
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/entrada/${String(homens[1].user.id)}`).set(auth(homens[0].token)).send({ aprovar: true }).expect(200);
    estadoCab = (await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(estadoCab.membros.length).toBe(3);
    await request(ctx.app).post(`/api/casa/cabine/${cab.cabineId}/sair`).set(auth(homens[1].token)).expect(200);
    // O convite vai por socket; aqui pegamos o id pelo mapa interno respondendo com um id inválido primeiro.
    await request(ctx.app).post('/api/casa/convite/inexistente/responder').set(auth(homens[0].token)).send({ aceitar: true }).expect(410);

    await request(ctx.app).post('/api/casa/salao/sair').set(auth(homens[1].token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[2].token)).expect(200);
    // Fila de espera: o terceiro homem entra na fila (sala cheia para homens).
    const fila = (await request(ctx.app).post('/api/casa/salao/fila').set(auth(homens[2].token)).send({ entrar: true }).expect(200)).body;
    expect(fila.posicaoNaFila).toBe(1);
    const infoFila = (await request(ctx.app).get('/api/casa').set(auth(homens[2].token)).expect(200)).body;
    expect(infoFila.salas.find((x: any) => x.id === 'salao').posicaoNaFila).toBe(1);

    // Reserva da noite.
    const reserva = (await request(ctx.app).post('/api/casa/reservar').set(auth(homens[1].token)).send({ reservar: true }).expect(200)).body;
    expect(reserva.reservado).toBe(true);
    expect(reserva.reservas).toBeGreaterThanOrEqual(1);

    // Foto de visualização única: quem recebe abre 1 vez; quem enviou não reabre.
    const mid = `m-casa-${Date.now()}`;
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, 'casa.webp', 'image/webp', 0, 0, 'chat', ?)", [mid, String(casal.user.id), new Date().toISOString()]);
    await request(ctx.app).post('/api/casa/salao/midia').set(auth(homens[0].token)).send({ mediaId: mid }).expect(404); // mídia de outra pessoa
    await request(ctx.app).post('/api/casa/salao/midia').set(auth(casal.token)).send({ mediaId: mid }).expect(200);
    await new Promise((r) => setTimeout(r, 50)); // o histórico é gravado em segundo plano
    const msgMidia = (await ctx.db.queryOne("SELECT id FROM casa_mensagens WHERE media_id = ? LIMIT 1", [mid])) as any;
    expect(msgMidia?.id).toBeTruthy();
    const vista = (await request(ctx.app).post(`/api/casa/salao/midia/${msgMidia.id}/ver`).set(auth(homens[0].token)).expect(200)).body;
    expect(vista.url).toBe('/uploads/casa.webp');
    await request(ctx.app).post(`/api/casa/salao/midia/${msgMidia.id}/ver`).set(auth(homens[0].token)).expect(410);
    await request(ctx.app).post(`/api/casa/salao/midia/${msgMidia.id}/ver`).set(auth(casal.token)).expect(400);

    // Anúncios: começa com as 3 campanhas do Instagram e aceita novas.
    await request(ctx.app).get('/api/admin/anuncios').set(auth(homens[0].token)).expect(403);
    const anuncios = (await request(ctx.app).get('/api/admin/anuncios').set(auth(casal.token)).expect(200)).body.campanhas;
    expect(anuncios.length).toBe(3);
    await request(ctx.app).post('/api/admin/anuncios').set(auth(casal.token)).send({ nome: 'Teste', canal: 'Instagram', inicio: '2026-10-20T00:00:00Z', fim: '2026-10-19T00:00:00Z', valorCents: 1000 }).expect(400);
    await request(ctx.app).post('/api/admin/anuncios').set(auth(casal.token)).send({ nome: 'Teste', canal: 'Instagram', inicio: '2026-10-19T00:00:00Z', fim: '2026-10-20T00:00:00Z', valorCents: 1000 }).expect(200);
    expect((await request(ctx.app).get('/api/admin/anuncios').set(auth(casal.token)).expect(200)).body.campanhas.length).toBe(4);

    // Painel ao vivo do admin.
    await request(ctx.app).get('/api/casa/admin/ao-vivo').set(auth(homens[0].token)).expect(403);
    const vivo = (await request(ctx.app).get('/api/casa/admin/ao-vivo').set(auth(casal.token)).expect(200)).body;
    expect(vivo.aberta).toBe(true);
    expect(vivo.salas.find((x: any) => x.id === 'salao').presentes.length).toBeGreaterThanOrEqual(1);
    await request(ctx.app).post('/api/casa/admin/recado').set(auth(casal.token)).send({ texto: 'Boa noite, Casa!', sala: 'salao' }).expect(200);

    // Painel de negócio (sem Hub nos testes: assinaturas vazias).
    await request(ctx.app).get('/api/casa/admin/negocio').set(auth(homens[0].token)).expect(403);
    const negocio = (await request(ctx.app).get('/api/casa/admin/negocio').set(auth(casal.token)).expect(200)).body;
    expect(negocio.noites.length).toBeGreaterThanOrEqual(1);
    expect(negocio.noites[0].tokens.premiosDaCasa).toBeGreaterThanOrEqual(5); // +5 de entrada por pessoa

    // Histórico do admin.
    await request(ctx.app).get('/api/casa/admin/noites').set(auth(homens[0].token)).expect(403);
    const noites = (await request(ctx.app).get('/api/casa/admin/noites').set(auth(casal.token)).expect(200)).body.noites;
    expect(noites.length).toBeGreaterThanOrEqual(1);
    const detalhe = (await request(ctx.app).get(`/api/casa/admin/noites/${encodeURIComponent(noites[0].noite)}`).set(auth(casal.token)).expect(200)).body;
    expect(detalhe.mensagens.some((m: any) => m.texto === 'Boa noite, sala!')).toBe(true);
    expect(detalhe.mensagens.find((m: any) => m.midia)?.midia.vistas).toBe(1);

    // Clima de casa de swing: pulseira, olhar e drink (sem saldo = 402).
    expect((await request(ctx.app).post('/api/casa/salao/pulseira').set(auth(casal.token)).send({ cor: 'verde' }).expect(200)).body.pulseira).toBe('verde');
    await request(ctx.app).post('/api/casa/salao/pulseira').set(auth(casal.token)).send({ cor: 'azul' }).expect(400);
    expect((await request(ctx.app).post('/api/casa/salao/olhar').set(auth(homens[0].token)).send({ para: String(casal.user.id) }).expect(200)).body.cruzados).toBe(false);
    expect((await request(ctx.app).post('/api/casa/salao/olhar').set(auth(casal.token)).send({ para: String(homens[0].user.id) }).expect(200)).body.cruzados).toBe(true);
    await run(ctx.db, 'UPDATE users SET token_points = 0, tokens_comprados = 0 WHERE id = ?', [String(homens[0].user.id)]);
    await request(ctx.app).post('/api/casa/salao/drink').set(auth(homens[0].token)).send({ para: String(casal.user.id), drink: 'champanhe' }).expect(402);
    await run(ctx.db, 'UPDATE users SET token_points = 20 WHERE id = ?', [String(homens[0].user.id)]);
    await request(ctx.app).post('/api/casa/salao/drink').set(auth(homens[0].token)).send({ para: String(casal.user.id), drink: 'champanhe' }).expect(200);
    await request(ctx.app).post('/api/casa/salao/drink').set(auth(homens[0].token)).send({ para: String(casal.user.id), drink: 'cerveja', mensagem: 'me chama em wa.me/55' }).expect(400);
    await request(ctx.app).post('/api/casa/salao/drink').set(auth(homens[0].token)).send({ para: String(casal.user.id), drink: 'constructor' }).expect(400);
    const saldoCasal = (await ctx.db.queryOne('SELECT token_points FROM users WHERE id = ?', [String(casal.user.id)])) as any;
    expect(Number(saldoCasal.token_points)).toBeGreaterThanOrEqual(15);

    // Desafio sugerido valendo tokens (privado): guarda, aceita, cumpre e paga.
    const prop = (await request(ctx.app).post('/api/casa/salao/propor').set(auth(casal.token)).send({ para: String(homens[0].user.id), texto: 'Foto da sua cueca agora', tokens: 10, privado: true }).expect(200)).body;
    const saldoAntes = Number(((await ctx.db.queryOne('SELECT token_points FROM users WHERE id = ?', [String(homens[0].user.id)])) as any).token_points);
    await request(ctx.app).post(`/api/casa/proposta/${prop.id}/responder`).set(auth(casal.token)).send({ aceitar: true }).expect(410); // só o desafiado responde
    await request(ctx.app).post(`/api/casa/proposta/${prop.id}/responder`).set(auth(homens[0].token)).send({ aceitar: true }).expect(200);
    const midHomem = `m-casa-h-${Date.now()}`;
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, 'cueca.webp', 'image/webp', 0, 0, 'chat', ?)", [midHomem, String(homens[0].user.id), new Date().toISOString()]);
    await request(ctx.app).post('/api/casa/salao/midia').set(auth(homens[0].token)).send({ mediaId: midHomem, propostaId: prop.id }).expect(200);
    const saldoDepois = Number(((await ctx.db.queryOne('SELECT token_points FROM users WHERE id = ?', [String(homens[0].user.id)])) as any).token_points);
    expect(saldoDepois - saldoAntes).toBe(10);
    await new Promise((r) => setTimeout(r, 50));
    const privada = (await ctx.db.queryOne('SELECT id FROM casa_mensagens WHERE media_id = ?', [midHomem])) as any;
    await request(ctx.app).post(`/api/casa/salao/midia/${privada.id}/ver`).set(auth(homens[2].token)).expect(404); // não é para ele
    await request(ctx.app).post(`/api/casa/salao/midia/${privada.id}/ver`).set(auth(casal.token)).expect(200);
    const ranking = (await request(ctx.app).get('/api/casa/ranking?periodo=noite&cat=todos').set(auth(casal.token)).expect(200)).body.ranking;
    expect(ranking.some((r: any) => r.id === String(homens[0].user.id))).toBe(true);

    // Glory Hole: anônimo (id e nome escondidos) até a pessoa revelar.
    const glory = (await request(ctx.app).post('/api/casa/glory/entrar').set(auth(casal.token)).expect(200)).body;
    const euNaGlory = glory.presentes.find((x: any) => x.id === glory.eu.idPublico);
    expect(euNaGlory.nome).toMatch(/^Anônimo/);
    expect(glory.eu.idPublico).not.toBe(String(casal.user.id));
    await request(ctx.app).post('/api/casa/glory/revelar').set(auth(casal.token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200);

    // Página pública: sem login, só números.
    const pub = (await request(ctx.app).get('/api/casa/publico').expect(200)).body;
    expect(pub.aberta).toBe(true);
    expect(pub.pessoas).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(pub)).not.toContain('Casal Casa');
    // Responder e reagir a uma mensagem da sala.
    await request(ctx.app).post('/api/casa/salao/mensagem').set(auth(casal.token)).send({ texto: 'quem topa uma dança?' }).expect(200);
    const naSala = (await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[0].token)).expect(200)).body;
    const original = naSala.mensagens.find((m: any) => m.texto === 'quem topa uma dança?');
    expect(original).toBeTruthy();
    const reagiu = (await request(ctx.app).post('/api/casa/salao/reagir').set(auth(homens[0].token)).send({ mensagemId: original.id, emoji: '🔥' }).expect(200)).body;
    expect(reagiu.reacoes['🔥']).toHaveLength(1);
    await request(ctx.app).post('/api/casa/salao/reagir').set(auth(homens[0].token)).send({ mensagemId: original.id, emoji: '💩' }).expect(400);
    const tirou = (await request(ctx.app).post('/api/casa/salao/reagir').set(auth(homens[0].token)).send({ mensagemId: original.id, emoji: '🔥' }).expect(200)).body;
    expect(tirou.reacoes['🔥']).toBeUndefined();
    await new Promise((r) => setTimeout(r, 1300));
    await request(ctx.app).post('/api/casa/salao/mensagem').set(auth(homens[0].token)).send({ texto: 'eu topo', respostaA: original.id }).expect(200);
    const depois = (await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200)).body;
    expect(depois.mensagens.find((m: any) => m.texto === 'eu topo')?.resposta).toMatchObject({ id: original.id, nome: 'Casal Casa' });

    // Cabine: convite aceito; a porta só abre quando os dois concordam; o mapa mostra a cabine.
    const homemPublico = String(homens[0].user.id);
    const conviteMapa = (await request(ctx.app).post('/api/casa/salao/convidar').set(auth(casal.token)).send({ para: homemPublico }).expect(200)).body;
    const cabMapa = (await request(ctx.app).post(`/api/casa/convite/${conviteMapa.id}/responder`).set(auth(homens[0].token)).send({ aceitar: true }).expect(200)).body;
    expect(cabMapa.cabineId).toBeTruthy();
    expect((await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/porta`).set(auth(casal.token)).send({ abrir: true }).expect(200)).body.aberta).toBe(false);
    expect((await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/porta`).set(auth(homens[0].token)).send({ abrir: true }).expect(200)).body.aberta).toBe(true);
    const mapa = (await request(ctx.app).get('/api/casa').set(auth(homens[2].token)).expect(200)).body;
    expect(mapa.salas.find((s: any) => s.id === 'salao').cabines.find((c: any) => c.id === cabMapa.cabineId)).toMatchObject({ aberta: true, pessoas: 2 });
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/porta`).set(auth(casal.token)).send({ abrir: false }).expect(200);
    expect((await request(ctx.app).get('/api/casa').set(auth(homens[2].token)).expect(200)).body.salas.find((s: any) => s.id === 'salao').cabines.find((c: any) => c.id === cabMapa.cabineId)).toMatchObject({ aberta: false, tipos: [] });

    // Ações da cabine: beijo sempre; preliminares só esquentada; transa só com tesão ≥ 40.
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(casal.token)).send({ acao: 'beijo' }).expect(200);
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(homens[0].token)).send({ acao: 'chupar' }).expect(409);
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/esquentar`).set(auth(casal.token)).send({ quer: true }).expect(200);
    // O outro recusa o convite pra transar: fica o aviso delicado e nada libera.
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/esquentar`).set(auth(homens[0].token)).send({ quer: false }).expect(200);
    const recusou = (await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(recusou.quente).toBe(false);
    expect(recusou.mensagens.some((m: any) => /prefere ir com calma/.test(m.texto))).toBe(true);
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/esquentar`).set(auth(homens[0].token)).send({ quer: true }).expect(200);
    // Liberado pelos dois, mas a Lola só abre as preliminares quando a conversa esquenta.
    expect((await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(homens[0].token)).send({ acao: 'chupar' }).expect(409)).body.error).toBe('cedo');
    for (const texto of ['que tesão', 'tô molhada', 'quero chupar', 'vem foder']) {
      await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/mensagem`).set(auth(casal.token)).send({ texto }).expect(200);
    }
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(homens[0].token)).send({ acao: 'chupar' }).expect(200);
    // Cena de troca de casais não vale entre casal e solteiro.
    expect((await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(casal.token)).send({ acao: 'cc_troca' }).expect(400)).body.error).toBe('cena');
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/acao`).set(auth(casal.token)).send({ acao: 'inventada' }).expect(400);
    const estadoAcoes = (await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(estadoAcoes.calor).toBe(39);
    expect(estadoAcoes.nivelLiberado).toBe(1);
    expect(estadoAcoes.mensagens.some((m: any) => /liberei as PRELIMINARES/.test(m.texto))).toBe(true);
    expect(estadoAcoes.mensagens.filter((m: any) => m.tipo === 'acao').map((m: any) => m.efeito)).toEqual(['beijo', 'chupar']);

    // Provocações para escolher: só quem está dentro vê a lista.
    const listaProv = (await request(ctx.app).get(`/api/casa/cabine/${cabMapa.cabineId}/provocacoes`).set(auth(casal.token)).expect(200)).body;
    expect(listaProv.niveis.map((n: any) => n.nivel)).toEqual([1, 2, 3]);
    await request(ctx.app).get(`/api/casa/cabine/${cabMapa.cabineId}/provocacoes`).set(auth(homens[2].token)).expect(403);
    expect(Array.isArray(estadoAcoes.espiandoLista)).toBe(true);

    // Reagir e responder mensagens dentro da cabine.
    const beijoMsg = estadoAcoes.mensagens.find((m: any) => m.tipo === 'acao');
    expect((await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/reagir`).set(auth(homens[0].token)).send({ mensagemId: beijoMsg.id, emoji: '💦' }).expect(200)).body.reacoes['💦']).toHaveLength(1);
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/reagir`).set(auth(homens[2].token)).send({ mensagemId: beijoMsg.id, emoji: '💦' }).expect(403);
    await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/mensagem`).set(auth(homens[0].token)).send({ texto: 'que delícia', respostaA: beijoMsg.id }).expect(200);
    const comResposta = (await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(comResposta.mensagens.find((m: any) => m.texto === 'que delícia')?.resposta?.id).toBe(beijoMsg.id);

    // Quem sai da Casa aparece como fora na cabine (e volta ao entrar de novo).
    await request(ctx.app).post('/api/casa/salao/sair').set(auth(homens[0].token)).expect(200);
    const comAusente = (await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(comAusente.membros.find((m: any) => m.id === String(homens[0].user.id))?.naCasa).toBe(false);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(homens[0].token)).expect(200);
    const voltou = (await request(ctx.app).post(`/api/casa/cabine/${cabMapa.cabineId}/estado`).set(auth(casal.token)).expect(200)).body.cabine;
    expect(voltou.membros.find((m: any) => m.id === String(homens[0].user.id))?.naCasa).toBe(true);

    // Mídia "para todos": abre quantas vezes quiser, inclusive quem enviou.
    const midiaLivre = `m-livre-${Date.now()}`;
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, 'livre.webp', 'image/webp', 0, 0, 'chat', ?)", [midiaLivre, String(casal.user.id), new Date().toISOString()]);
    await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200);
    await request(ctx.app).post('/api/casa/salao/midia').set(auth(casal.token)).send({ mediaId: midiaLivre, livre: true }).expect(200);
    const comLivre = (await request(ctx.app).post('/api/casa/salao/entrar').set(auth(casal.token)).expect(200)).body;
    const msgLivre = comLivre.mensagens.find((m: any) => m.tipo === 'midia' && m.midia?.livre);
    expect(msgLivre?.texto).toBe('📸 Foto para todos');
    await request(ctx.app).post(`/api/casa/salao/midia/${msgLivre.id}/ver`).set(auth(casal.token)).expect(200);
    await request(ctx.app).post(`/api/casa/salao/midia/${msgLivre.id}/ver`).set(auth(casal.token)).expect(200);

    // Rádio: sem playlist não toca; playlist é só do admin.
    expect((await request(ctx.app).get('/api/casa/radio').set(auth(homens[0].token)).expect(200)).body.tocando).toBeNull();
    await request(ctx.app).get('/api/casa/admin/playlist').set(auth(homens[0].token)).expect(403);
    expect((await request(ctx.app).get('/api/casa/admin/playlist').set(auth(casal.token)).expect(200)).body.faixas).toEqual([]);
    await request(ctx.app).get('/api/casa/musica/..%2F..%2Fdata.db').expect(404);
    // Quarto Cuckold: homens entram à vontade, sem cota.
    for (const h of homens) await request(ctx.app).post('/api/casa/cuckold/entrar').set(auth(h.token)).expect(200);
    for (const h of homens) await request(ctx.app).post('/api/casa/cuckold/sair').set(auth(h.token)).expect(200);
    await request(ctx.app).post('/api/casa/abrir-agora').set(auth(casal.token)).send({ minutos: 0 }).expect(200);

    // Modo teste: só admin e convidados veem a Casa aberta; a página pública e os outros veem fechada.
    await request(ctx.app).post('/api/casa/abrir-agora').set(auth(casal.token)).send({ minutos: 60, teste: true, convidados: 'homem-casa-1@example.com' }).expect(200);
    expect((await request(ctx.app).get('/api/casa').set(auth(casal.token)).expect(200)).body.aberta).toBe(true);
    expect((await request(ctx.app).get('/api/casa').set(auth(homens[1].token)).expect(200)).body.aberta).toBe(true);
    expect((await request(ctx.app).get('/api/casa').set(auth(homens[2].token)).expect(200)).body.aberta).toBe(false);
    await request(ctx.app).post('/api/casa/quarto/entrar').set(auth(homens[2].token)).expect(403);
    expect((await request(ctx.app).get('/api/casa/publico').expect(200)).body.aberta).toBe(false);
    await request(ctx.app).post('/api/casa/abrir-agora').set(auth(casal.token)).send({ minutos: 0 }).expect(200);
  }, 30_000);

  it('vitrine: só uma curtida, na primeira publicação; sem match e sem curtir story', async () => {
    const { runShowcaseFeedLikes, runShowcaseProfileLikes, runShowcaseStoryEngagement } = await import('./showcase.js');
    const vit = await registerInvitedUser(ctx, sponsorToken, { name: 'Vitrine Teste', email: 'vitrine-teste@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_showcase = 1 WHERE id = ?', [String(vit.user.id)]);
    const autor = await registerInvitedUser(ctx, sponsorToken, { name: 'Autor Vitrine', email: 'autor-vitrine@example.com', password: 'senha123', gender: 'Homem' });
    const aid = String(autor.user.id);
    const agora = Date.now();
    const p1 = `p1-vit-${agora}`;
    const p2 = `p2-vit-${agora}`;
    await run(ctx.db, "INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, 'primeiro', '[]', ?)", [p1, aid, new Date(agora - 60_000).toISOString()]);
    await run(ctx.db, "INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, 'segundo', '[]', ?)", [p2, aid, new Date(agora).toISOString()]);
    await ctx.db.persist();

    const curtidasDaVitrine = async (postId: string) => Number(((await ctx.db.queryOne(
      "SELECT COUNT(*) AS c FROM likes l JOIN users u ON u.id = l.user_id WHERE l.target_type = 'post' AND l.target_id = ? AND COALESCE(u.is_showcase, 0) = 1",
      [postId]
    )) as any)?.c || 0);

    await runShowcaseFeedLikes(ctx.db);
    await runShowcaseFeedLikes(ctx.db);
    expect(await curtidasDaVitrine(p1)).toBe(1);
    expect(await curtidasDaVitrine(p2)).toBe(0);

    // Match desligado.
    expect((await runShowcaseProfileLikes(ctx.db)).liked).toBe(0);
    // Story: só visualiza.
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, 'x.webp', 'image/webp', 0, 0, 'post', ?)", [`m-vit-${agora}`, aid, new Date().toISOString()]);
    await run(ctx.db, 'INSERT INTO stories (id, user_id, media_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [`s-vit-${agora}`, aid, `m-vit-${agora}`, new Date().toISOString(), new Date(agora + 86_400_000).toISOString()]);
    const st = await runShowcaseStoryEngagement(ctx.db, { chancePorRodada: 1, percentualQueVe: 100 });
    expect(st.likes).toBe(0);
    expect(st.views).toBeGreaterThanOrEqual(1);
    await run(ctx.db, 'UPDATE users SET is_showcase = 0 WHERE id = ?', [String(vit.user.id)]);
  });

  it('mulher entra com 30 dias; casal sem assinatura lê o que recebe e responde, mas não puxa conversa', async () => {
    const mulher = await registerInvitedUser(ctx, sponsorToken, { name: 'Mulher Gratis', email: 'mulher-gratis@example.com', password: 'senha123', gender: 'Mulher' });
    // Mulher entra com 30 dias; vitalício só depois de verificada.
    const trialMulher = (await ctx.db.queryOne('SELECT trial_ends_at FROM users WHERE id = ?', [String(mulher.user.id)])) as any;
    expect(String(trialMulher.trial_ends_at)).not.toContain('2099');
    expect(Date.parse(String(trialMulher.trial_ends_at))).toBeGreaterThan(Date.now() + 25 * 86_400_000);

    const homem = await registerInvitedUser(ctx, sponsorToken, { name: 'Homem Pagante', email: 'homem-pagante@example.com', password: 'senha123', gender: 'Homem' });
    await grantPremium(ctx, String(homem.user.id));
    const casal = await registerInvitedUser(ctx, sponsorToken, { name: 'Casal Sem Plano', email: 'casal-sem-plano@example.com', password: 'senha123', gender: 'Casal (Ele/Ela)' });
    const outro = await registerInvitedUser(ctx, sponsorToken, { name: 'Outro Perfil', email: 'outro-perfil-casal@example.com', password: 'senha123', gender: 'Mulher' });
    // Teste grátis do casal acabou e ele não assina.
    await run(ctx.db, "UPDATE users SET is_premium = 0, trial_ends_at = '2020-01-01T00:00:00.000Z' WHERE id = ?", [String(casal.user.id)]);
    await ctx.db.persist();
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    // Homem puxa conversa com o casal.
    const conv = (await request(ctx.app).post('/api/conversations').set(auth(homem.token)).send({ userId: casal.user.id }).expect(200)).body;
    await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(auth(homem.token)).send({ content: 'Oi casal' }).expect(200);

    // Casal lê (sem cadeado) e responde.
    const msgs = (await request(ctx.app).get(`/api/conversations/${conv.id}/messages`).set(auth(casal.token)).expect(200)).body;
    const lista = Array.isArray(msgs) ? msgs : (msgs.messages ?? []);
    const recebida = lista.find((m: any) => m.senderId === homem.user.id);
    expect(recebida.content).toBe('Oi casal');
    expect(recebida.isLocked).toBe(false);
    await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(auth(casal.token)).send({ content: 'Oi! Tudo bem?' }).expect(200);

    // Mas não puxa conversa nova.
    await request(ctx.app).post('/api/conversations').set(auth(casal.token)).send({ userId: outro.user.id }).expect(403);
  });

  it('verificação de mulher: código, selfie, admin aprova = selo + acesso vitalício; recusa deixa tentar de novo', async () => {
    const ana = await registerInvitedUser(ctx, sponsorToken, { name: 'Ana Verifica', email: 'ana-verifica@example.com', password: 'senha123', gender: 'Mulher' });
    const homem = await registerInvitedUser(ctx, sponsorToken, { name: 'Homem Verifica', email: 'homem-verifica@example.com', password: 'senha123', gender: 'Homem' });
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Verifica', email: 'admin-verifica@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    await ctx.db.persist();
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    // Homem também pode verificar, mas ganha só o selo (acesso não muda).
    await request(ctx.app).post('/api/verificacao/codigo').set(auth(homem.token)).expect(200);
    const selfieHomem = `selfie-homem-${Date.now()}`;
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 0, 0, 'chat', ?)", [selfieHomem, String(homem.user.id), `${selfieHomem}.webp`, new Date().toISOString()]);
    await ctx.db.persist();
    await request(ctx.app).post('/api/verificacao/enviar').set(auth(homem.token)).send({ mediaId: selfieHomem }).expect(200);
    const trialHomemAntes = ((await ctx.db.queryOne('SELECT trial_ends_at FROM users WHERE id = ?', [String(homem.user.id)])) as any).trial_ends_at;
    const pedHomem = ((await request(ctx.app).get('/api/admin/verificacoes').set(auth(adm.token)).expect(200)).body.pedidos as any[]).find((p) => p.userId === homem.user.id);
    await request(ctx.app).post(`/api/admin/verificacoes/${pedHomem.id}/aprovar`).set(auth(adm.token)).expect(200);
    const homemDepois = (await ctx.db.queryOne('SELECT is_verified, trial_ends_at FROM users WHERE id = ?', [String(homem.user.id)])) as any;
    expect(Number(homemDepois.is_verified)).toBe(1);
    expect(homemDepois.trial_ends_at).toBe(trialHomemAntes);

    const selfie = async (n: string) => {
      const id = `selfie-${n}-${Date.now()}`;
      await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 0, 0, 'chat', ?)", [id, String(ana.user.id), `${id}.webp`, new Date().toISOString()]);
      await ctx.db.persist();
      return id;
    };

    // 1ª tentativa: recusada.
    const c1 = (await request(ctx.app).post('/api/verificacao/codigo').set(auth(ana.token)).expect(200)).body.codigo;
    expect(String(c1)).toMatch(/^\d{4}$/);
    await request(ctx.app).post('/api/verificacao/enviar').set(auth(ana.token)).send({ mediaId: await selfie('1') }).expect(200);
    expect((await request(ctx.app).get('/api/verificacao').set(auth(ana.token)).expect(200)).body.pedido.status).toBe('em_analise');
    let pend = (await request(ctx.app).get('/api/admin/verificacoes').set(auth(adm.token)).expect(200)).body.pedidos as any[];
    const p1 = pend.find((p) => p.userId === ana.user.id);
    expect(p1).toMatchObject({ codigo: c1 });
    await request(ctx.app).post(`/api/admin/verificacoes/${p1.id}/recusar`).set(auth(adm.token)).send({ motivo: 'O código não aparece' }).expect(200);
    const depoisRecusa = (await request(ctx.app).get('/api/verificacao').set(auth(ana.token)).expect(200)).body;
    expect(depoisRecusa.pedido).toMatchObject({ status: 'recusada', motivo: 'O código não aparece' });
    expect(depoisRecusa.verificada).toBe(false);

    // 2ª tentativa: aprovada.
    await request(ctx.app).post('/api/verificacao/codigo').set(auth(ana.token)).expect(200);
    await request(ctx.app).post('/api/verificacao/enviar').set(auth(ana.token)).send({ mediaId: await selfie('2') }).expect(200);
    pend = (await request(ctx.app).get('/api/admin/verificacoes').set(auth(adm.token)).expect(200)).body.pedidos as any[];
    const p2 = pend.find((p) => p.userId === ana.user.id);
    await request(ctx.app).post(`/api/admin/verificacoes/${p2.id}/aprovar`).set(auth(adm.token)).expect(200);
    const u = (await ctx.db.queryOne('SELECT is_verified, trial_ends_at FROM users WHERE id = ?', [String(ana.user.id)])) as any;
    expect(Number(u.is_verified)).toBe(1);
    expect(String(u.trial_ends_at)).toContain('2099');
    // Usuária comum não acessa a fila do admin.
    await request(ctx.app).get('/api/admin/verificacoes').set(auth(ana.token)).expect(403);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(adm.user.id)]);
  });

  it('lista de conversas: 300 mais recentes + antigas não lidas; todas=1 traz tudo e o cabeçalho avisa', async () => {
    const dona = await registerInvitedUser(ctx, sponsorToken, { name: 'Muitas Conversas', email: 'muitas-conversas@example.com', password: 'senha123', gender: 'Mulher' });
    const did = String(dona.user.id);
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    let naoLidaAntiga = '';
    for (let i = 0; i < 305; i++) {
      const uid = `conv300-u-${i}`;
      await run(ctx.db, "INSERT INTO users (id, email, password_hash, name, created_at, invite_status) VALUES (?, ?, 'x', ?, ?, 'approved')", [uid, `conv300-${i}@example.com`, `Pessoa ${i}`, new Date(base).toISOString()]);
      const cid = `conv300-c-${i}`;
      const [a, b] = [did, uid].sort();
      const quando = new Date(base + i * 60_000).toISOString();
      await run(ctx.db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [cid, a, b, quando]);
      // A mais antiga tem mensagem NÃO lida: precisa aparecer mesmo fora das 300.
      await run(ctx.db, 'INSERT INTO messages (id, conversation_id, sender_id, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [`conv300-m-${i}`, cid, uid, 'oi', i === 0 ? 0 : 1, quando]);
      if (i === 0) naoLidaAntiga = cid;
    }
    await ctx.db.persist();
    const auth = { Authorization: `Bearer ${dona.token}` };

    const r = await request(ctx.app).get('/api/conversations').set(auth).expect(200);
    expect(r.body.length).toBe(301);
    expect(r.body.some((c: any) => c.id === naoLidaAntiga)).toBe(true);
    expect(r.headers['x-mais-conversas']).toBe('4');

    const todas = await request(ctx.app).get('/api/conversations?todas=1').set(auth).expect(200);
    expect(todas.body.length).toBe(305);
    expect(todas.headers['x-mais-conversas']).toBeUndefined();
  });

  it('desempenho do servidor: só admin; recursos e respostas por período; consultas indisponíveis fora do Postgres', async () => {
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Desempenho', email: 'admin-desempenho@example.com', password: 'senha123', gender: 'Mulher' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    const agora = new Date().toISOString();
    await run(ctx.db, "INSERT INTO recursos_amostras (id, medido_em, cpu, memoria, disco, carga, videos_fila) VALUES ('ra-teste-1', ?, 42.5, 20.1, 39.8, 0.3, 0)", [agora]);
    await run(ctx.db, "INSERT INTO desempenho_respostas (id, inicio, pedidos, media_ms, p95_ms, max_ms, erros, lentas_json) VALUES ('dr-teste-1', ?, 120, 85, 310, 900, 1, ?)",
      [agora, JSON.stringify([{ rota: 'GET /api/feed', pedidos: 40, mediaMs: 200, maxMs: 900 }])]);
    await ctx.db.persist();
    const auth = { Authorization: `Bearer ${adm.token}` };

    const d24 = (await request(ctx.app).get('/api/admin/desempenho?horas=24').set(auth).expect(200)).body;
    expect(d24.recursos.some((r: any) => r.cpu === 42.5)).toBe(true);
    expect(d24.respostas.some((r: any) => r.p95Ms === 310)).toBe(true);
    expect(d24.rotasLentas[0]).toMatchObject({ rota: 'GET /api/feed', pedidos: 40, mediaMs: 200 });
    const d7 = (await request(ctx.app).get('/api/admin/desempenho?horas=168').set(auth).expect(200)).body;
    expect(d7.horas).toBe(168);
    expect(d7.respostas.length).toBeGreaterThanOrEqual(1);

    const c = (await request(ctx.app).get('/api/admin/desempenho/consultas').set(auth).expect(200)).body;
    expect(c.disponivel).toBe(false);
    await request(ctx.app).get('/api/admin/desempenho').set('Authorization', `Bearer ${sponsorToken}`).expect(403);
    await run(ctx.db, 'UPDATE users SET is_admin = 0 WHERE id = ?', [String(adm.user.id)]);
  });

  it('promotor troca a chave Pix só com a senha certa', async () => {
    const p = await registerInvitedUser(ctx, sponsorToken, { name: 'Promotor Pix', email: 'promotor-pix@example.com', password: 'senha123', gender: 'Homem' });
    const auth = { Authorization: `Bearer ${p.token}` };
    // Sem ser promotor: 404.
    await request(ctx.app).put('/api/promoter/pix').set(auth).send({ pixKey: 'nova@pix.com', senha: 'senha123' }).expect(404);
    await request(ctx.app).post('/api/promoter/activate').set(auth).send({ fullName: 'Promotor Pix', pixKey: 'antiga@pix.com', acceptTerms: true }).expect(200);
    const errada = await request(ctx.app).put('/api/promoter/pix').set(auth).send({ pixKey: 'nova@pix.com', senha: 'errada' }).expect(400);
    expect(errada.body.error).toBe('wrong_password');
    await request(ctx.app).put('/api/promoter/pix').set(auth).send({ pixKey: 'antiga@pix.com', senha: 'senha123' }).expect(400);
    const ok = await request(ctx.app).put('/api/promoter/pix').set(auth).send({ pixKey: 'nova@pix.com', senha: 'senha123' }).expect(200);
    expect(ok.body.pixKey).toBe('nova@pix.com');
    const row = (await ctx.db.queryOne('SELECT pix_key FROM promoters WHERE user_id = ?', [String(p.user.id)])) as any;
    expect(row.pix_key).toBe('nova@pix.com');
  });

  it('LGPD: excluir conta apaga fotos (arquivo e registro), posts, mensagens e localização; pagamentos ficam', async () => {
    const bia = await registerInvitedUser(ctx, sponsorToken, { name: 'Bia Sai', email: 'bia-sai@example.com', password: 'senha123', gender: 'Mulher' });
    const leo = await registerInvitedUser(ctx, sponsorToken, { name: 'Leo Fica', email: 'leo-fica@example.com', password: 'senha123', gender: 'Homem' });
    const biaId = String(bia.user.id);
    const leoId = String(leo.user.id);
    const agora = new Date().toISOString();

    const foto = `lgpd-foto-${Date.now()}`;
    const arquivo = path.join(process.cwd(), 'storage', 'public', `${foto}.webp`);
    mkdirSync(path.dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, 'x');
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, created_at) VALUES (?, ?, ?, 'image/webp', 0, 1, ?)", [foto, biaId, `${foto}.webp`, agora]);
    await run(ctx.db, 'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)', [`post-${foto}`, biaId, 'meu post', JSON.stringify([foto]), agora]);
    await run(ctx.db, 'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)', [`post-leo-${foto}`, leoId, 'post do leo', '[]', agora]);
    await run(ctx.db, "INSERT INTO comments (id, user_id, target_type, target_id, content, created_at) VALUES (?, ?, 'post', ?, 'oi leo', ?)", [`com-${foto}`, biaId, `post-leo-${foto}`, agora]);
    await run(ctx.db, "INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, 'post', ?, ?)", [`like-${foto}`, biaId, `post-leo-${foto}`, agora]);
    const cid = `conv-${foto}`;
    await run(ctx.db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [cid, biaId, leoId, agora]);
    await run(ctx.db, 'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [`msg-bia-${foto}`, cid, biaId, 'mensagem da bia', agora]);
    await run(ctx.db, 'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [`msg-leo-${foto}`, cid, leoId, 'mensagem do leo', agora]);
    await run(ctx.db, "UPDATE users SET lat = -3.7, lon = -38.5, city = 'Fortaleza', state = 'CE', bio = 'minha bio' WHERE id = ?", [biaId]);
    await run(ctx.db, "INSERT INTO compras_tokens (id, user_id, pacote, tokens, valor_cents, metodo, order_id, status, criado_em) VALUES (?, ?, 'p150', 150, 990, 'PIX', ?, 'pago', ?)", [`compra-${foto}`, biaId, `ord-${foto}`, agora]);
    await ctx.db.persist();
    await request(ctx.app).get(`/uploads/${foto}.webp`).expect(200);

    await request(ctx.app).post('/api/profile/delete-account').set({ Authorization: `Bearer ${bia.token}` }).send({}).expect(200);

    const conta = async (sql: string, params: any[]) => Number(((await ctx.db.queryOne(sql, params)) as any).c);
    expect(await conta('SELECT COUNT(*) AS c FROM media WHERE user_id = ?', [biaId])).toBe(0);
    expect(existsSync(arquivo)).toBe(false);
    await request(ctx.app).get(`/uploads/${foto}.webp`).expect(404);
    expect(await conta('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?', [biaId])).toBe(0);
    expect(await conta('SELECT COUNT(*) AS c FROM comments WHERE user_id = ?', [biaId])).toBe(0);
    expect(await conta('SELECT COUNT(*) AS c FROM likes WHERE user_id = ?', [biaId])).toBe(0);
    expect(await conta('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ?', [biaId])).toBe(0);
    // O que é do outro continua: a mensagem e o post do Leo.
    expect(await conta('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ?', [leoId])).toBe(1);
    expect(await conta('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?', [leoId])).toBe(1);
    // Pagamento fica (obrigação legal).
    expect(await conta('SELECT COUNT(*) AS c FROM compras_tokens WHERE user_id = ?', [biaId])).toBe(1);
    const u = (await ctx.db.queryOne('SELECT name, email, lat, lon, city, state, bio, avatar, dados_apagados_em FROM users WHERE id = ?', [biaId])) as any;
    expect(u).toMatchObject({ name: 'Usuário excluído', lat: null, lon: null, city: null, state: null, bio: null, avatar: null });
    expect(String(u.email)).toMatch(/^deleted_/);
    expect(u.dados_apagados_em).toBeTruthy();
  });

  it('LGPD: baixar meus dados traz perfil, posts e mensagens enviadas, sem senha; 1 vez por minuto', async () => {
    const caio = await registerInvitedUser(ctx, sponsorToken, { name: 'Caio Exporta', email: 'caio-exporta@example.com', password: 'senha123', gender: 'Homem' });
    const duda = await registerInvitedUser(ctx, sponsorToken, { name: 'Duda Recebe', email: 'duda-recebe@example.com', password: 'senha123', gender: 'Mulher' });
    const caioId = String(caio.user.id);
    const agora = new Date().toISOString();
    await run(ctx.db, 'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)', [`post-exp-${caioId}`, caioId, 'post exportado', '[]', agora]);
    const cid = `conv-exp-${caioId}`;
    await run(ctx.db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [cid, caioId, String(duda.user.id), agora]);
    await run(ctx.db, 'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [`msg-exp-1-${caioId}`, cid, caioId, 'oi duda', agora]);
    await run(ctx.db, 'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [`msg-exp-2-${caioId}`, cid, String(duda.user.id), 'oi caio', agora]);
    await ctx.db.persist();
    const auth = { Authorization: `Bearer ${caio.token}` };

    const r = await request(ctx.app).get('/api/profile/meus-dados').set(auth).expect(200);
    expect(String(r.headers['content-disposition'])).toMatch(/attachment; filename="nosigilo-meus-dados-/);
    expect(r.body.perfil.email).toBe('caio-exporta@example.com');
    expect(r.body.perfil.password_hash).toBeUndefined();
    expect(r.body.posts.map((p: any) => p.content)).toEqual(['post exportado']);
    // Só as mensagens que ele enviou (as recebidas são dados da outra pessoa).
    expect(r.body.mensagensEnviadas).toHaveLength(1);
    expect(r.body.mensagensEnviadas[0]).toMatchObject({ content: 'oi duda', para: 'Duda Recebe' });

    await request(ctx.app).get('/api/profile/meus-dados').set(auth).expect(429);
  });

  it('LGPD: selfie de verificação vira privada e é apagada depois da análise', async () => {
    const eva = await registerInvitedUser(ctx, sponsorToken, { name: 'Eva Selfie', email: 'eva-selfie@example.com', password: 'senha123', gender: 'Mulher' });
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Selfie', email: 'admin-selfie@example.com', password: 'senha123', gender: 'Homem' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    const selfie = `selfie-lgpd-${Date.now()}`;
    // Simula o app antigo, que mandava a selfie como pública.
    await run(ctx.db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 0, 0, 'chat', ?)", [selfie, String(eva.user.id), `${selfie}.webp`, new Date().toISOString()]);
    await ctx.db.persist();
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    await request(ctx.app).post('/api/verificacao/codigo').set(auth(eva.token)).expect(200);
    await request(ctx.app).post('/api/verificacao/enviar').set(auth(eva.token)).send({ mediaId: selfie }).expect(200);
    expect(Number(((await ctx.db.queryOne('SELECT is_private FROM media WHERE id = ?', [selfie])) as any).is_private)).toBe(1);
    await request(ctx.app).get(`/uploads/${selfie}.webp`).expect(404);

    const pedido = ((await request(ctx.app).get('/api/admin/verificacoes').set(auth(adm.token)).expect(200)).body.pedidos as any[]).find((p) => p.userId === eva.user.id);
    expect(String(pedido.selfie)).toMatch(/^\/private-uploads\/.+\?token=/);

    await request(ctx.app).post(`/api/admin/verificacoes/${pedido.id}/aprovar`).set(auth(adm.token)).expect(200);
    expect(await ctx.db.queryOne('SELECT id FROM media WHERE id = ?', [selfie])).toBeFalsy();
    const v = (await ctx.db.queryOne('SELECT status, media_id FROM verificacoes_perfil WHERE user_id = ?', [String(eva.user.id)])) as any;
    expect(v).toMatchObject({ status: 'aprovada', media_id: null });
  });

  it('LGPD: cadastro grava quando e qual versão da política foi aceita', async () => {
    const nova = await registerInvitedUser(ctx, sponsorToken, { name: 'Gabi Aceita', email: 'gabi-aceita@example.com', password: 'senha123', gender: 'Mulher', termosVersao: '2026-10-12' } as any);
    const antigo = await registerInvitedUser(ctx, sponsorToken, { name: 'Hugo Antigo', email: 'hugo-antigo@example.com', password: 'senha123', gender: 'Homem' });
    const a = (await ctx.db.queryOne('SELECT termos_aceitos_em, termos_versao FROM users WHERE id = ?', [String(nova.user.id)])) as any;
    expect(a.termos_versao).toBe('2026-10-12');
    expect(a.termos_aceitos_em).toBeTruthy();
    // App antigo não manda a versão, mas só envia com a caixinha marcada.
    const b = (await ctx.db.queryOne('SELECT termos_versao FROM users WHERE id = ?', [String(antigo.user.id)])) as any;
    expect(b.termos_versao).toBe('anterior');
  });

  it('LGPD: GPS é guardado arredondado (~1 km), não o ponto exato', async () => {
    const ivo = await registerInvitedUser(ctx, sponsorToken, { name: 'Ivo Gps', email: 'ivo-gps@example.com', password: 'senha123', gender: 'Homem' });
    await request(ctx.app).put('/api/location').set({ Authorization: `Bearer ${ivo.token}` }).send({ lat: -3.7318627, lng: -38.5266704 }).expect(200);
    const u = (await ctx.db.queryOne('SELECT lat, lon, location_source FROM users WHERE id = ?', [String(ivo.user.id)])) as any;
    expect(Number(u.lat)).toBe(-3.73);
    expect(Number(u.lon)).toBe(-38.53);
    expect(u.location_source).toBe('gps');
  });

  it('evento: só os perfis escolhidos veem e confirmam; limite de participantes vale', async () => {
    const reg = async (n: string, gender: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Ev ${n}`, email: `ev-perfil-${n}@example.com`, password: 'senha123', gender });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const dono = await reg('dono', 'Homem');
    const casal1 = await reg('casal1', 'Casal (Ele/Ela)');
    const casal2 = await reg('casal2', 'Casal (Ela/Ela)');
    const mulher = await reg('mulher', 'Mulher');
    const homem = await reg('homem', 'Homem');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const ev = await request(ctx.app).post('/api/events').set(auth(dono.token))
      .send({ title: 'Só casais e mulheres', location: 'Fortaleza', maxAttendees: 2, perfisPermitidos: ['casal', 'mulher', 'inventado'] }).expect(200);
    const eventId = String(ev.body.id);
    const ids = async (t: string) => ((await request(ctx.app).get('/api/events').set(auth(t)).expect(200)).body as any[]).map((e) => String(e.id));

    // Homem não vê e não consegue confirmar; casal e mulher veem; o criador vê.
    expect(await ids(homem.token)).not.toContain(eventId);
    expect(await ids(casal1.token)).toContain(eventId);
    expect(await ids(mulher.token)).toContain(eventId);
    expect(await ids(dono.token)).toContain(eventId);
    const negado = await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(homem.token)).expect(403);
    expect(negado.body.error).toBe('perfil_nao_permitido');

    // Limite 2: o terceiro não entra, e a lista avisa que lotou.
    await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(casal1.token)).expect(200);
    await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(casal2.token)).expect(200);
    const lotado = await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(mulher.token)).expect(400);
    expect(lotado.body.error).toBe('evento_lotado');
    const doEvento = ((await request(ctx.app).get('/api/events').set(auth(mulher.token)).expect(200)).body as any[]).find((e) => String(e.id) === eventId);
    expect(doEvento).toMatchObject({ lotado: true, perfisPermitidos: ['casal', 'mulher'], maxAttendees: 2 });
    // Quem já confirmou pode confirmar de novo sem erro.
    await request(ctx.app).post(`/api/events/${eventId}/attend`).set(auth(casal1.token)).expect(200);
  });

  it('dicas no Chat: conta oficial dá boas-vindas, fica fora da busca e PARAR encerra', async () => {
    const novo = await registerInvitedUser(ctx, sponsorToken, { name: 'Casal Novato', email: 'casal-novato@example.com', password: 'senha123', gender: 'Casal (Ele/Ela)' });
    const adm = await registerInvitedUser(ctx, sponsorToken, { name: 'Admin Dicas', email: 'admin-dicas@example.com', password: 'senha123', gender: 'Homem' });
    await run(ctx.db, 'UPDATE users SET is_admin = 1 WHERE id = ?', [String(adm.user.id)]);
    const novoId = String(novo.user.id);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    // Cadastro entra na fila; adianta a primeira dica e roda.
    expect(await ctx.db.queryOne('SELECT etapa FROM dicas_chat WHERE user_id = ?', [novoId])).toMatchObject({ etapa: 0 });
    await run(ctx.db, "UPDATE dicas_chat SET proxima_em = '2000-01-01T00:00:00.000Z' WHERE user_id = ?", [novoId]);
    await ctx.db.persist();
    const rodou = await request(ctx.app).post('/api/admin/dicas-chat/rodar').set(auth(adm.token)).send({}).expect(200);
    expect(rodou.body.enviadas).toBeGreaterThanOrEqual(1);

    const oficial = (await ctx.db.queryOne('SELECT id, name FROM users WHERE conta_oficial = 1', [])) as any;
    expect(oficial.name).toBe('NoSigilo');
    const conv = (await ctx.db.queryOne('SELECT id FROM conversations WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)', [oficial.id, novoId, novoId, oficial.id])) as any;
    const msgs = (await ctx.db.queryAll('SELECT sender_id, content FROM messages WHERE conversation_id = ? ORDER BY created_at', [String(conv.id)])) as any[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toContain('Oi, Casal Novato!');
    expect(msgs[0].content).toContain('Que bom ter vocês aqui');
    expect(msgs[0].content).toContain('PARAR');
    const fila = (await ctx.db.queryOne('SELECT etapa, proxima_em FROM dicas_chat WHERE user_id = ?', [novoId])) as any;
    expect(fila.etapa).toBe(1);
    expect(fila.proxima_em > new Date().toISOString()).toBe(true);

    // A conta oficial não aparece na busca.
    const busca = await request(ctx.app).get('/api/users').query({ q: 'NoSigilo' }).set(auth(novo.token)).expect(200);
    const lista = (Array.isArray(busca.body) ? busca.body : busca.body.users ?? busca.body.items ?? []) as any[];
    expect(lista.some((u) => String(u.id) === String(oficial.id))).toBe(false);

    // Responder PARAR (sem assinatura) encerra as dicas e recebe confirmação.
    await request(ctx.app).post(`/api/conversations/${conv.id}/messages`).set(auth(novo.token)).send({ content: 'Parar' }).expect(200);
    for (let i = 0; i < 20; i++) {
      const fim = (await ctx.db.queryOne('SELECT concluido_em FROM dicas_chat WHERE user_id = ?', [novoId])) as any;
      if (fim.concluido_em) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(((await ctx.db.queryOne('SELECT concluido_em FROM dicas_chat WHERE user_id = ?', [novoId])) as any).concluido_em).toBeTruthy();
    await new Promise((r) => setTimeout(r, 100));
    const ultima = (await ctx.db.queryOne('SELECT sender_id, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1', [String(conv.id)])) as any;
    expect(String(ultima.sender_id)).toBe(String(oficial.id));
    expect(ultima.content).toContain('não mando mais dicas');
  });

  it('ativos agora: sua cidade, depois seu estado, depois o resto (mesmo se o de longe for mais recente)', async () => {
    const reg = async (n: string, city: string, state: string) =>
      registerInvitedUser(ctx, sponsorToken, { name: `Ativo ${n}`, email: `ativo-reg-${n}@example.com`, password: 'senha123', gender: 'Casal (Ele/Ela)', city, state });
    const eu = await reg('eu', 'Fortaleza', 'CE');
    const longe = await reg('longe', 'São Paulo', 'SP');
    const estado = await reg('estado', 'Sobral', 'CE');
    const cidade = await reg('cidade', 'Fortaleza', 'CE');
    const agora = Date.now();
    // O de São Paulo é o mais recente de todos.
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date(agora - 60_000).toISOString(), String(longe.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date(agora - 30 * 60_000).toISOString(), String(estado.user.id)]);
    await run(ctx.db, 'UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date(agora - 50 * 60_000).toISOString(), String(cidade.user.id)]);
    await ctx.db.persist();
    const r = await request(ctx.app).get('/api/feed/active-now').set({ Authorization: `Bearer ${eu.token}` }).expect(200);
    const ids = (r.body.profiles as any[]).map((p) => String(p.id));
    const pos = (id: unknown) => ids.indexOf(String(id));
    expect(pos(cidade.user.id)).toBeGreaterThanOrEqual(0);
    expect(pos(cidade.user.id)).toBeLessThan(pos(estado.user.id));
    expect(pos(estado.user.id)).toBeLessThan(pos(longe.user.id));
  });

  it('stories: autor recebe aviso quando o story chega a 25 visualizações', async () => {
    const autora = await registerInvitedUser(ctx, sponsorToken, { name: 'Lia Stories', email: 'lia-stories@example.com', password: 'senha123', gender: 'Mulher' });
    const fa = await registerInvitedUser(ctx, sponsorToken, { name: 'Fa Marco Stories', email: 'fa-marco-stories@example.com', password: 'senha123', gender: 'Homem' });
    const autoraId = String(autora.user.id);
    const storyId = `story-marco-${Date.now()}`;
    const agora = new Date();
    await run(ctx.db, "INSERT INTO stories (id, user_id, media_id, text, background, audience, created_at, expires_at) VALUES (?, ?, '', 'oi', 'sunset', 'all', ?, ?)",
      [storyId, autoraId, agora.toISOString(), new Date(agora.getTime() + 86_400_000).toISOString()]);
    // 24 visualizações de outras pessoas já registradas.
    for (let i = 0; i < 24; i++) {
      await run(ctx.db, 'INSERT INTO story_views (id, story_id, viewer_id, viewed_at) VALUES (?, ?, ?, ?)', [`sv-${storyId}-${i}`, storyId, `viewer-falso-${i}`, agora.toISOString()]);
    }
    await ctx.db.persist();
    // A 25ª, pela rota de verdade.
    await request(ctx.app).post(`/api/stories/${storyId}/view`).set({ Authorization: `Bearer ${fa.token}` }).expect(200);
    let aviso: any = null;
    for (let i = 0; i < 20 && !aviso; i++) {
      aviso = await ctx.db.queryOne("SELECT title FROM notifications WHERE user_id = ? AND type = 'story.marco'", [autoraId]);
      if (!aviso) await new Promise((r) => setTimeout(r, 50));
    }
    expect(aviso?.title).toContain('25 pessoas');
  });

  it('cadastro: nome em uso devolve sugestões livres; origem do 1º contato é gravada', async () => {
    await registerInvitedUser(ctx, sponsorToken, { name: 'Casal Teste SP', email: 'casal-teste-sp@example.com', password: 'senha123', gender: 'Casal (Ele/Ela)' });
    const r = await request(ctx.app).get('/api/auth/check-name').query({ name: 'casal teste sp' }).expect(200);
    expect(r.body.available).toBe(false);
    expect(r.body.sugestoes.length).toBeGreaterThan(0);
    for (const sug of r.body.sugestoes as string[]) {
      const livre = await request(ctx.app).get('/api/auth/check-name').query({ name: sug }).expect(200);
      expect(livre.body.available).toBe(true);
    }

    const novo = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Veio Do Insta', email: 'veio-do-insta@example.com', password: 'senha123', gender: 'Homem',
      primeiroToque: { ref: 'l.instagram.com', app: 'instagram', em: new Date().toISOString() },
    } as any);
    const u = (await ctx.db.queryOne('SELECT origem_canal, origem_json FROM users WHERE id = ?', [String(novo.user.id)])) as any;
    expect(u.origem_canal).toBe('Instagram');
    expect(JSON.parse(u.origem_json).ref).toBe('l.instagram.com');

    const utm = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Veio Da Campanha', email: 'veio-da-campanha@example.com', password: 'senha123', gender: 'Mulher',
      primeiroToque: { utmSource: 'tiktok', ref: 'google.com' },
    } as any);
    expect(((await ctx.db.queryOne('SELECT origem_canal FROM users WHERE id = ?', [String(utm.user.id)])) as any).origem_canal).toBe('TikTok');
  });

  it('usos de tokens: super curtida, disponível hoje, story/evento em destaque e presente no chat', async () => {
    const reg = async (n: string, gender: string) => {
      const r = await registerInvitedUser(ctx, sponsorToken, { name: `Tk ${n}`, email: `tk-usos-${n}@example.com`, password: 'senha123', gender });
      await grantPremium(ctx, String(r.user.id));
      return r;
    };
    const homem = await reg('homem', 'Homem');
    const mulher = await reg('mulher', 'Mulher');
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
    const saldo = async (id: string) => Number(((await queryOne(ctx.db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [id])) as any).p);
    const idH = String(homem.user.id);
    const idM = String(mulher.user.id);

    // Super curtida sem saldo: 402 e nada de curtida gravada.
    const sem = await request(ctx.app).post('/api/match/like').set(auth(homem.token)).send({ userId: idM, superCurtida: true }).expect(402);
    expect(sem.body.custo).toBe(5);
    expect(await queryOne(ctx.db, "SELECT id FROM likes WHERE user_id = ? AND target_type = 'user' AND target_id = ?", [idH, idM])).toBeFalsy();

    await run(ctx.db, 'UPDATE users SET token_points = 100 WHERE id = ?', [idH]);
    const sup = await request(ctx.app).post('/api/match/like').set(auth(homem.token)).send({ userId: idM, superCurtida: true }).expect(200);
    expect(sup.body.superCurtida).toBe(true);
    expect(sup.body.tokensRestantes).toBe(95);
    // Repetir não cobra de novo.
    await request(ctx.app).post('/api/match/like').set(auth(homem.token)).send({ userId: idM, superCurtida: true }).expect(200);
    expect(await saldo(idH)).toBe(95);
    const notif = (await queryOne(ctx.db, "SELECT title FROM notifications WHERE user_id = ? AND type = 'profile.super_liked'", [idM])) as any;
    expect(String(notif?.title)).toContain('Super Curtida');

    // Disponível hoje: cobra 10 uma vez, aparece para quem procura esse perfil.
    await run(ctx.db, "UPDATE users SET state = 'CE', looking_for_json = ? WHERE id IN (?, ?)", [JSON.stringify(['Homem', 'Mulher']), idH, idM]);
    const disp = await request(ctx.app).post('/api/tokens/disponivel-hoje').set(auth(homem.token)).expect(200);
    expect(disp.body.disponivelAte).toBeTruthy();
    const deNovo = await request(ctx.app).post('/api/tokens/disponivel-hoje').set(auth(homem.token)).expect(200);
    expect(deNovo.body.jaAtivo).toBe(true);
    expect(await saldo(idH)).toBe(85);
    const lista = (await request(ctx.app).get('/api/disponiveis-hoje').set(auth(mulher.token)).expect(200)).body.perfis as any[];
    expect(lista.map((p) => p.id)).toContain(idH);
    expect(lista.find((p) => p.id === idH)?.disponivelHoje).toBe(true);
    await request(ctx.app).post('/api/tokens/disponivel-hoje/encerrar').set(auth(homem.token)).expect(200);
    const depois = (await request(ctx.app).get('/api/disponiveis-hoje').set(auth(mulher.token)).expect(200)).body.perfis as any[];
    expect(depois.some((p) => p.id === idH)).toBe(false);

    // Story em destaque: só o dono, cobra 15.
    const st = await request(ctx.app).post('/api/stories').set(auth(homem.token)).send({ text: 'oi', background: 'pink' });
    if (st.status === 200 || st.status === 201) {
      const storyId = String(st.body.id ?? st.body.story?.id);
      await request(ctx.app).post(`/api/stories/${storyId}/destacar`).set(auth(mulher.token)).expect(404);
      await request(ctx.app).post(`/api/stories/${storyId}/destacar`).set(auth(homem.token)).expect(200);
      expect(await saldo(idH)).toBe(70);
    } else {
      await run(ctx.db, 'UPDATE users SET token_points = 70 WHERE id = ?', [idH]);
    }

    // Evento em destaque: só o criador, cobra 30, vem primeiro na lista.
    const ev1 = await request(ctx.app).post('/api/events').set(auth(homem.token)).send({ title: 'Evento A', location: 'Fortaleza' }).expect(200);
    await request(ctx.app).post('/api/events').set(auth(homem.token)).send({ title: 'Evento B', location: 'Fortaleza' }).expect(200);
    await request(ctx.app).post(`/api/events/${ev1.body.id}/destacar`).set(auth(mulher.token)).expect(404);
    await request(ctx.app).post(`/api/events/${ev1.body.id}/destacar`).set(auth(homem.token)).expect(200);
    expect(await saldo(idH)).toBe(40);
    const eventos = (await request(ctx.app).get('/api/events').set(auth(mulher.token)).expect(200)).body as any[];
    expect(eventos[0].id).toBe(ev1.body.id);
    expect(eventos[0].emDestaque).toBe(true);

    // Presente no chat: debita, credita quem recebe e vira mensagem com o presente.
    const conv = await request(ctx.app).post('/api/conversations').set(auth(homem.token)).send({ userId: idM }).expect(200);
    const cid = String(conv.body.id);
    await request(ctx.app).post(`/api/conversations/${cid}/presente`).set(auth(homem.token)).send({ presente: 'inventado' }).expect(400);
    const antesM = await saldo(idM);
    await request(ctx.app).post(`/api/conversations/${cid}/presente`).set(auth(homem.token)).send({ presente: 'rosa' }).expect(200);
    expect(await saldo(idH)).toBe(35);
    expect(await saldo(idM)).toBe(antesM + 5);
    const msgs = (await request(ctx.app).get(`/api/conversations/${cid}/messages`).set(auth(mulher.token)).expect(200)).body;
    const lista2 = (Array.isArray(msgs) ? msgs : msgs.messages) as any[];
    expect(lista2.some((m) => m.presente === 'rosa')).toBe(true);
    // Sem saldo para a coroa (30): 402.
    await request(ctx.app).post(`/api/conversations/${cid}/presente`).set(auth(homem.token)).send({ presente: 'coroa' }).expect(200);
    await request(ctx.app).post(`/api/conversations/${cid}/presente`).set(auth(homem.token)).send({ presente: 'coroa' }).expect(402);
  });

  // Regressão do chamado de 21/10/2026 (casal SalaVermelha): a aba "Vídeos" do
  // perfil esvaziava para quem postava muita foto. Ela pegava as N postagens
  // mais recentes e só DEPOIS descartava as sem vídeo — então os vídeos
  // antigos ficavam fora da janela e a aba aparecia vazia, mesmo com dezenas
  // de vídeos na conta (e tudo continuava no feed, o que assustou o casal).
  it('aba Videos do perfil acha videos antigos mesmo com muitas fotos postadas depois', async () => {
    const autora = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Posta Muito', email: 'posta-muito@example.com', password: 'senha123', gender: 'Mulher',
    });
    const A = { Authorization: `Bearer ${autora.token}` };
    const dono = String(autora.user.id);
    const agora = Date.now();
    const quando = (minutosAtras: number) => new Date(agora - minutosAtras * 60000).toISOString();

    // 3 vídeos antigos.
    const idsVideo: string[] = [];
    for (let i = 0; i < 3; i++) {
      const mid = `v-regress-${i}`;
      await run(ctx.db,
        "INSERT INTO media (id, user_id, filename, mime_type, size, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'video/mp4', 10, 0, 0, 'post', ?)",
        [mid, dono, `${mid}.mp4`, quando(500 - i)]);
      const pid = `p-video-${i}`;
      await run(ctx.db,
        'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)',
        [pid, dono, '', JSON.stringify([mid]), quando(500 - i)]);
      idsVideo.push(pid);
    }

    // 40 fotos DEPOIS: empurram os vídeos para fora das 30 postagens recentes.
    for (let i = 0; i < 40; i++) {
      const mid = `f-regress-${i}`;
      await run(ctx.db,
        "INSERT INTO media (id, user_id, filename, mime_type, size, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 10, 0, 0, 'post', ?)",
        [mid, dono, `${mid}.webp`, quando(100 - i)]);
      await run(ctx.db,
        'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)',
        [`p-foto-${i}`, dono, '', JSON.stringify([mid]), quando(100 - i)]);
    }

    // Antes da correção isto vinha vazio: nenhum dos 30 posts mais recentes
    // tinha vídeo, apesar dos 3 vídeos existirem.
    const videos = await request(ctx.app)
      .get(`/api/users/${dono}/posts?videosOnly=true&limit=30`).set(A).expect(200);
    const voltaram = videos.body.posts.map((p: any) => p.id);
    expect(voltaram).toHaveLength(3);
    for (const pid of idsVideo) expect(voltaram).toContain(pid);

    // A aba sem filtro continua trazendo as mais recentes (as fotos).
    const tudo = await request(ctx.app)
      .get(`/api/users/${dono}/posts?limit=30`).set(A).expect(200);
    expect(tudo.body.posts).toHaveLength(30);
    expect(tudo.body.posts[0].id).toBe('p-foto-39');

    // Galeria de fotos: com 40 fotos, o teto fixo de 20 escondia as antigas.
    const galeria = await request(ctx.app).get('/api/photos/recent?limit=200').set(A).expect(200);
    expect(galeria.body.length).toBe(40);
  });
});
