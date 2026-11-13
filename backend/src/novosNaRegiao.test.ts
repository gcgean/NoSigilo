import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';
import { combinaComOQueProcura, novosParaLeitor, textoDoAviso, type Leitor, type PerfilNovo } from './novosNaRegiao.js';

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

  it('aba inclui o estado todo: cidade, depois até 50 km, depois resto do estado, do mais perto ao mais longe', () => {
    const SOBRAL = { lat: -3.6889, lon: -40.3497 }; // ~200 km, ainda CE
    const lista = novosParaLeitor(leitor, [
      perfil({ id: 'sobral', city: 'Sobral', ...SOBRAL }),
      perfil({ id: 'caucaia', city: 'Caucaia', ...CAUCAIA }),
      perfil({ id: 'cidade' }),
      perfil({ id: 'recife', city: 'Recife', state: 'PE', ...RECIFE }),
    ], new Set(), true);
    expect(lista.map((p) => p.id)).toEqual(['cidade', 'caucaia', 'sobral']);
    // Sem o estado (aviso no celular), Sobral fica de fora.
    expect(novosParaLeitor(leitor, [perfil({ id: 'sobral', city: 'Sobral', ...SOBRAL })], new Set()).length).toBe(0);
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
    const conv = await request(app).post('/api/conversations').set('Authorization', `Bearer ${de.token}`).send({ userId: para.id, boasVindas: true });
    if (conv.status !== 200) return conv;
    return request(app).post(`/api/conversations/${conv.body.id}/messages`).set('Authorization', `Bearer ${de.token}`)
      .send({ content: 'Seja bem-vinda!', boasVindas: true });
  }

  it('lista só perfil novo, com foto e que combina; boas-vindas uma vez por perfil e sem limite diário', async () => {
    const eu = await criar('Leitor', { gender: 'Homem', criadoHaDias: 60, lookingFor: ['Mulher'] });
    const nova = await criar('Nova', { gender: 'Mulher' });
    await criar('SemFoto', { gender: 'Mulher', foto: false });
    await criar('Antiga', { gender: 'Mulher', criadoHaDias: 20 });
    await criar('Homem', { gender: 'Homem' });

    const r = await request(app).get('/api/regiao/novos').set('Authorization', `Bearer ${eu.token}`).expect(200);
    expect(r.body.perfis.map((p: any) => p.name)).toEqual(['Nova']);
    expect(r.body.perfis[0]).toMatchObject({ distanceKm: 0, boasVindasEnviada: false, curtido: false });

    await boasVindas(eu, nova).then((x) => expect(x.status).toBe(200));
    const segunda = await boasVindas(eu, nova);
    expect(segunda.status).toBe(429);
    expect(segunda.body.message).toMatch(/já deu boas-vindas/);

    const depois = await request(app).get('/api/regiao/novos').set('Authorization', `Bearer ${eu.token}`).expect(200);
    // Quem já recebeu boas-vindas sai da aba (12/11/2026).
    expect(depois.body.perfis.map((p: any) => p.name)).not.toContain('Nova');

    // Sem limite diário (antes eram 5): a 8ª do dia também passa.
    for (let i = 0; i < 7; i++) {
      const outra = await criar(`Outra${i}`, { gender: 'Mulher' });
      await boasVindas(eu, outra).then((x) => expect(x.status).toBe(200));
    }
    // Mensagem normal (sem a marca) continua funcionando.
    const conv = await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? OR user_b_id = ? LIMIT 1', [eu.id, eu.id]);
    await request(app).post(`/api/conversations/${conv.id}/messages`).set('Authorization', `Bearer ${eu.token}`).send({ content: 'oi de novo' }).expect(200);
  });

  it('boas-vindas respeita o perfil novo: pedido para quem não é procurado, recusa para tipo bloqueado', async () => {
    const homem = await criar('HomemBV', { gender: 'Homem', criadoHaDias: 60, lookingFor: ['Casal (Ele/Ela)'] });
    const casal = await criar('CasalBV', { gender: 'Casal (Ele/Ela)', lookingFor: ['Mulher'] });

    // Desconhecido: vai como pedido de mensagem.
    const c1 = await request(app).post('/api/conversations').set('Authorization', `Bearer ${homem.token}`).send({ userId: casal.id, boasVindas: true }).expect(200);
    expect(c1.body.pedido).toBe(true);
    await request(app).post(`/api/conversations/${c1.body.id}/messages`).set('Authorization', `Bearer ${homem.token}`)
      .send({ content: 'Sejam bem-vindos!', boasVindas: true }).expect(200);
    expect(await queryOne(db, 'SELECT pedido_para FROM conversations WHERE id = ?', [c1.body.id])).toMatchObject({ pedido_para: casal.id });

    // Homem é tipo de entrada direta, mas o casal procura só Mulher: boas-vindas vira pedido.
    const casal2 = await criar('CasalBV2', { gender: 'Casal (Ele/Ela)', lookingFor: ['Mulher'] });
    await run(db, 'UPDATE users SET pedidos_direto_json = ? WHERE id = ?', [JSON.stringify(['homem']), casal2.id]);
    const c2 = await request(app).post('/api/conversations').set('Authorization', `Bearer ${homem.token}`).send({ userId: casal2.id, boasVindas: true }).expect(200);
    expect(c2.body.pedido).toBe(true);

    // Procura Homem e liberou entrada direta: vai direto.
    const casal3 = await criar('CasalBV3', { gender: 'Casal (Ele/Ela)', lookingFor: ['Homem'] });
    await run(db, 'UPDATE users SET pedidos_direto_json = ? WHERE id = ?', [JSON.stringify(['homem']), casal3.id]);
    const c3 = await request(app).post('/api/conversations').set('Authorization', `Bearer ${homem.token}`).send({ userId: casal3.id, boasVindas: true }).expect(200);
    expect(c3.body.pedido).toBe(false);

    // Bloqueou mensagens de quem não é do tipo escolhido: recusa com o motivo.
    const casal4 = await criar('CasalBV4', { gender: 'Casal (Ele/Ela)', lookingFor: ['Mulher'] });
    await run(db, 'UPDATE users SET block_outside_prefs = 1, contact_profile_types_json = ? WHERE id = ?', [JSON.stringify(['Mulher']), casal4.id]);
    const c4 = await request(app).post('/api/conversations').set('Authorization', `Bearer ${homem.token}`).send({ userId: casal4.id, boasVindas: true });
    expect(c4.status).toBe(403);
    expect(c4.body.error).toBe('message_not_allowed');
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
