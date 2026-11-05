import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

describe('cadastro pela página "casa de swing online"', () => {
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

  const cadastrar = (nome: string, signupSource?: string) =>
    request(app).post('/api/auth/register').send({
      email: `${nome}-${Math.random().toString(16).slice(2)}@example.com`.toLowerCase(),
      password: 'senha123',
      name: nome,
      gender: 'Mulher',
      birthDate: '1990-01-01',
      city: 'Fortaleza',
      state: 'CE',
      termosVersao: '1',
      ...(signupSource ? { signupSource } : {}),
      primeiroToque: { ref: 'google.com', utmCampaign: 'a-casa' },
    });

  it('grava a origem e o admin encontra pelo filtro, sem misturar com outras páginas', async () => {
    const daCasa = await cadastrar('DaCasa', 'swing/casa-de-swing-online');
    expect(daCasa.status).toBe(201);
    const daCidade = await cadastrar('DaCidade', 'swing/ceara/fortaleza');
    expect(daCidade.status).toBe(201);

    const linha = (await queryOne(db, "SELECT signup_source, origem_canal FROM users WHERE name = 'DaCasa'")) as any;
    expect(linha).toEqual({ signup_source: '/swing/casa-de-swing-online/', origem_canal: 'Página Casa de swing online' });

    const agora = new Date().toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
       VALUES ('adm-origem', 'adm-origem@example.com', ?, 'Adm', 1, 1, 1, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', 'Homem')`,
      [bcrypt.hashSync('senha123', 4), agora, agora]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email: 'adm-origem@example.com', password: 'senha123' }).expect(200);

    const res = await request(app).get('/api/admin/users').query({ origem: '/swing/casa-de-swing-online/' })
      .set('Authorization', `Bearer ${login.body.token}`).expect(200);
    const lista = res.body.users ?? res.body.items ?? res.body;
    expect(lista.map((u: any) => u.name)).toEqual(['DaCasa']);
    expect(lista[0].signupSource).toBe('/swing/casa-de-swing-online/');
  });
});
