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
  const app = createApp({ db, env: { FRONTEND_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'test-secret', TRIAL_DAYS: 30 } });
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

async function registerApprovedUser(
  ctx: Ctx,
  inviterToken: string,
  data: { name: string; email: string; password: string; gender: string; birthDate?: string; city?: string; state?: string; lookingFor?: string[] }
) {
  const invite = await createInviteFor(ctx, inviterToken);
  const registerResponse = await request(ctx.app)
    .post('/api/auth/register')
    .send({ ...data, inviteToken: invite.token })
    .expect(202);
  expect(registerResponse.body.status).toBe('pending_approval');
  await request(ctx.app).post(`/api/invites/${invite.id}/approve`).set('Authorization', `Bearer ${inviterToken}`).expect(200);
  const login = await request(ctx.app)
    .post('/api/auth/login')
    .send({ email: data.email, password: data.password })
    .expect(200);
  return { invite, registerResponse, token: login.body.token as string, user: login.body.user as any };
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
    const reg = await registerApprovedUser(ctx, sponsorToken, {
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

  it('invite-only registration requires approval from the sponsor', async () => {
    const invite = await createInviteFor(ctx, sponsorToken);

    const publicInfo = await request(ctx.app).get(`/api/invites/public/${invite.token}`).expect(200);
    expect(publicInfo.body.canRegister).toBe(true);
    expect(publicInfo.body.inviter.name).toBe('Sponsor Principal');

    const pendingRegister = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Convidado Pendente',
        email: 'pendente@example.com',
        password: 'senha123',
        gender: 'Homem',
        inviteToken: invite.token,
      })
      .expect(202);
    expect(pendingRegister.body.status).toBe('pending_approval');

    const pendingLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'pendente@example.com', password: 'senha123' })
      .expect(403);
    expect(pendingLogin.body.error).toBe('pending_invite_approval');
    expect(pendingLogin.body.inviter?.name).toBe('Sponsor Principal');

    const pendingAccess = await request(ctx.app)
      .get('/api/auth/pending-access')
      .query({ email: 'pendente@example.com' })
      .expect(200);
    expect(pendingAccess.body.invitationStatus).toBe('pending');
    expect(pendingAccess.body.inviter?.name).toBe('Sponsor Principal');

    const inviteList = await request(ctx.app).get('/api/invites').set('Authorization', `Bearer ${sponsorToken}`).expect(200);
    expect(inviteList.body.some((item: any) => item.id === invite.id && item.status === 'pending_approval')).toBe(true);

    await request(ctx.app).post(`/api/invites/${invite.id}/approve`).set('Authorization', `Bearer ${sponsorToken}`).expect(200);

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'pendente@example.com', password: 'senha123' })
      .expect(200);
    expect(login.body.user.invitedBy?.name).toBe('Sponsor Principal');
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
    await registerApprovedUser(ctx, sponsorToken, {
      name: 'Casal Alpha',
      email: 'casal-alpha@example.com',
      password: 'senha123',
      birthDate: '1994-01-01',
      gender: 'Casal (Ele/Ela)',
      city: 'São Paulo',
      state: 'SP',
    });

    await registerApprovedUser(ctx, sponsorToken, {
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

  it('non-premium can send but cannot read received messages', async () => {
    const regA = await registerApprovedUser(ctx, sponsorToken, {
      name: 'A',
      email: 'a@example.com',
      password: 'senha123',
      birthDate: '1990-01-01',
      gender: 'Homem',
    });
    const tokenA = regA.token;
    const idA = regA.user.id;
    await run(ctx.db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', idA]);

    const regB = await registerApprovedUser(ctx, sponsorToken, {
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
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ userId: idB })
      .expect(200);
    const conversationId = conv.body.id;
    expect(conversationId).toBeTypeOf('string');

    await request(ctx.app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ content: 'mensagem privada' })
      .expect(200);

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
    const reg = await registerApprovedUser(ctx, sponsorToken, {
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

  it('likes and comments generate notifications for post owner', async () => {
    const ownerReg = await registerApprovedUser(ctx, sponsorToken, {
      name: 'Owner',
      email: 'owner-post@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;

    const actorReg = await registerApprovedUser(ctx, sponsorToken, {
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

  it('private photos require approval and generate notifications', async () => {
    const ownerReg = await registerApprovedUser(ctx, sponsorToken, {
      name: 'Dono',
      email: 'dono@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const ownerToken = ownerReg.token;
    const ownerId = ownerReg.user.id as string;

    const viewerReg = await registerApprovedUser(ctx, sponsorToken, {
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

  it('friends requests persist and can be read', async () => {
    const regA = await registerApprovedUser(ctx, sponsorToken, { name: 'A2', email: 'a2@example.com', password: 'senha123', gender: 'Homem' });
    const tokenA = regA.token;
    const idA = regA.user.id as string;

    const regB = await registerApprovedUser(ctx, sponsorToken, { name: 'B2', email: 'b2@example.com', password: 'senha123', gender: 'Mulher' });
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
    const regA = await registerApprovedUser(ctx, sponsorToken, {
      name: 'ConvA',
      email: 'conva@example.com',
      password: 'senha123',
      gender: 'Homem',
    });
    const tokenA = regA.token;
    const idA = regA.user.id as string;

    const regB = await registerApprovedUser(ctx, sponsorToken, {
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

  it('premium users can create events with notifications enabled', async () => {
    const hostReg = await registerApprovedUser(ctx, sponsorToken, {
      name: 'EventoA',
      email: 'eventoa@example.com',
      password: 'senha123',
      gender: 'Homem',
      city: 'Fortaleza',
      state: 'CE',
    });
    const hostToken = hostReg.token;
    const hostId = hostReg.user.id as string;

    const guestReg = await registerApprovedUser(ctx, sponsorToken, {
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

    const sender = await registerApprovedUser(ctx, sponsorToken, {
      name: 'Casal Radar',
      email: 'radar-casal@example.com',
      password: 'senha123',
      gender: 'Casal (Ele/Ela)',
      city: 'Fortaleza',
      state: 'CE',
    });

    const viewer = await registerApprovedUser(ctx, sponsorToken, {
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

    const contact = await request(ctx.app)
      .post(`/api/radar/${incoming.body.incoming[0].id}/contact`)
      .set('Authorization', `Bearer ${viewer.token}`)
      .expect(200);
    expect(contact.body.conversationId).toBeTypeOf('string');

    const mine = await request(ctx.app).get('/api/radar').set('Authorization', `Bearer ${sender.token}`).expect(200);
    expect(mine.body.myBroadcasts[0].deliveriesCount).toBe(1);
    expect(mine.body.myBroadcasts[0].viewsCount).toBe(1);
    expect(mine.body.myBroadcasts[0].responsesCount).toBe(1);
    expect(mine.body.myBroadcasts[0].deliveries[0].viewer.name).toBe('Viewer Radar');
  });
});
