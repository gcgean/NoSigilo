import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { initDb, queryAll, queryOne, run } from './db.js';
import { createApp } from './app.js';
import type { DbHandle } from './db.js';
import { quandoPostar, semanaDoDesafio, semanaPassada, situacaoNoRanking, taxaDaComissao, textoBoasVindas } from './promotores.js';
import { diaDoProximoPix, textoDaComissao } from './promotores.js';

const SEGREDO = 'segredo-webhook-promotores';

describe('regras dos promotores (puras)', () => {
  it('faixa: 20% até a 10ª venda do mês, 25% da 11ª em diante', () => {
    expect(taxaDaComissao(0)).toBe(0.2);
    expect(taxaDaComissao(9)).toBe(0.2);
    expect(taxaDaComissao(10)).toBe(0.25);
  });

  it('semana do desafio vai de segunda 00:00 a domingo 23:59 em Brasília', () => {
    // Domingo 22/11/2026 22:00 em Brasília = segunda 01:00 UTC: ainda é a semana de 16/11.
    const domingoNoite = new Date('2026-11-23T01:00:00.000Z');
    expect(semanaDoDesafio(domingoNoite)).toEqual({ chave: '2026-11-16', inicio: '2026-11-16T03:00:00.000Z', fim: '2026-11-23T03:00:00.000Z' });
    // Segunda 00:30 em Brasília: semana nova.
    expect(semanaDoDesafio(new Date('2026-11-23T03:30:00.000Z')).chave).toBe('2026-11-23');
    expect(semanaPassada(new Date('2026-11-23T03:30:00.000Z')).chave).toBe('2026-11-16');
  });

  it('ranking: posição com empate e quanto falta para subir', () => {
    const r = [
      { userId: 'a', nome: 'A', cadastros: 9 },
      { userId: 'b', nome: 'B', cadastros: 5 },
      { userId: 'c', nome: 'C', cadastros: 5 },
      { userId: 'd', nome: 'D', cadastros: 2 },
    ];
    expect(situacaoNoRanking(r, 'a')).toMatchObject({ posicao: 1, faltamParaSubir: 0 });
    expect(situacaoNoRanking(r, 'c')).toMatchObject({ posicao: 2, faltamParaSubir: 5 });
    expect(situacaoNoRanking(r, 'd')).toMatchObject({ posicao: 4, faltamParaSubir: 4 });
    expect(situacaoNoRanking(r, 'z')).toMatchObject({ posicao: null, cadastros: 0 });
  });

  it('quando postar: hoje/amanhã/data e hora', () => {
    const agora = new Date('2026-11-20T15:00:00.000Z'); // 12h em Brasília
    expect(quandoPostar('2026-11-20', '21:00', agora)).toBe('hoje (20/11) até as 21h');
    expect(quandoPostar('2026-11-21', '', agora)).toBe('amanhã (21/11)');
    expect(quandoPostar('2026-11-28', '21:30', agora)).toBe('em 28/11 até as 21h30');
    expect(quandoPostar(null, null, agora)).toBe('');
  });

  it('boas-vindas: link, materiais e pagamento no dia 01; dia 7 traz as visitas', () => {
    const base = { nome: 'Carla Souza', link: 'nosigilo.net/invite/abc', linkCasa: 'nosigilo.net/acasa?invite=abc', materiais: ['Story — comunidade'], cliques7d: 0, cadastros7d: 0 };
    const d1 = textoBoasVindas(0, base)!;
    expect(d1).toContain('Oi, Carla!');
    expect(d1).toContain('nosigilo.net/invite/abc');
    expect(d1).toContain('Story — comunidade');
    expect(d1).toContain('dia 01');
    expect(textoBoasVindas(2, { ...base, cliques7d: 12, cadastros7d: 3 })).toContain('12 visitas e 3 cadastros');
    expect(textoBoasVindas(3, base)).toBeNull();
  });
});

describe('engajamento dos promotores (rotas e tarefas)', () => {
  let db: DbHandle;
  let app: ReturnType<typeof createApp>;
  let dbFile: string;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    dbFile = path.join(process.cwd(), 'data', `test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    db = await initDb({
      databaseFile: dbFile,
      migrationsDir: path.join(process.cwd(), 'migrations'),
      pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
    });
    app = createApp({
      db,
      env: { FRONTEND_ORIGIN: 'http://localhost:3000', JWT_SECRET: 'test-secret', TRIAL_DAYS: 30, RESEND_API_KEY: '', RESEND_FROM_EMAIL: '', APP_NAME: 'NoSigilo Test', BILLING_TEST_EMAILS: '', HUB_BILLING_WEBHOOK_SECRET: SEGREDO },
    });
  });

  afterAll(async () => {
    try { await db.close(); } catch {}
    if (existsSync(dbFile)) unlinkSync(dbFile);
  });

  async function criar(nome: string, extra: { admin?: boolean; ipHash?: string } = {}) {
    const id = `u-${nome}-${Math.random().toString(16).slice(2)}`.toLowerCase();
    const email = `${id}@example.com`;
    const antigo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await run(db,
      `INSERT INTO users (id, email, password_hash, name, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at, invite_status, gender, registration_ip_hash)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, '2099-01-01T00:00:00.000Z', 'approved', 'Homem', ?)`,
      [id, email, bcrypt.hashSync('senha123', 4), nome, extra.admin ? 1 : 0, antigo, antigo, extra.ipHash ?? null]);
    await db.persist();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'senha123' }).expect(200);
    return { id, token: login.body.token as string };
  }

  async function virarPromotor(userId: string, ativadoEm = new Date().toISOString()) {
    await run(db,
      `INSERT INTO promoters (id, user_id, full_name, pix_key, status, accepted_terms_at, activated_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      [`p-${userId}`, userId, 'Promotor', 'pix@example.com', ativadoEm, ativadoEm, ativadoEm]);
    const linkId = `l-${userId}`;
    await run(db,
      `INSERT INTO invite_links (id, inviter_user_id, invite_token, status, created_at, updated_at) VALUES (?, ?, ?, 'created', ?, ?)`,
      [linkId, userId, `tok-${userId}`, ativadoEm, ativadoEm]);
    await db.persist();
    return { linkId, token: `tok-${userId}` };
  }

  async function indicar(linkId: string, inviteeId: string, quando = new Date().toISOString()) {
    await run(db, 'INSERT INTO invite_link_entries (id, invite_link_id, invitee_user_id, created_at) VALUES (?, ?, ?, ?)',
      [`e-${inviteeId}`, linkId, inviteeId, quando]);
  }

  const tarefas = () => app.get('promotoresTarefas') as {
    avisarMaterialNovo: () => Promise<void>; enviarBoasVindasPromotores: () => Promise<void>; fecharDesafioSemanal: () => Promise<void>;
  };

  it('comissão nasce aprovada; a 11ª venda do mês rende 25%', async () => {
    const promotor = await criar('PromotorFaixa');
    const { linkId } = await virarPromotor(promotor.id);
    await run(db, "INSERT INTO promoter_boas_vindas (user_id, etapa, enviado_em) VALUES (?, 0, 'x'), (?, 1, 'x'), (?, 2, 'x')", [promotor.id, promotor.id, promotor.id]);
    const periodo = new Date().toISOString().slice(0, 7);
    for (let i = 0; i < 10; i++) {
      await run(db,
        `INSERT INTO promoter_commissions (id, promoter_user_id, subscriber_user_id, subscription_amount, commission_amount, status, period, event_type, created_at)
         VALUES (?, ?, ?, 990, 198, 'approved', ?, 'payment', ?)`,
        [`c-${i}-${promotor.id}`, promotor.id, `antigo-${i}-${promotor.id}`, periodo, new Date().toISOString()]);
    }
    const assinante = await criar('Assinante11');
    await indicar(linkId, assinante.id);
    await run(db, 'UPDATE users SET hub_customer_id = ? WHERE id = ?', ['cus-11', assinante.id]);
    await db.persist();

    const corpo = { customerId: 'cus-11', payload: { amount: 990 } };
    const assinatura = createHmac('sha256', SEGREDO).update(Buffer.from(JSON.stringify(corpo))).digest('hex');
    await request(app).post('/api/webhooks/hub-billing').set('x-hub-event', 'payment.approved')
      .set('x-hub-signature', `sha256=${assinatura}`).set('Content-Type', 'application/json').send(corpo).expect(200);
    let c: any = null;
    for (let i = 0; i < 40 && !c; i++) {
      c = await queryOne(db, 'SELECT status, commission_amount FROM promoter_commissions WHERE subscriber_user_id = ?', [assinante.id]);
      if (!c) await new Promise((r) => setTimeout(r, 50));
    }
    expect(c).toMatchObject({ status: 'approved', commission_amount: 248 });

    const dash = (await request(app).get('/api/promoter/dashboard').set(auth(promotor.token)).expect(200)).body;
    expect(dash.faixa).toMatchObject({ vendasMes: 11, taxaAtual: 25 });
    expect(dash.hoje.vendasMes).toBe(11);
  });

  it('visita ao link conta uma vez por visitante por dia e aparece no painel', async () => {
    const promotor = await criar('PromotorVisitas');
    const { token } = await virarPromotor(promotor.id);
    await run(db, "INSERT INTO promoter_boas_vindas (user_id, etapa, enviado_em) VALUES (?, 0, 'x'), (?, 1, 'x'), (?, 2, 'x')", [promotor.id, promotor.id, promotor.id]);
    await db.persist();
    await request(app).post(`/api/invites/public/${token}/visita`).set('x-forwarded-for', '1.1.1.1').expect(200);
    await request(app).post(`/api/invites/public/${token}/visita`).set('x-forwarded-for', '1.1.1.1').expect(200);
    await request(app).post(`/api/invites/public/${token}/visita`).set('x-forwarded-for', '2.2.2.2').expect(200);
    await request(app).post('/api/invites/public/nao-existe/visita').expect(200);
    const dash = (await request(app).get('/api/promoter/dashboard').set(auth(promotor.token)).expect(200)).body;
    expect(dash.hoje).toMatchObject({ cliquesHoje: 2, cliques7d: 2 });
  });

  it('desafio: fecha a semana passada uma vez, sem contar o mesmo IP duas vezes, e lança R$ 30 aprovado', async () => {
    const semana = semanaPassada();
    const meio = new Date(new Date(semana.inicio).getTime() + 2 * 86_400_000).toISOString();
    const forte = await criar('Forte');
    const fraco = await criar('Fraco');
    const lf = await virarPromotor(forte.id);
    const lw = await virarPromotor(fraco.id);
    for (const id of [forte.id, fraco.id]) {
      await run(db, "INSERT INTO promoter_boas_vindas (user_id, etapa, enviado_em) VALUES (?, 0, 'x'), (?, 1, 'x'), (?, 2, 'x')", [id, id, id]);
    }
    // Forte: 3 cadastros, dois do mesmo IP = 2. Fraco: 1.
    for (const [i, ip] of ['ip1', 'ip1', 'ip2'].entries()) {
      const u = await criar(`IndForte${i}`, { ipHash: ip });
      await indicar(lf.linkId, u.id, meio);
    }
    const u = await criar('IndFraco', { ipHash: 'ip9' });
    await indicar(lw.linkId, u.id, meio);
    await db.persist();

    await tarefas().fecharDesafioSemanal();
    await tarefas().fecharDesafioSemanal();
    const premios = (await queryAll(db, "SELECT promoter_user_id, commission_amount, status FROM promoter_commissions WHERE event_type = 'desafio_semanal'")) as any[];
    expect(premios).toEqual([{ promoter_user_id: forte.id, commission_amount: 3000, status: 'approved' }]);
    const d = (await queryOne(db, 'SELECT vencedor_user_id, cadastros FROM promoter_desafios WHERE semana = ?', [semana.chave])) as any;
    expect(d).toMatchObject({ vencedor_user_id: forte.id, cadastros: 2 });
    const msg = (await queryOne(db, 'SELECT message, automatica FROM promoter_support_messages WHERE promoter_user_id = ?', [forte.id])) as any;
    expect(msg.message).toContain('venceu o desafio');
    expect(Number(msg.automatica)).toBe(1);

    // O prêmio não conta como venda para a faixa.
    const dash = (await request(app).get('/api/promoter/dashboard').set(auth(forte.token)).expect(200)).body;
    expect(dash.faixa.vendasMes).toBe(0);
    expect(dash.desafio.ultimoCampeao).toMatchObject({ cadastros: 2 });
    expect(dash.desafio.top.every((t: any) => !('nome' in t))).toBe(true);
  });

  it('material novo: um aviso por lote, com dia de postar; não entra na lista do suporte do admin', async () => {
    const admin = await criar('AdminMaterial', { admin: true });
    const promotor = await criar('PromotorMaterial');
    await virarPromotor(promotor.id);
    await run(db, "INSERT INTO promoter_boas_vindas (user_id, etapa, enviado_em) VALUES (?, 0, 'x'), (?, 1, 'x'), (?, 2, 'x')", [promotor.id, promotor.id, promotor.id]);
    await run(db, "INSERT INTO media (id, user_id, filename, mime_type, is_private, is_main, created_at, source) VALUES ('m-mat', ?, 'x.png', 'image/png', 0, 0, ?, 'chat')", [admin.id, new Date().toISOString()]);
    await db.persist();
    const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await request(app).post('/api/admin/promoter-assets').set(auth(admin.token))
      .send({ title: 'Vídeo d\'A Casa', caption: 'Hoje tem', mediaId: 'm-mat', destination: 'casa', usarEm: hoje, usarAte: '21:00' }).expect(201);

    // Recém-publicado: espera o lote fechar.
    await tarefas().avisarMaterialNovo();
    expect(await queryOne(db, 'SELECT id FROM promoter_support_messages WHERE promoter_user_id = ?', [promotor.id])).toBeFalsy();

    await run(db, 'UPDATE promoter_assets SET created_at = ?', [new Date(Date.now() - 5 * 60_000).toISOString()]);
    await tarefas().avisarMaterialNovo();
    await tarefas().avisarMaterialNovo();
    const msgs = (await queryAll(db, 'SELECT message FROM promoter_support_messages WHERE promoter_user_id = ?', [promotor.id])) as any[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].message).toContain("Vídeo d'A Casa — para postar hoje");
    expect(msgs[0].message).toContain('até as 21h');

    const lista = (await request(app).get('/api/admin/promoter-support').set(auth(admin.token)).expect(200)).body.chats as any[];
    expect(lista.some((c) => c.userId === promotor.id)).toBe(false);

    const assets = (await request(app).get('/api/promoter/assets').set(auth(promotor.token)).expect(200)).body.assets as any[];
    expect(assets.find((a) => a.title === "Vídeo d'A Casa").quandoPostar).toMatch(/^hoje \(\d{2}\/\d{2}\) até as 21h$/);
  });

  it('boas-vindas: promotor novo recebe o dia 1 na hora e o dia 3 só depois', async () => {
    const novo = await criar('Novato');
    await virarPromotor(novo.id, new Date(Date.now() - 60_000).toISOString());
    await db.persist();
    await tarefas().enviarBoasVindasPromotores();
    await tarefas().enviarBoasVindasPromotores();
    const msgs = (await queryAll(db, 'SELECT message FROM promoter_support_messages WHERE promoter_user_id = ?', [novo.id])) as any[];
    expect(msgs).toHaveLength(1);
    expect(msgs[0].message).toContain(`nosigilo.net/invite/tok-${novo.id}`);

    // Três dias depois: etapa do story.
    await run(db, 'UPDATE promoters SET activated_at = ? WHERE user_id = ?', [new Date(Date.now() - 2.1 * 86_400_000).toISOString(), novo.id]);
    await tarefas().enviarBoasVindasPromotores();
    const depois = (await queryAll(db, 'SELECT message FROM promoter_support_messages WHERE promoter_user_id = ? ORDER BY created_at', [novo.id])) as any[];
    expect(depois).toHaveLength(2);
    expect(depois[1].message).toContain('story hoje');
  });
});

describe('aviso de comissão', () => {
  const agora = new Date('2026-11-20T15:00:00Z');
  it('nova assinatura: nome, valor, quanto acumulou e quanto falta para o Pix do dia 01', () => {
    const { titulo, texto } = textoDaComissao({ renovacao: false, nomeDoIndicado: 'Ana Paula', comissaoCents: 198, saldoCents: 594, minimoCents: 1000, faixaAlta: false, agora });
    expect(titulo).toBe('💰 Ana assinou pelo seu link! +R$ 1,98');
    expect(texto).toContain('Você já acumulou R$ 5,94. Faltam R$ 4,06 para o Pix do dia 01/12');
    expect(texto).toContain('toda vez que renovar');
  });
  it('renovação com saldo acima do mínimo', () => {
    const { titulo, texto } = textoDaComissao({ renovacao: true, nomeDoIndicado: 'Casal Sigilo', comissaoCents: 248, saldoCents: 1500, minimoCents: 1000, faixaAlta: true, agora });
    expect(titulo).toBe('🔁 Casal renovou! +R$ 2,48 pra você');
    expect(texto).toContain('Você já acumulou R$ 15,00 para o Pix do dia 01/12 💸');
    expect(texto).toContain('faixa de 25%');
    expect(texto).not.toContain('toda vez que renovar');
  });
  it('dezembro vira 01/01 e sem nome cai em "Um indicado seu"', () => {
    expect(diaDoProximoPix(new Date('2026-12-15T12:00:00Z'))).toBe('01/01');
    expect(textoDaComissao({ renovacao: false, nomeDoIndicado: '', comissaoCents: 198, saldoCents: 198, minimoCents: 1000, faixaAlta: false, agora }).titulo).toContain('Um indicado seu');
  });
});
