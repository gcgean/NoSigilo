import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

describe('stories ocultos e denúncia de story', () => {
  let db: DbHandle;
  let app: ReturnType<typeof createApp>;
  let dbFile: string;

  beforeAll(async () => {
    dbFile = path.join(process.cwd(), 'data', `test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    db = await initDb({
      databaseFile: dbFile,
      migrationsDir: path.join(process.cwd(), 'migrations'),
      pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
    });
    app = createApp({
      db,
      env: { FRONTEND_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'test-secret', TRIAL_DAYS: 30, RESEND_API_KEY: '', RESEND_FROM_EMAIL: '', APP_NAME: 'NoSigilo Test', BILLING_TEST_EMAILS: '' },
    });
  });

  afterAll(async () => {
    try { await db.close(); } catch {}
    if (existsSync(dbFile)) unlinkSync(dbFile);
  });

  async function criar(nome: string) {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
    const email = `${id}@example.com`;
    const agora = new Date().toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
       VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', 'Mulher')`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, agora, agora]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  async function postarStory(autorId: string) {
    const sid = `st-${Math.random().toString(16).slice(2)}`;
    const agora = new Date();
    await run(db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, created_at) VALUES (?, ?, ?, 'image/webp', 0, 0, ?)", [`m-${sid}`, autorId, `${sid}.webp`, agora.toISOString()]);
    await run(db, 'INSERT INTO stories (id, user_id, media_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [
      sid, autorId, `m-${sid}`, agora.toISOString(), new Date(agora.getTime() + 86400000).toISOString(),
    ]);
    await db.persist();
    return sid;
  }

  const autoresDoFeed = async (token: string) =>
    (await request(app).get('/api/stories').set('Authorization', `Bearer ${token}`).expect(200)).body.stories.map((s: any) => s.author.id);

  it('ocultar tira os stories do perfil só para quem ocultou; mostrar de novo devolve', async () => {
    const eu = await criar('Eu');
    const outra = await criar('Outra');
    const autora = await criar('Autora');
    const sid = await postarStory(autora.id);

    expect(await autoresDoFeed(eu.token)).toContain(autora.id);
    await request(app).post('/api/stories-ocultos').set('Authorization', `Bearer ${eu.token}`).send({ userId: autora.id }).expect(200);
    expect(await autoresDoFeed(eu.token)).not.toContain(autora.id);
    expect(await autoresDoFeed(outra.token)).toContain(autora.id);

    const lista = await request(app).get('/api/stories-ocultos').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(lista.body.perfis.map((p: any) => p.name)).toEqual(['Autora']);

    await request(app).delete(`/api/stories-ocultos/${autora.id}`).set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(await autoresDoFeed(eu.token)).toContain(autora.id);

    // Não dá para ocultar a si mesmo.
    await request(app).post('/api/stories-ocultos').set('Authorization', `Bearer ${eu.token}`).send({ userId: eu.id }).expect(400);

    // Denúncia de story chega ao admin com o autor como perfil denunciado.
    await request(app).post('/api/reports').set('Authorization', `Bearer ${eu.token}`)
      .send({ targetType: 'story', targetId: sid, targetName: 'Autora', reason: 'inappropriate' }).expect(201);
    const rep = await queryOne(db, "SELECT target_type, target_id FROM reports WHERE target_id = ?", [sid]);
    expect(rep).toMatchObject({ target_type: 'story', target_id: sid });
  });
});
