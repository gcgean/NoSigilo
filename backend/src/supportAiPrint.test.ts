import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initDb, queryAll, run, type DbHandle } from './db.js';
import { agendarRespostaDaIa, CHAVE_ATIVA, conversaComEquipe, type Dependencias } from './supportAi.js';

// Lola lendo print (18/11/2026): imagem vai para o modelo de imagem, o cliente
// ouve o que ela viu e a conversa passa para a equipe aprovar a resposta.
describe('suporte: Lola lê o print e espera a equipe', () => {
  let db: DbHandle;
  const dbFile = path.join(process.cwd(), 'data', `test-print-${Date.now()}.sqlite`);
  const settings = new Map<string, string>();
  const avisos: string[] = [];
  let chamadas: any[] = [];

  beforeAll(async () => {
    // O ambiente de teste (jsdom) não tem AbortSignal.timeout, que o Node do servidor tem.
    if (typeof (AbortSignal as any).timeout !== 'function') (AbortSignal as any).timeout = () => new AbortController().signal;
    db = await initDb({ databaseFile: dbFile, migrationsDir: path.join(process.cwd(), 'migrations') });
  });
  afterAll(async () => {
    try { await db.close(); } catch {}
    if (existsSync(dbFile)) unlinkSync(dbFile);
  });
  afterEach(() => { vi.unstubAllGlobals(); chamadas = []; avisos.length = 0; settings.clear(); });

  const deps = (lerImagem?: Dependencias['lerImagem']): Dependencias => ({
    db,
    apiKey: 'chave-de-teste',
    getSetting: async (k) => settings.get(k) ?? null,
    setSetting: async (k, v) => { settings.set(k, v); },
    persist: async () => {},
    notificarEquipe: async (t) => { avisos.push(t); },
    lerImagem,
  });

  const respostaFalsa = (conteudo: string) => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      chamadas.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: conteudo }, finish_reason: 'stop' }] }), { status: 200 });
    }));
  };

  const novoCliente = async (texto: string, imageUrl: string | null) => {
    const id = randomUUID();
    await run(db, 'INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)', [id, `${id}@t.test`, 'x', 'Cliente Print', new Date().toISOString()]);
    await run(db, 'INSERT INTO promoter_support_messages (id, promoter_user_id, sender_type, sender_id, message, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), id, 'promoter', id, texto, imageUrl, new Date().toISOString()]);
    return id;
  };

  const esperarResposta = async (userId: string) => {
    for (let i = 0; i < 100; i += 1) {
      const r = (await queryAll(db, "SELECT message FROM promoter_support_messages WHERE promoter_user_id = ? AND sender_type = 'admin'", [userId])) as any[];
      if (r.length) return String(r[0].message);
      await new Promise((ok) => setTimeout(ok, 100));
    }
    throw new Error('sem resposta');
  };

  it('print: modelo de imagem, diz o que viu e transfere com resposta sugerida', async () => {
    settings.set(CHAVE_ATIVA, '1');
    respostaFalsa(JSON.stringify({ o_que_vi: 'a tela de Planos com o aviso "Pagamento recusado".', resumo_equipe: 'Tela de Planos, aviso de pagamento recusado no cartão.', resposta_sugerida: 'Tente outro cartão ou o Pix.' }));
    const userId = await novoCliente('não consigo pagar', '/uploads/print.webp');
    const lidos: string[] = [];
    agendarRespostaDaIa(deps(async (url) => { lidos.push(url); return { mime: 'image/webp', base64: 'QUJD' }; }), userId);
    const texto = await esperarResposta(userId);

    expect(lidos).toEqual(['/uploads/print.webp']);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' } });
    const conteudo = chamadas[0].messages[1].content;
    expect(conteudo[0].text).toContain('não consigo pagar');
    expect(conteudo[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/webp;base64,QUJD' } });

    expect(texto).toBe('Recebi seu print 👀 Pelo que vi: a tela de Planos com o aviso "Pagamento recusado". Já passei para a equipe conferir e te respondemos por aqui mesmo.');
    expect(avisos[0]).toContain('mandou print');
    expect(avisos[0]).toContain('Resposta sugerida:</b> Tente outro cartão ou o Pix.');
    // Fica com a equipe: a IA não responde mais até alguém da equipe responder.
    expect(await conversaComEquipe(deps(), userId)).toBe(true);
  }, 20_000);

  it('só texto: V4 Pro sem pensar, como antes', async () => {
    settings.set(CHAVE_ATIVA, '1');
    respostaFalsa('Oi! Pode me contar mais?');
    const userId = await novoCliente('tenho uma dúvida', null);
    agendarRespostaDaIa(deps(async () => { throw new Error('não deveria ler imagem'); }), userId);
    expect(await esperarResposta(userId)).toBe('Oi! Pode me contar mais?');
    expect(chamadas[0]).toMatchObject({ model: 'deepseek-v4-pro', thinking: { type: 'disabled' } });
    expect(chamadas[0].tools?.length).toBeGreaterThan(0);
    expect(avisos).toHaveLength(0);
  }, 20_000);

  it('print que não dá para ler: segue o fluxo de texto (pede para descrever)', async () => {
    settings.set(CHAVE_ATIVA, '1');
    respostaFalsa('Recebi o print, mas não consigo ver imagens. Pode descrever?');
    const userId = await novoCliente('', '/uploads/sumiu.webp');
    agendarRespostaDaIa(deps(async () => null), userId);
    expect(await esperarResposta(userId)).toContain('Pode descrever?');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].model).toBe('deepseek-v4-pro');
  }, 20_000);
});
