import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync, rmSync } from 'node:fs';
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

describe('nosigilo backend', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await createTestCtx();
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('register/login/me flow works', async () => {
    const reg = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Teste',
        email: 'teste@example.com',
        password: 'senha123',
        birthDate: '1999-01-01',
        gender: 'Homem',
        lookingFor: ['Mulher'],
      })
      .expect(200);

    expect(reg.body.token).toBeTypeOf('string');
    expect(reg.body.user.email).toBe('teste@example.com');

    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'teste@example.com', password: 'senha123' })
      .expect(200);

    const token = login.body.token;
    expect(token).toBeTypeOf('string');

    const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.email).toBe('teste@example.com');
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
    await request(ctx.app)
      .post('/api/auth/register')
      .send({
        name: 'Maria',
        email: 'maria@example.com',
        password: 'senha123',
        birthDate: '1998-01-01',
        gender: 'Mulher',
        city: 'São Paulo',
        state: 'SP',
        lookingFor: ['Homem'],
      })
      .expect(200);

    const sug = await request(ctx.app).get('/api/onboarding/suggestions').query({ lookingFor: 'Mulher', city: 'São Paulo', state: 'SP' }).expect(200);
    expect(Array.isArray(sug.body)).toBe(true);
    expect(sug.body.some((u: any) => u.name === 'Maria')).toBe(true);
  });

  it('non-premium can send but cannot read received messages', async () => {
    const regA = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'a@example.com', password: 'senha123', birthDate: '1990-01-01', gender: 'Homem' })
      .expect(200);
    const tokenA = regA.body.token;
    const idA = regA.body.user.id;
    await run(ctx.db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', idA]);

    const regB = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'B', email: 'b@example.com', password: 'senha123', birthDate: '1990-01-01', gender: 'Mulher' })
      .expect(200);
    const tokenB = regB.body.token;
    const idB = regB.body.user.id;

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
    const reg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Autor', email: 'autor@example.com', password: 'senha123', gender: 'Homem', lookingFor: ['Mulher'] })
      .expect(200);
    const token = reg.body.token as string;
    const userId = reg.body.user.id as string;

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
    const ownerReg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner-post@example.com', password: 'senha123', gender: 'Homem' })
      .expect(200);
    const ownerToken = ownerReg.body.token as string;
    const ownerId = ownerReg.body.user.id as string;

    const actorReg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Actor', email: 'actor-post@example.com', password: 'senha123', gender: 'Mulher' })
      .expect(200);
    const actorToken = actorReg.body.token as string;
    const actorId = actorReg.body.user.id as string;

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
    const ownerReg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Dono', email: 'dono@example.com', password: 'senha123', gender: 'Homem' })
      .expect(200);
    const ownerToken = ownerReg.body.token as string;
    const ownerId = ownerReg.body.user.id as string;

    const viewerReg = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Visitante', email: 'visitante@example.com', password: 'senha123', gender: 'Mulher' })
      .expect(200);
    const viewerToken = viewerReg.body.token as string;
    const viewerId = viewerReg.body.user.id as string;

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

    await request(ctx.app)
      .post(`/api/private-photos/requests/${notif.data.requestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

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
  });

  it('friends requests persist and can be read', async () => {
    const regA = await request(ctx.app).post('/api/auth/register').send({ name: 'A2', email: 'a2@example.com', password: 'senha123', gender: 'Homem' }).expect(200);
    const tokenA = regA.body.token as string;
    const idA = regA.body.user.id as string;

    const regB = await request(ctx.app).post('/api/auth/register').send({ name: 'B2', email: 'b2@example.com', password: 'senha123', gender: 'Mulher' }).expect(200);
    const tokenB = regB.body.token as string;
    const idB = regB.body.user.id as string;

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
});
