import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';
import { MAX_BOAS_VINDAS_POR_DIA, combinaComOQueProcura, novosParaLeitor, textoDoAviso, type Leitor, type PerfilNovo } from './novosNaRegiao.js';

const FORTALEZA = { lat: -3.7319, lon: -38.5267 };
const CAUCAIA = { lat: -3.7361, lon: -38.6531 }; // ~14 km
const RECIFE = { lat: -8.0476, lon: -34.877 };

function perfil(p: Partial<PerfilNovo> & { id: string }): PerfilNovo {
  return {
    name: p.id, gender: 'Mulher', city: 'Fortaleza', state: 'CE', lat: null, lon: null,
    createdAt: new Date().toISOString(), avatarFilename: 'a.webp', boasVindasRecebidas: 0, ...p,
  };
}

describe('novosNaRegiao — regras', () => {
  const leitor: Leitor = { id: 'eu', city: 'Fortaleza', state: 'CE', ...FORTALEZA, lookingFor: ['Mulher', 'Casal (Ele/Ela)'] };

  it('entra mesma cidade e até 50 km; sai outra região, quem não combina, bloqueado e quem já lotou', () => {
    const lista = novosParaLeitor(leitor, [
      perfil({ id: 'cidade' }),
      perfil({ id: 'caucaia', city: 'Caucaia', ...CAUCAIA, gender: 'Casal (Ele/Ela)' }),
      perfil({ id: 'recife', city: 'Recife', state: 'PE', ...RECIFE }),
      perfil({ id: 'homem', gender: 'Homem' }),
      perfil({ id: 'bloq' }),
      perfil({ id: 'lotado', boasVindasRecebidas: 10 }),
      perfil({ id: 'eu' }),
    ], new Set(['eu|bloq']));
    expect(lista.map((p) => [p.id, p.mesmaCidade])).toEqual([['cidade', true], ['caucaia', false]]);
  });

  it('sem preferência marcada, combina com todos', () => {
    expect(combinaComOQueProcura([], 'Homem')).toBe(true);
    expect(combinaComOQueProcura(['Casal (Ele/Ele)'], 'Casal (Ele/Ela)')).toBe(true);
    expect(combinaComOQueProcura(['Mulher'], 'Homem')).toBe(false);
  });

  it('texto do aviso é discreto e diz a cidade só quando todos são dela', () => {
    expect(textoDoAviso(3, 'Fortaleza', true)).toBe('3 perfis novos de Fortaleza que combinam com você. Quer ver?');
    expect(textoDoAviso(1, 'Fortaleza', false)).toBe('1 perfil novo perto de você que combina com você. Quer ver?');
  });
});

describe('novosNaRegiao — rotas', () => {
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

  async function criar(nome: string, o: { gender: string; criadoHaDias?: number; foto?: boolean; lookingFor?: string[] }) {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`;
    const email = `${id}@example.com`.toLowerCase();
    const criado = new Date(Date.now() - (o.criadoHaDias ?? 0) * 86400000).toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender, city, state, lat, lon, looking_for_json)
       VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', ?, 'Fortaleza', 'CE', ?, ?, ?)`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, criado, criado, o.gender, FORTALEZA.lat, FORTALEZA.lon, JSON.stringify(o.lookingFor ?? [])]);
    if (o.foto !== false) {
      await run(db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, created_at) VALUES (?, ?, ?, 'image/webp', 0, 1, ?)", [`m-${id}`, id, `${id}.webp`, criado]);
    }
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  async function boasVindas(de: { token: string }, para: { id: string }) {
    const conv = await request(app).post('/api/conversations').set('Authorization', `Bearer ${de.token}`).send({ userId: para.id });
    if (conv.status !== 200) return conv;
    return request(app).post(`/api/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${de.token}`)
      .send({ content: 'Seja bem-vinda!', boasVindas: true });
  }

  it('lista só perfil novo, com foto e que combina; boas-vindas uma vez e no máximo 5 por dia', async () => {
    const eu = await criar('Leitor', { gender: 'Homem', criadoHaDias: 60, lookingFor: ['Mulher'] });
    const nova = await criar('Nova', { gender: 'Mulher' });
    await criar('SemFoto', { gender: 'Mulher', foto: false });
    await criar('Antiga', { gender: 'Mulher', criadoHaDias: 20 });
    await criar('Homem', { gender: 'Homem' });

    const r = await request(app).get('/api/regiao/novos').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(r.body.perfis.map((p: any) => p.name)).toEqual(['Nova']);
    expect(r.body.perfis[0]).toMatchObject({ distanceKm: 0, boasVindasEnviada: false, curtido: false });
    expect(r.body.boasVindasRestantesHoje).toBe(MAX_BOAS_VINDAS_POR_DIA);

    await boasVindas(eu, nova).then((x) => expect(x.status).toBe(200));
    const segunda = await boasVindas(eu, nova);
    expect(segunda.status).toBe(429);
    expect(segunda.body.message).toMatch(/já deu boas-vindas/);

    const depois = await request(app).get('/api/regiao/novos').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(depois.body.perfis[0].boasVindasEnviada).toBe(true);
    expect(depois.body.boasVindasRestantesHoje).toBe(MAX_BOAS_VINDAS_POR_DIA - 1);

    for (let i = 0; i < MAX_BOAS_VINDAS_POR_DIA - 1; i++) {
      const outra = await criar(`Outra${i}`, { gender: 'Mulher' });
      await boasVindas(eu, outra).then((x) => expect(x.status).toBe(200));
    }
    const sexta = await boasVindas(eu, await criar('Sexta', { gender: 'Mulher' }));
    expect(sexta.status).toBe(429);
    expect(sexta.body.message).toMatch(/Amanhã libera mais/);
    // Mensagem normal (sem a marca) continua funcionando.
    const conv = await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? OR user_b_id = ? LIMIT 1', [eu.id, eu.id]);
    await request(app).post(`/api/conversations/${conv.id}/messages`).set('Authorization', `Bearer ${eu.token}`).send({ content: 'oi de novo' }).expect(200);
  });

  it('perfil que não é mais novo recusa boas-vindas; preferência de aviso pode ser desligada', async () => {
    const eu = await criar('Leitor2', { gender: 'Homem', criadoHaDias: 60 });
    const antiga = await criar('Antiga2', { gender: 'Mulher', criadoHaDias: 20 });
    const r = await boasVindas(eu, antiga);
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/não é mais novo/);

    await request(app).put('/api/profile').set('Authorization', `Bearer ${eu.token}`).send({ avisoNovosRegiao: false }).expect(200);
    const row = await queryOne(db, 'SELECT aviso_novos_regiao FROM users WHERE id = ?', [eu.id]);
    expect(Number(row.aviso_novos_regiao)).toBe(0);
  });
});
