import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync, rmSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

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

  it('invite-only registration grants immediate access and consumes the invite', async () => {
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

    const inviteList = await request(ctx.app).get('/api/invites').set('Authorization', `Bearer ${sponsorToken}`).expect(200);
    expect(inviteList.body.some((item: any) => item.id === invite.id && item.status === 'approved')).toBe(true);

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'direto@example.com', password: 'senha123' })
      .expect(200);
    expect(login.body.user.invitedBy?.name).toBe('Sponsor Principal');

    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Convite Reutilizado',
        email: 'reutilizado@example.com',
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

  it('onboarding suggestions returns matching users', async () => {
    await registerInvitedUser(ctx, sponsorToken, {
      name: 'Casal Alpha',
      email: 'casal-alpha@example.com',
      password: 'senha123',
      birthDate: '1994-01-01',
      gender: 'Casal (Ele/Ela)',
      city: 'São Paulo',
      state: 'SP',
    });

    await registerInvitedUser(ctx, sponsorToken, {
      name: 'Maria',
      email: 'maria@example.com',
      password: 'senha123',
      birthDate: '1998-01-01',
      gender: 'Mulher',
      city: 'São Paulo',
      state: 'SP',
      lookingFor: ['Homem'],
    });

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

    expect(feed.body.posts.some((post: any) => String(post.id) === String(adminPost.body.id))).toBe(false);
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
      lookingFor: ['Mulher'],
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

    const authorReg = await registerInvitedUser(ctx, sponsorToken, {
      name: 'Autor Feed Paginação',
      email: 'author-feed-paginacao@example.com',
      password: 'senha123',
      gender: 'Mulher',
    });
    const authorId = String(authorReg.user.id);

    const marker = '[TEST-FEED-PAGINACAO]';
    const totalPosts = 95;
    const baseTime = Date.parse('2100-01-01T12:00:00.000Z');
    const expectedIds = new Set<string>();

    for (let i = 0; i < totalPosts; i += 1) {
      const postId = `feed-page-${i}-${Math.random().toString(16).slice(2)}`;
      const createdAt = new Date(baseTime - i * 60_000).toISOString();
      expectedIds.add(postId);
      await run(
        ctx.db,
        'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [postId, authorId, `${marker} Feed paginado ${i}`, null, 0, createdAt]
      );
    }
    await ctx.db.persist();

    const foundIds = new Set<string>();
    let page = 1;
    let hasMore = true;
    let safety = 0;

    while (hasMore && safety < 12) {
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

  it('reels prioritize interested profiles first and keep newest first within each group', async () => {
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

    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2026-04-18T12:00:00.000Z', interestedRecentPostId]);
    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2026-04-17T12:00:00.000Z', interestedOlderPostId]);
    await run(ctx.db, 'UPDATE posts SET created_at = ? WHERE id = ?', ['2026-04-18T18:00:00.000Z', uninterestedNewestPostId]);

    const feed = await request(ctx.app)
      .get('/api/feed')
      .query({ includeReelsOnly: true, limit: 10 })
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);

    expect(Array.isArray(feed.body.posts)).toBe(true);
    expect(feed.body.posts.slice(0, 3).map((post: any) => String(post.id))).toEqual([
      interestedRecentPostId,
      interestedOlderPostId,
      uninterestedNewestPostId,
    ]);
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
});
