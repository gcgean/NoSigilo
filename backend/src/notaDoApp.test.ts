import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';

describe('motivo da nota baixa do app', () => {
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

  async function criar(nome: string, isAdmin = 0) {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
    const email = `${id}@example.com`;
    const antigo = new Date(Date.now() - 30 * 86_400_000).toISOString(); // conta com mais de 7 dias
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', 'Homem')`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, isAdmin, antigo, antigo]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  it('guarda os motivos de 1 toque, pergunta o motivo uma vez a quem não explicou e mostra no admin', async () => {
    const eu = await criar('Eu');
    const outro = await criar('Outro');
    const admin = await criar('Admin', 1);
    const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

    const p1 = await request(app).get('/api/app-rating/pendente').set(auth(eu.token)).expect(200);
    expect(p1.body.perguntar).toBe(true);
    expect(p1.body.motivos.map((m: any) => m.id)).toContain('poucos_perto');

    // Nota baixa com motivos (inválido é descartado).
    await request(app).post('/api/app-rating').set(auth(eu.token))
      .send({ nota: 3, motivos: ['poucos_perto', 'preco', 'inventado'] }).expect(200);
    const minha = (await queryOne(db, 'SELECT motivos FROM app_ratings WHERE user_id = ?', [eu.id])) as any;
    expect(minha.motivos).toBe('poucos_perto,preco');
    // Já explicou: não pergunta de novo.
    expect((await request(app).get('/api/app-rating/pendente').set(auth(eu.token))).body.perguntarMotivo).toBeUndefined();

    // Nota baixa sem explicar: ganha a pergunta do motivo, uma vez.
    await request(app).post('/api/app-rating').set(auth(outro.token)).send({ nota: 2 }).expect(200);
    const p2 = (await request(app).get('/api/app-rating/pendente').set(auth(outro.token))).body;
    expect(p2.perguntarMotivo).toMatchObject({ nota: 2 });
    await request(app).post(`/api/app-rating/${p2.perguntarMotivo.id}/motivo`).set(auth(eu.token))
      .send({ motivos: ['erro'] }).expect(404); // não é dele
    await request(app).post(`/api/app-rating/${p2.perguntarMotivo.id}/motivo`).set(auth(outro.token))
      .send({ motivos: ['sem_resposta'], sugestao: 'mando oi e ninguém responde' }).expect(200);
    expect((await request(app).get('/api/app-rating/pendente').set(auth(outro.token))).body.perguntarMotivo).toBeUndefined();

    const rel = (await request(app).get('/api/admin/analytics/notas').query({ dias: 30 }).set(auth(admin.token)).expect(200)).body;
    expect(rel.baixasComMotivo).toBe(2);
    expect(rel.motivosDasBaixas.map((m: any) => m.id).sort()).toEqual(['poucos_perto', 'preco', 'sem_resposta']);
    const com = (await request(app).get('/api/admin/analytics/notas/comentarios').query({ dias: 30, faixa: 'insatisfeitos' }).set(auth(admin.token)).expect(200)).body;
    expect(com.total).toBe(2);
  });
});
