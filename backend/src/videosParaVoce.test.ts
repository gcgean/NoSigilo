import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';
import { limparCacheParaVoce, ordenarParaLeitor, qualidadeDoVideo, type GostoDoLeitor } from './videosParaVoce.js';

const gostoVazio = (): GostoDoLeitor => ({ razaoPorPost: new Map(), autores: new Map(), temas: new Map(), tipos: new Map(), curtiuOuSegue: new Set() });
const semSorteio = () => 0.5;
const agora = Date.parse('2026-11-03T12:00:00Z');
const cand = (postId: string, autorId: string, dias = 30, temas: string[] = []) =>
  ({ postId, autorId, criadoEm: new Date(agora - dias * 86_400_000).toISOString(), temas });

describe('nota dos vídeos (Para você)', () => {
  it('vídeo que as pessoas assistem até o fim vale mais do que o que pulam', () => {
    const bom = qualidadeDoVideo({ pessoas: 40, somaRazao: 36, completos: 30, curtidas: 4, comentarios: 1 });
    const ruim = qualidadeDoVideo({ pessoas: 40, somaRazao: 4, completos: 1, curtidas: 4, comentarios: 1 });
    expect(bom).toBeGreaterThan(ruim * 1.8);
  });

  it('1 pessoa até o fim não passa na frente de 200 até o fim', () => {
    const umaPessoa = qualidadeDoVideo({ pessoas: 1, somaRazao: 1, completos: 1, curtidas: 0, comentarios: 0 });
    const duzentas = qualidadeDoVideo({ pessoas: 200, somaRazao: 190, completos: 180, curtidas: 0, comentarios: 0 });
    expect(duzentas).toBeGreaterThan(umaPessoa);
  });

  it('ordena pelos mais assistidos, puxa o autor que a pessoa curte e manda o já visto para o fim', () => {
    const estat = new Map([
      ['bom', { pessoas: 50, somaRazao: 45, completos: 40, curtidas: 0, comentarios: 0 }],
      ['medio', { pessoas: 50, somaRazao: 20, completos: 10, curtidas: 0, comentarios: 0 }],
      ['ruim', { pessoas: 50, somaRazao: 5, completos: 1, curtidas: 0, comentarios: 0 }],
      ['visto', { pessoas: 50, somaRazao: 45, completos: 40, curtidas: 0, comentarios: 0 }],
    ]);
    const lista = [cand('ruim', 'a1'), cand('medio', 'a2'), cand('bom', 'a3'), cand('visto', 'a4')];
    const gosto = gostoVazio();
    gosto.razaoPorPost.set('visto', 1);
    expect(ordenarParaLeitor(lista, estat, gosto, agora, semSorteio)).toEqual(['bom', 'medio', 'ruim', 'visto']);

    // Entre dois vídeos parecidos, vem antes o do autor que a pessoa assiste e
    // segue — mas isso não passa um vídeo ruim na frente de um melhor.
    estat.set('parecido', { pessoas: 50, somaRazao: 21, completos: 11, curtidas: 0, comentarios: 0 });
    gosto.autores.set('a2', { soma: 18, n: 10 });
    gosto.curtiuOuSegue.add('a2');
    const lista2 = [cand('parecido', 'a5'), ...lista];
    const ordem2 = ordenarParaLeitor(lista2, estat, gosto, agora, semSorteio);
    expect(ordem2.indexOf('medio')).toBeLessThan(ordem2.indexOf('parecido'));
    expect(ordem2.indexOf('bom')).toBe(0);
    expect(ordem2.indexOf('medio')).toBeLessThan(ordem2.indexOf('ruim'));
  });

  it('puxa o tipo de perfil que a pessoa assiste mais tempo', () => {
    const igual = { pessoas: 50, somaRazao: 20, completos: 10, curtidas: 0, comentarios: 0 };
    const estat = new Map([['h', igual], ['c', igual]]);
    const lista = [{ ...cand('h', 'a1'), tipo: 'homem' }, { ...cand('c', 'a2'), tipo: 'casal' }];
    const gosto = gostoVazio();
    gosto.tipos.set('casal', { soma: 14, n: 10 }); // assiste vídeos de casal até o fim
    gosto.tipos.set('homem', { soma: 1, n: 10 });  // pula os de homem
    expect(ordenarParaLeitor(lista, estat, gosto, agora, semSorteio)).toEqual(['c', 'h']);
  });

  it('não coloca o mesmo autor em sequência', () => {
    const estat = new Map(['x1', 'x2', 'x3', 'y1'].map((id) => [id, { pessoas: 50, somaRazao: id.startsWith('x') ? 45 : 10, completos: 0, curtidas: 0, comentarios: 0 }]));
    const ordem = ordenarParaLeitor([cand('x1', 'x'), cand('x2', 'x'), cand('x3', 'x'), cand('y1', 'y')], estat, gostoVazio(), agora, semSorteio);
    expect(ordem[0]).toMatch(/^x/);
    expect(ordem[1]).toBe('y1');
  });
});

describe('rotas de vídeo assistido e Para você', () => {
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
    limparCacheParaVoce();
  });

  afterAll(async () => {
    try { await db.close(); } catch {}
    if (existsSync(dbFile)) unlinkSync(dbFile);
  });

  async function criar(nome: string, gender = 'Mulher') {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
    const email = `${id}@example.com`;
    const agoraIso = new Date().toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender)
       VALUES (?, ?, ?, ?, 1, 1, 0, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', ?)`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, agoraIso, agoraIso, gender]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  async function postarVideo(autorId: string) {
    const pid = `p-${Math.random().toString(16).slice(2)}`;
    const mid = `m-${pid}`;
    const quando = new Date().toISOString();
    await run(db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, created_at) VALUES (?, ?, ?, 'video/mp4', 0, 0, ?)", [mid, autorId, `${pid}.mp4`, quando]);
    await run(db, 'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)', [pid, autorId, '', JSON.stringify([mid]), quando]);
    await db.persist();
    return pid;
  }

  it('soma o tempo assistido, ignora o próprio autor e põe o vídeo mais assistido em primeiro', async () => {
    const autora = await criar('Autora');
    const outra = await criar('Outra');
    const leitores = [await criar('L1'), await criar('L2'), await criar('L3'), await criar('L4'), await criar('L5'), await criar('L6')];
    const eu = await criar('Eu');
    const pulam = await postarVideo(autora.id);
    const assistem = await postarVideo(outra.id);

    const assistir = (token: string, postId: string, assistidoMs: number, completou = false) =>
      request(app).post('/api/videos/assistido').set('Authorization', `Bearer ${token}`)
        .send({ postId, assistidoMs, duracaoMs: 20_000, completou }).expect(200);

    for (const l of leitores) {
      await assistir(l.token, assistem, 20_000, true);
      await assistir(l.token, pulam, 1_000);
    }
    // Duas sessões somam.
    await assistir(leitores[0].token, assistem, 15_000);
    const linha = (await queryOne(db, 'SELECT assistido_ms, completou, vezes FROM video_assistido WHERE user_id = ? AND post_id = ?', [leitores[0].id, assistem])) as any;
    expect(linha).toMatchObject({ assistido_ms: 35_000, completou: 1, vezes: 2 });

    // O autor assistindo o próprio vídeo não conta.
    await assistir(autora.token, pulam, 20_000, true);
    expect(await queryOne(db, 'SELECT 1 AS x FROM video_assistido WHERE user_id = ?', [autora.id])).toBeFalsy();

    limparCacheParaVoce();
    const res = await request(app).get('/api/videos/search').query({ sort: 'random', all: 'true', limit: 10 })
      .set('Authorization', `Bearer ${eu.token}`).expect(200);
    const ordem = res.body.videos.map((v: any) => v.postId);
    expect(ordem.indexOf(assistem)).toBeGreaterThanOrEqual(0);
    expect(ordem.indexOf(assistem)).toBeLessThan(ordem.indexOf(pulam));
  });
});
