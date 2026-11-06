import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';
import { ganhaBonusCasalCedo } from './casa.js';

describe('A Casa: casal que entra antes da meia-noite ganha tokens', () => {
  it('vale só para casal, só na noite da promoção e só até a meia-noite', () => {
    const antes = new Date('2026-11-06T23:59:00-03:00');
    const depois = new Date('2026-11-07T00:01:00-03:00');
    expect(ganhaBonusCasalCedo('casal', '2026-11-06', antes)).toBe(true);
    expect(ganhaBonusCasalCedo('casal', '2026-11-06', depois)).toBe(false);
    expect(ganhaBonusCasalCedo('homem', '2026-11-06', antes)).toBe(false);
    expect(ganhaBonusCasalCedo('mulher', '2026-11-06', antes)).toBe(false);
    // Outra noite (o sábado) e abertura forçada de teste não contam.
    expect(ganhaBonusCasalCedo('casal', '2026-11-07', new Date('2026-11-07T23:00:00-03:00'))).toBe(false);
    expect(ganhaBonusCasalCedo('casal', 'teste-2026-11-06', antes)).toBe(false);
  });

  describe('na rota de entrada', () => {
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
    }, 90_000);

    afterEach(() => { vi.useRealTimers(); });
    afterAll(async () => {
      try { await db.close(); } catch {}
      if (existsSync(dbFile)) unlinkSync(dbFile);
    });

    async function criar(nome: string, gender: string) {
      const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
      const email = `${id}@example.com`;
      const agora = new Date().toISOString();
      await run(db,
        `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
         VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', ?)`,
        [id, email, bcrypt.hashSync('senha123', 4), nome, agora, agora, gender]);
      await db.persist();
      const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
      return { id, token: login.body.token as string };
    }

    const bonus = (id: string) => queryOne(db, "SELECT COUNT(*) AS c, COALESCE(SUM(points),0) AS p FROM token_transactions WHERE user_id = ? AND action_type = 'casa_casal_cedo'", [id]) as Promise<any>;

    it('paga 20 tokens uma vez ao casal; homem não recebe', async () => {
      const casal = await criar('Casal', 'Casal (Ele/Ela)');
      const homem = await criar('Homem', 'Homem');
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-06T22:30:00-03:00'));

      const sala = (await request(app).get('/api/casa/publico').expect(200)).body;
      expect(sala.aberta).toBe(true);
      const entrar = (u: { token: string }) => request(app).post('/api/casa/salao/entrar').set('Authorization', `Bearer ${u.token}`).send({});

      expect((await entrar(casal)).status).toBe(200);
      await vi.waitFor(async () => expect(Number((await bonus(casal.id)).c)).toBe(1), { timeout: 5000 });
      expect(Number((await bonus(casal.id)).p)).toBe(20);

      // Sai e volta: não paga de novo.
      await request(app).post('/api/casa/salao/sair').set('Authorization', `Bearer ${casal.token}`).send({});
      await entrar(casal);
      await new Promise((r) => setTimeout(r, 300));
      expect(Number((await bonus(casal.id)).c)).toBe(1);

      await entrar(homem);
      await new Promise((r) => setTimeout(r, 300));
      expect(Number((await bonus(homem.id)).c)).toBe(0);
    }, 30_000);
  });
});
