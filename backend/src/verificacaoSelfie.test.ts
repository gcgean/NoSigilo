import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

describe('selfie de verificação: recusada guardada para revisão', () => {
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

  async function criarUsuario(nome: string, isAdmin = 0) {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
    const email = `${id}@example.com`;
    const agora = new Date().toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
       VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', 'Homem')`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, isAdmin, agora, agora]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  async function pedidoEmAnalise(userId: string) {
    const vid = `v-${Math.random().toString(16).slice(2)}`;
    const mid = `m-${vid}`;
    const agora = new Date().toISOString();
    await run(db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, source, created_at) VALUES (?, ?, ?, 'image/webp', 1, 0, 'chat', ?)", [mid, userId, `${mid}.webp`, agora]);
    await run(db, "INSERT INTO verificacoes_perfil (id, user_id, codigo, media_id, status, created_at, enviado_em) VALUES (?, ?, '1234', ?, 'em_analise', ?, ?)", [vid, userId, mid, agora, agora]);
    await db.persist();
    return { vid, mid };
  }

  it('recusada mantém a selfie e pode ser aprovada na revisão; aprovada apaga', async () => {
    const admin = await criarUsuario('Adm', 1);
    const pessoa = await criarUsuario('Pessoa');
    const auth = { Authorization: `Bearer ${admin.token}` };
    const { vid, mid } = await pedidoEmAnalise(pessoa.id);

    await request(app).post(`/api/admin/verificacoes/${vid}/recusar`).set(auth).send({ motivo: 'código diferente' }).expect(200);
    expect(await queryOne(db, 'SELECT status, media_id, motivo FROM verificacoes_perfil WHERE id = ?', [vid]))
      .toMatchObject({ status: 'recusada', media_id: mid, motivo: 'código diferente' });
    expect(await queryOne(db, 'SELECT id FROM media WHERE id = ?', [mid])).toBeTruthy();

    const lista = (await request(app).get('/api/admin/verificacoes/recusadas').set(auth).expect(200)).body;
    expect(lista.diasGuardada).toBe(7);
    expect(lista.pedidos.map((p: any) => p.id)).toEqual([vid]);
    expect(lista.pedidos[0]).toMatchObject({ codigo: '1234', motivo: 'código diferente' });
    expect(lista.pedidos[0].selfie).toContain('/private-uploads/');
    // Na fila normal ela não aparece mais.
    expect((await request(app).get('/api/admin/verificacoes').set(auth).expect(200)).body.pedidos).toEqual([]);

    // Recusar de novo não vale, mas aprovar na revisão sim.
    await request(app).post(`/api/admin/verificacoes/${vid}/recusar`).set(auth).send({}).expect(404);
    await request(app).post(`/api/admin/verificacoes/${vid}/aprovar`).set(auth).send({}).expect(200);
    expect(await queryOne(db, 'SELECT status, media_id, motivo FROM verificacoes_perfil WHERE id = ?', [vid]))
      .toMatchObject({ status: 'aprovada', media_id: null, motivo: null });
    expect(await queryOne(db, 'SELECT is_verified FROM users WHERE id = ?', [pessoa.id])).toMatchObject({ is_verified: 1 });
    expect(await queryOne(db, 'SELECT id FROM media WHERE id = ?', [mid])).toBeFalsy();
    expect((await request(app).get('/api/admin/verificacoes/recusadas').set(auth).expect(200)).body.pedidos).toEqual([]);

    // Usuário comum não acessa a lista.
    await request(app).get('/api/admin/verificacoes/recusadas').set({ Authorization: `Bearer ${pessoa.token}` }).expect(403);
  });
});
