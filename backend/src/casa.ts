/**
 * "A Casa" — boate virtual de sexta e sábado, das 21h à 1h (horário de Brasília).
 *
 * Salas com chat ao vivo, quem está dentro, cabine privada (conversa a dois que
 * só abre com aceite) e uma anfitriã IA (Lola) que puxa brincadeiras quentes a
 * cada 7–11 minutos. Tudo fica em memória: é uma noite, não um histórico — se o
 * servidor reiniciar, as salas recomeçam vazias e cada um entra de novo sozinho
 * (o cliente reentra quando o ping volta "fora").
 *
 * Regras de entrada (decididas com o dono em 18/10/2026):
 * - Homem ocupa no máximo metade de cada sala (com folga de 2 quando a sala
 *   ainda está vazia, para não nascer morta). A Sala dos Casais não aceita homem.
 * - Só fala, vota e chama pra cabine quem tem acesso Premium (ou teste/vitalício).
 *   Quem não assina entra espiando: lê tudo, não aparece na lista e não ocupa vaga.
 * - Verdade ou desafio e match às cegas só sorteiam quem marcou "Quero brincar".
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type express from 'express';
import type { Server as SocketIOServer } from 'socket.io';
import type { DbHandle } from './db.js';
import {
  BOAS_VINDAS, COMENTARIOS_RESULTADO, DESAFIOS, ENQUETES, EU_NUNCA, FUGIU,
  PERGUNTAS_QUENTES, QUIZ, TEMAS_DA_NOITE, VERDADES,
  type Item, type Nivel,
} from './casaBrincadeiras.js';

type Categoria = 'homem' | 'mulher' | 'casal' | 'outros';
type SalaId = 'salao' | 'casais' | 'quarto';

type Presente = {
  id: string;
  nome: string;
  avatar: string | null;
  genero: string;
  cat: Categoria;
  procura: string[];
  podeFalar: boolean;
  querBrincar: boolean;
  ultimoPing: number;
  ultimaMsg: number;
  ultimoConvite: number;
};

type Msg = {
  id: string;
  tipo: 'pessoa' | 'lola' | 'sistema';
  autor?: { id: string; nome: string; avatar: string | null; cat: Categoria };
  texto: string;
  criadoEm: string;
};

type Jogo =
  | { id: string; tipo: 'enquete' | 'eu_nunca'; texto: string; opcoes: string[]; votos: Map<string, number>; fimEm: number }
  | { id: string; tipo: 'quiz'; texto: string; opcoes: string[]; correta: number; votos: Map<string, number>; fimEm: number }
  | { id: string; tipo: 'vd'; alvoId: string; alvoNome: string; fimEm: number }
  | { id: string; tipo: 'match'; aId: string; aNome: string; bId: string; bNome: string; respostas: Map<string, boolean>; fimEm: number };

type Sala = {
  id: SalaId;
  nome: string;
  emoji: string;
  descricao: string;
  nivel: Nivel;
  semHomens: boolean;
  presentes: Map<string, Presente>;
  espiando: Map<string, number>; // userId -> último ping
  mensagens: Msg[];
  jogo: Jogo | null;
  proximoJogoEm: number;
  usados: Set<string>;
  iniciando: boolean;
};

export type DependenciasDaCasa = {
  db: DbHandle;
  deepseekKey?: string;
  requireAuth: express.RequestHandler;
  getIo: () => SocketIOServer | undefined;
  temPremium: (userId: string) => Promise<boolean>;
  premiar: (userId: string, acao: 'casa_entrada' | 'casa_quiz', refId: string) => Promise<void>;
  push: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<unknown>;
  /** Pasta onde ficam os áudios da rádio da Casa (no volume de storage, fora do repositório). */
  pastaMusicas: string;
};

type Faixa = { id: string; arquivo: string; titulo: string; artista: string; fonte: string; duracao: number };

/** Duração do áudio em segundos (ffprobe); 0 se não conseguir ler. */
function duracaoDoAudio(arquivo: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arquivo]);
    let saida = '';
    p.stdout.on('data', (d) => { saida += String(d); });
    p.on('error', () => resolve(0));
    p.on('close', () => resolve(Number.parseFloat(saida) || 0));
  });
}

const MAX_MENSAGENS = 120;
const PING_EXPIRA_MS = 75_000;
const INTERVALO_JOGO_MS = () => (7 + Math.random() * 4) * 60_000;
const TZ = 'America/Sao_Paulo';

// ─── Relógio de Brasília ─────────────────────────────────────────────────────
function agoraBrasilia(d = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dias[p('weekday')] ?? 0, hora: Number(p('hour')) % 24, data: `${p('year')}-${p('month')}-${p('day')}` };
}

/** Noite em curso pelo horário fixo (sex/sáb 21h–1h) ou null. */
function noiteDoHorario(d = new Date()): { chave: string; tema: 'sexta' | 'sabado' } | null {
  const { dow, hora, data } = agoraBrasilia(d);
  if ((dow === 5 || dow === 6) && hora >= 21) return { chave: data, tema: dow === 5 ? 'sexta' : 'sabado' };
  if ((dow === 6 || dow === 0) && hora < 1) {
    const ontem = agoraBrasilia(new Date(d.getTime() - 3 * 3600_000));
    return { chave: ontem.data, tema: dow === 6 ? 'sexta' : 'sabado' };
  }
  return null;
}

function categoria(genero: unknown): Categoria {
  const g = String(genero || '').trim().toLowerCase();
  if (g.startsWith('casal')) return 'casal';
  if (g === 'mulher' || g.startsWith('mulher ')) return 'mulher';
  if (g === 'homem' || g.startsWith('homem ')) return 'homem';
  return 'outros';
}

function sortear<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

function embaralhar<T>(lista: T[]): T[] {
  const c = [...lista];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

function procuraAceita(p: Presente, outro: Presente) {
  return p.procura.length === 0 || p.procura.includes(outro.genero);
}

export function registrarCasa(app: express.Express, deps: DependenciasDaCasa) {
  const { db } = deps;

  const novaSala = (id: SalaId, nome: string, emoji: string, descricao: string, nivel: Nivel, semHomens: boolean): Sala => ({
    id, nome, emoji, descricao, nivel, semHomens,
    presentes: new Map(), espiando: new Map(), mensagens: [], jogo: null,
    proximoJogoEm: Date.now() + 2 * 60_000, usados: new Set(), iniciando: false,
  });
  const salas = new Map<SalaId, Sala>([
    ['salao', novaSala('salao', 'Salão Principal', '🍸', 'A pista de todo mundo: conhecer, provocar e chamar pra cabine.', 'quente', false)],
    ['casais', novaSala('casais', 'Sala dos Casais', '💑', 'Só casais e mulheres. Brincadeiras muito quentes.', 'muito_quente', true)],
    ['quarto', novaSala('quarto', 'Quarto Escuro', '🖤', 'Para quem veio brincar de verdade. Sem filtro (com respeito).', 'muito_quente', false)],
  ]);
  const convites = new Map<string, { de: string; para: string; sala: SalaId; criadoEm: number }>();

  // Abertura forçada pelo admin (teste ou noite extra), guardada no banco.
  let abertaAteCache: { valor: number; lidoEm: number } = { valor: 0, lidoEm: 0 };
  const abertaAte = async () => {
    if (Date.now() - abertaAteCache.lidoEm < 30_000) return abertaAteCache.valor;
    const row = (await db.queryOne("SELECT value FROM system_settings WHERE key = 'casa_aberta_ate' LIMIT 1", [])) as any;
    abertaAteCache = { valor: Date.parse(String(row?.value || '')) || 0, lidoEm: Date.now() };
    return abertaAteCache.valor;
  };
  const noiteAtual = async () => {
    const pelaHora = noiteDoHorario();
    if (pelaHora) return { ...pelaHora, forcada: false };
    if ((await abertaAte()) > Date.now()) {
      const { dow, data } = agoraBrasilia();
      return { chave: `extra-${data}`, tema: (dow === 6 ? 'sabado' : 'sexta') as 'sexta' | 'sabado', forcada: true };
    }
    return null;
  };

  // ─── Envio em tempo real (para a sala de cada pessoa, sem join de socket) ──
  const emitirParaSala = (sala: Sala, evento: string, dados: unknown) => {
    const io = deps.getIo();
    if (!io) return;
    for (const id of sala.presentes.keys()) io.to(`user:${id}`).emit(evento, dados);
    for (const id of sala.espiando.keys()) io.to(`user:${id}`).emit(evento, dados);
  };
  const emitirPara = (userId: string, evento: string, dados: unknown) => {
    deps.getIo()?.to(`user:${userId}`).emit(evento, dados);
  };

  const publicarMsg = (sala: Sala, msg: Omit<Msg, 'id' | 'criadoEm'>) => {
    const completa: Msg = { ...msg, id: randomUUID(), criadoEm: new Date().toISOString() };
    sala.mensagens.push(completa);
    if (sala.mensagens.length > MAX_MENSAGENS) sala.mensagens.splice(0, sala.mensagens.length - MAX_MENSAGENS);
    emitirParaSala(sala, 'casa.mensagem', { sala: sala.id, msg: completa });
    return completa;
  };
  const lola = (sala: Sala, texto: string) => publicarMsg(sala, { tipo: 'lola', texto });

  const resumoPresentes = (sala: Sala) => ({
    sala: sala.id,
    presentes: [...sala.presentes.values()].filter((p) => p.podeFalar).map((p) => ({
      id: p.id, nome: p.nome, avatar: p.avatar, cat: p.cat, querBrincar: p.querBrincar,
    })),
    espiando: sala.espiando.size + [...sala.presentes.values()].filter((p) => !p.podeFalar).length,
  });
  const avisarPresentes = (sala: Sala) => emitirParaSala(sala, 'casa.presentes', resumoPresentes(sala));

  const contagem = (sala: Sala) => {
    const c = { homem: 0, mulher: 0, casal: 0, outros: 0 };
    for (const p of sala.presentes.values()) if (p.podeFalar) c[p.cat] += 1;
    return c;
  };
  const limiteDeHomens = (sala: Sala) => {
    const c = contagem(sala);
    return Math.max(c.mulher + c.casal + c.outros, 2);
  };

  const jogoPublico = (j: Jogo | null, userId: string) => {
    if (!j) return null;
    const base = { id: j.id, tipo: j.tipo, fimEm: new Date(j.fimEm).toISOString() };
    if (j.tipo === 'vd') return { ...base, alvoId: j.alvoId, alvoNome: j.alvoNome, souAlvo: j.alvoId === userId };
    if (j.tipo === 'match') {
      return { ...base, aNome: j.aNome, bNome: j.bNome, souParte: j.aId === userId || j.bId === userId, jaRespondi: j.respostas.has(userId) };
    }
    const contagemVotos = j.opcoes.map((_, i) => [...j.votos.values()].filter((v) => v === i).length);
    return { ...base, texto: j.texto, opcoes: j.opcoes, meuVoto: j.votos.get(userId) ?? null, votos: j.tipo === 'quiz' ? null : contagemVotos, total: j.votos.size };
  };
  const avisarJogo = (sala: Sala) => {
    const io = deps.getIo();
    if (!io) return;
    const todos = [...sala.presentes.keys(), ...sala.espiando.keys()];
    for (const id of todos) io.to(`user:${id}`).emit('casa.jogo', { sala: sala.id, jogo: jogoPublico(sala.jogo, id) });
  };

  // ─── Anfitriã: itens novos com a IA, banco como reserva ───────────────────
  const itemDoBanco = (sala: Sala, lista: Item[], prefixo: string) => {
    const pode = lista.map((it, i) => ({ it, chave: `${prefixo}${i}` }))
      .filter(({ it }) => it.n === 'quente' || sala.nivel === 'muito_quente');
    let livres = pode.filter(({ chave }) => !sala.usados.has(chave));
    if (livres.length === 0) {
      for (const { chave } of pode) sala.usados.delete(chave);
      livres = pode;
    }
    // Nas salas muito quentes, puxa mais para o nível alto.
    const altos = livres.filter(({ it }) => it.n === 'muito_quente');
    const escolha = sala.nivel === 'muito_quente' && altos.length > 0 && Math.random() < 0.7 ? sortear(altos) : sortear(livres);
    sala.usados.add(escolha.chave);
    return escolha.it.t;
  };

  const itemDaIa = async (sala: Sala, tipo: 'eu_nunca' | 'pergunta', exemplos: Item[]): Promise<string | null> => {
    if (!deps.deepseekKey) return null;
    const amostra = embaralhar(exemplos.filter((e) => e.n === 'quente' || sala.nivel === 'muito_quente')).slice(0, 8).map((e) => `- ${e.t}`).join('\n');
    const pedido = tipo === 'eu_nunca'
      ? 'Crie UMA frase nova de "Eu nunca…" para o jogo, começando com "Eu nunca".'
      : 'Crie UMA pergunta nova para a sala toda responder no chat.';
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 12_000);
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 1.1,
          max_tokens: 120,
          messages: [
            {
              role: 'system',
              content: `Você é a Lola, anfitriã IA de "A Casa", uma boate virtual de uma rede social adulta e liberal brasileira (swing, casais, singles; todos maiores de 18 e na plataforma por vontade própria). Você anima a sala com brincadeiras ${sala.nivel === 'muito_quente' ? 'muito quentes, ousadas e explícitas no tema' : 'quentes e provocantes'} sobre sexo, fantasias, swing e desejo. Regras: tudo consensual entre adultos; nada de menores, violência, drogas, dinheiro ou pedir dados pessoais; não peça fotos íntimas na sala aberta. Português do Brasil, linguagem de quem curte o meio liberal. Responda SOMENTE com a frase, sem aspas, no máximo 160 caracteres, no máximo um emoji.`,
            },
            { role: 'user', content: `${pedido}\nExemplos do estilo (não repita):\n${amostra}` },
          ],
        }),
        signal: controle.signal,
      });
      if (!r.ok) return null;
      const json = await r.json() as any;
      const texto = String(json?.choices?.[0]?.message?.content || '').trim().replace(/^["“”'\-\s]+|["“”']+$/g, '').trim();
      if (texto.length < 10 || texto.length > 200) return null;
      if (tipo === 'eu_nunca' && !/^eu nunca/i.test(texto)) return null;
      return texto;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const brincantes = (sala: Sala) => [...sala.presentes.values()].filter((p) => p.podeFalar && p.querBrincar);
  const falantes = (sala: Sala) => [...sala.presentes.values()].filter((p) => p.podeFalar);

  const bloqueados = async (a: string, b: string) => !!(await db.queryOne(
    'SELECT 1 AS x FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1',
    [a, b, b, a],
  ));

  const iniciarJogo = async (sala: Sala) => {
    if (sala.iniciando) return;
    sala.iniciando = true;
    try {
      const pessoas = brincantes(sala);
      const opcoes: Array<{ tipo: string; peso: number }> = [
        { tipo: 'eu_nunca', peso: 25 },
        { tipo: 'enquete', peso: 20 },
        { tipo: 'pergunta', peso: 15 },
        { tipo: 'quiz', peso: 10 },
        { tipo: 'vd', peso: pessoas.length >= 1 ? 22 : 0 },
        { tipo: 'match', peso: pessoas.length >= 2 ? 12 : 0 },
      ];
      const totalPeso = opcoes.reduce((s, o) => s + o.peso, 0);
      let r = Math.random() * totalPeso;
      let tipo = 'eu_nunca';
      for (const o of opcoes) { if ((r -= o.peso) <= 0) { tipo = o.tipo; break; } }

      const agora = Date.now();
      if (tipo === 'eu_nunca') {
        const texto = (Math.random() < 0.35 ? await itemDaIa(sala, 'eu_nunca', EU_NUNCA) : null) ?? itemDoBanco(sala, EU_NUNCA, 'en');
        sala.jogo = { id: randomUUID(), tipo: 'eu_nunca', texto, opcoes: ['🔥 Já fiz', '😇 Nunca fiz'], votos: new Map(), fimEm: agora + 90_000 };
        lola(sala, `🍷 EU NUNCA… ${texto.replace(/^eu nunca\s*/i, '')}\nToquem no botão: quem já fez assume 🔥`);
      } else if (tipo === 'enquete') {
        const pode = ENQUETES.map((e, i) => ({ e, chave: `eq${i}` })).filter(({ e }) => e.n === 'quente' || sala.nivel === 'muito_quente');
        let livres = pode.filter(({ chave }) => !sala.usados.has(chave));
        if (livres.length === 0) { pode.forEach(({ chave }) => sala.usados.delete(chave)); livres = pode; }
        const { e, chave } = sortear(livres);
        sala.usados.add(chave);
        sala.jogo = { id: randomUUID(), tipo: 'enquete', texto: e.t, opcoes: e.o, votos: new Map(), fimEm: agora + 120_000 };
        lola(sala, `📊 ENQUETE: ${e.t}`);
      } else if (tipo === 'quiz') {
        const livres = QUIZ.map((x, i) => ({ x, chave: `qz${i}` })).filter(({ chave }) => !sala.usados.has(chave));
        const { x, chave } = livres.length > 0 ? sortear(livres) : { x: sortear(QUIZ), chave: '' };
        if (chave) sala.usados.add(chave);
        sala.jogo = { id: randomUUID(), tipo: 'quiz', texto: x.t, opcoes: x.o, correta: x.c, votos: new Map(), fimEm: agora + 60_000 };
        lola(sala, `🎓 QUIZ LIBERAL: ${x.t}\nQuem acertar primeiro ganha +3 tokens!`);
      } else if (tipo === 'pergunta') {
        const texto = (Math.random() < 0.35 ? await itemDaIa(sala, 'pergunta', PERGUNTAS_QUENTES) : null) ?? itemDoBanco(sala, PERGUNTAS_QUENTES, 'pq');
        lola(sala, `🔥 ${texto}`);
        sala.jogo = null;
        sala.proximoJogoEm = agora + INTERVALO_JOGO_MS();
        return;
      } else if (tipo === 'vd') {
        const alvo = sortear(pessoas);
        sala.jogo = { id: randomUUID(), tipo: 'vd', alvoId: alvo.id, alvoNome: alvo.nome, fimEm: agora + 75_000 };
        lola(sala, `🎲 VERDADE OU DESAFIO! A roleta parou em ${alvo.nome}… Verdade, desafio ou passa? 😈`);
      } else if (tipo === 'match') {
        let par: [Presente, Presente] | null = null;
        for (const a of embaralhar(pessoas)) {
          for (const b of embaralhar(pessoas)) {
            if (a.id >= b.id) continue;
            if (a.cat === 'homem' && b.cat === 'homem') continue;
            if (!procuraAceita(a, b) || !procuraAceita(b, a)) continue;
            if (await bloqueados(a.id, b.id)) continue;
            par = [a, b];
            break;
          }
          if (par) break;
        }
        if (!par) { sala.iniciando = false; sala.proximoJogoEm = agora + 30_000; return; }
        const [a, b] = par;
        sala.jogo = { id: randomUUID(), tipo: 'match', aId: a.id, aNome: a.nome, bId: b.id, bNome: b.nome, respostas: new Map(), fimEm: agora + 90_000 };
        lola(sala, `💘 MATCH ÀS CEGAS: ${a.nome} e ${b.nome}, vocês combinam no que procuram! Topam ir pra cabine? Só abre se os dois aceitarem 🚪`);
      }
      avisarJogo(sala);
    } finally {
      sala.iniciando = false;
    }
  };

  const encerrarJogo = async (sala: Sala, motivo: 'tempo' | 'fim') => {
    const j = sala.jogo;
    if (!j) return;
    sala.jogo = null;
    sala.proximoJogoEm = Date.now() + INTERVALO_JOGO_MS();
    if (j.tipo === 'enquete' || j.tipo === 'eu_nunca') {
      const total = j.votos.size;
      if (total === 0) {
        lola(sala, 'Ninguém votou? Tô vendo vocês aí só espiando 👀');
      } else {
        const linhas = j.opcoes.map((o, i) => {
          const n = [...j.votos.values()].filter((v) => v === i).length;
          return `${o}: ${Math.round((n / total) * 100)}% (${n})`;
        });
        lola(sala, `Resultado 👇\n${linhas.join('\n')}\n${sortear(COMENTARIOS_RESULTADO)}`);
      }
    } else if (j.tipo === 'quiz' && motivo === 'tempo') {
      lola(sala, `⏰ Ninguém acertou! A resposta era: ${j.opcoes[j.correta]}`);
    } else if (j.tipo === 'vd' && motivo === 'tempo') {
      lola(sala, sortear(FUGIU).replace('{nome}', j.alvoNome));
    } else if (j.tipo === 'match' && motivo === 'tempo') {
      lola(sala, 'O match às cegas ficou pra próxima 😉 Mas a cabine continua aberta pra quem quiser chamar.');
    }
    avisarJogo(sala);
  };

  // ─── Cabine: conversa a dois, já aceita (sem passar por Pedidos) ──────────
  const abrirCabine = async (a: string, b: string): Promise<string | null> => {
    if (await bloqueados(a, b)) return null;
    const par = [a, b].sort((x, y) => x.localeCompare(y));
    const agoraIso = new Date().toISOString();
    await db.run(
      db.mode === 'pg'
        ? 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
        : 'INSERT OR IGNORE INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), par[0], par[1], agoraIso],
    );
    const conv = (await db.queryOne('SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [par[0], par[1]])) as any;
    if (!conv?.id) return null;
    // Se era um pedido pendente, os dois aceitaram na Casa: vira conversa normal.
    await db.run('UPDATE conversations SET pedido_aceito_em = COALESCE(pedido_aceito_em, ?), pedido_recusado_em = NULL WHERE id = ? AND pedido_para IS NOT NULL', [agoraIso, String(conv.id)]);
    await db.persist();
    return String(conv.id);
  };

  // ─── Relógio da Casa: presença, jogos, fechamento e aviso das 21h ─────────
  const avisosEnviados = new Set<string>();
  let noiteAnterior: string | null = null;
  const tick = async () => {
    const agora = Date.now();
    const noite = await noiteAtual();
    for (const sala of salas.values()) {
      let mudou = false;
      for (const [id, p] of sala.presentes) {
        if (agora - p.ultimoPing > PING_EXPIRA_MS) { sala.presentes.delete(id); mudou = true; }
      }
      for (const [id, t] of sala.espiando) {
        if (agora - t > PING_EXPIRA_MS) { sala.espiando.delete(id); mudou = true; }
      }
      if (mudou) avisarPresentes(sala);
      if (!noite) {
        if (sala.presentes.size > 0 || sala.espiando.size > 0) {
          lola(sala, 'A Casa fechou por hoje 🌙 Obrigada pela noite! Sexta e sábado, 21h, tem mais.');
          emitirParaSala(sala, 'casa.fechou', { sala: sala.id });
          sala.presentes.clear();
          sala.espiando.clear();
        }
        sala.jogo = null;
        sala.mensagens = [];
        sala.usados.clear();
        continue;
      }
      if (sala.jogo && agora >= sala.jogo.fimEm) await encerrarJogo(sala, 'tempo');
      if (!sala.jogo && agora >= sala.proximoJogoEm && falantes(sala).length >= 2) await iniciarJogo(sala);
    }

    // Abriu a noite: aviso no celular de quem usou o site nos últimos 7 dias (uma vez por noite).
    if (noite && !noite.forcada && noite.chave !== noiteAnterior) {
      noiteAnterior = noite.chave;
      const chave = `casa_aviso:${noite.chave}`;
      if (!avisosEnviados.has(chave)) {
        avisosEnviados.add(chave);
        const ja = await db.queryOne('SELECT 1 AS x FROM system_settings WHERE key = ? LIMIT 1', [chave]);
        if (!ja) {
          await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', [chave, 'enviando', new Date().toISOString()]);
          void avisarAbertura(noite.tema).catch((err) => console.error('[casa] aviso de abertura falhou', err));
        }
      }
    }
    if (!noite) noiteAnterior = null;

    for (const [id, c] of convites) if (agora - c.criadoEm > 120_000) convites.delete(id);
  };

  const avisarAbertura = async (tema: 'sexta' | 'sabado') => {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const pessoas = (await db.queryAll(
      `SELECT DISTINCT u.id FROM users u JOIN push_subscriptions ps ON ps.user_id = u.id
        WHERE u.last_seen_at >= ? AND COALESCE(u.is_showcase,0) = 0 AND COALESCE(u.is_banned,0) = 0
          AND COALESCE(u.is_deactivated,0) = 0 AND u.deleted_at IS NULL`,
      [desde],
    )) as any[];
    const t = TEMAS_DA_NOITE[tema];
    let enviados = 0;
    for (const p of pessoas) {
      try {
        await deps.push(String(p.id), {
          title: `🔥 A Casa abriu: ${t.nome}!`,
          body: 'Até 1h da manhã: salas ao vivo, brincadeiras quentes com a Lola e cabine a dois. Entra!',
          url: '/casa',
          tag: 'casa-abriu',
        });
        enviados++;
      } catch { /* segue para o próximo */ }
    }
    console.log(`[casa] aviso de abertura (${tema}) enviado para ${enviados} pessoa(s)`);
  };

  const relogio = setInterval(() => { tick().catch((err) => console.error('[casa] tick', err)); }, 15_000);
  relogio.unref?.();

  // ─── Rotas ────────────────────────────────────────────────────────────────
  const carregarPerfil = async (userId: string) => {
    const u = (await db.queryOne(
      `SELECT u.id, u.name, u.gender, u.looking_for_json, u.is_admin, u.avatar,
              (SELECT filename FROM media WHERE user_id = u.id AND is_main = 1 AND is_private = 0 ORDER BY created_at DESC LIMIT 1) AS foto
         FROM users u WHERE u.id = ? LIMIT 1`,
      [userId],
    )) as any;
    if (!u) return null;
    let procura: string[] = [];
    try { const v = JSON.parse(String(u.looking_for_json || '[]')); if (Array.isArray(v)) procura = v.map(String); } catch { /* vazio */ }
    return {
      id: String(u.id),
      nome: String(u.name || 'Alguém'),
      genero: String(u.gender || ''),
      cat: categoria(u.gender),
      procura,
      admin: Number(u.is_admin || 0) === 1,
      avatar: u.foto ? `/uploads/${u.foto}` : (u.avatar ? String(u.avatar) : null),
    };
  };

  const salaDe = (req: express.Request) => salas.get(String(req.params.sala) as SalaId) ?? null;
  const userDe = (req: express.Request) => String((req as any).auth?.userId || '');

  app.get('/api/casa', deps.requireAuth, async (req, res) => {
    const userId = userDe(req);
    const noite = await noiteAtual();
    const perfil = await carregarPerfil(userId);
    const podeFalar = await deps.temPremium(userId);
    res.json({
      aberta: !!noite,
      tema: noite ? TEMAS_DA_NOITE[noite.tema] : null,
      horario: 'Sexta e sábado, das 21h à 1h',
      souAdmin: !!perfil?.admin,
      podeFalar,
      abertaAte: noite?.forcada ? new Date(await abertaAte()).toISOString() : null,
      salas: [...salas.values()].map((s) => {
        const c = contagem(s);
        const souHomem = perfil?.cat === 'homem';
        return {
          id: s.id, nome: s.nome, emoji: s.emoji, descricao: s.descricao, nivel: s.nivel,
          total: c.homem + c.mulher + c.casal + c.outros,
          espiando: s.espiando.size,
          contagem: c,
          bloqueadaParaMim: s.semHomens && souHomem,
          lotadaParaMim: !s.semHomens && souHomem && podeFalar && c.homem >= limiteDeHomens(s),
        };
      }),
    });
  });

  // Admin: abre a Casa agora por X minutos (teste ou noite extra).
  app.post('/api/casa/abrir-agora', deps.requireAuth, async (req, res) => {
    const perfil = await carregarPerfil(userDe(req));
    if (!perfil?.admin) { res.status(403).json({ error: 'forbidden' }); return; }
    const minutos = Math.min(240, Math.max(0, Number((req.body as any)?.minutos ?? 60)));
    const ate = new Date(Date.now() + minutos * 60_000).toISOString();
    await db.run('DELETE FROM system_settings WHERE key = ?', ['casa_aberta_ate']);
    await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', ['casa_aberta_ate', ate, new Date().toISOString()]);
    await db.persist();
    abertaAteCache = { valor: Date.parse(ate), lidoEm: Date.now() };
    res.json({ ok: true, abertaAte: minutos > 0 ? ate : null });
  });

  const estadoPara = (sala: Sala, userId: string, p: Presente | null) => ({
    sala: { id: sala.id, nome: sala.nome, emoji: sala.emoji, descricao: sala.descricao, nivel: sala.nivel },
    mensagens: sala.mensagens.slice(-60),
    presentes: resumoPresentes(sala).presentes,
    espiando: resumoPresentes(sala).espiando,
    jogo: jogoPublico(sala.jogo, userId),
    eu: { podeFalar: !!p?.podeFalar, querBrincar: !!p?.querBrincar, espiando: !p },
  });

  app.post('/api/casa/:sala/entrar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    const userId = userDe(req);
    const noite = await noiteAtual();
    if (!noite) { res.status(403).json({ error: 'fechada', message: 'A Casa abre sexta e sábado, das 21h à 1h.' }); return; }
    const perfil = await carregarPerfil(userId);
    if (!perfil) { res.status(404).json({ error: 'not_found' }); return; }
    if (sala.semHomens && perfil.cat === 'homem') {
      res.status(403).json({ error: 'so_casais', message: 'A Sala dos Casais é só para casais e mulheres. Que tal o Salão Principal?' });
      return;
    }
    const podeFalar = await deps.temPremium(userId);

    // Uma sala por vez.
    for (const outra of salas.values()) {
      if (outra === sala) continue;
      const saiu = outra.presentes.delete(userId) || outra.espiando.delete(userId);
      if (saiu) avisarPresentes(outra);
    }

    if (!podeFalar) {
      sala.presentes.delete(userId);
      sala.espiando.set(userId, Date.now());
      avisarPresentes(sala);
      res.json(estadoPara(sala, userId, null));
      return;
    }
    const jaEstava = sala.presentes.get(userId);
    if (!jaEstava && perfil.cat === 'homem' && contagem(sala).homem >= limiteDeHomens(sala)) {
      res.status(409).json({ error: 'lotada_homens', message: 'Esta sala está com a cota de homens cheia (no máximo metade da sala). Tente outra sala ou volte em alguns minutos.' });
      return;
    }
    sala.espiando.delete(userId);
    const p: Presente = jaEstava ?? {
      id: userId, nome: perfil.nome, avatar: perfil.avatar, genero: perfil.genero, cat: perfil.cat, procura: perfil.procura,
      podeFalar: true, querBrincar: false, ultimoPing: Date.now(), ultimaMsg: 0, ultimoConvite: 0,
    };
    p.ultimoPing = Date.now();
    sala.presentes.set(userId, p);
    if (!jaEstava) {
      if (falantes(sala).length === 1 || sala.mensagens.length === 0) lola(sala, sortear(BOAS_VINDAS));
      publicarMsg(sala, { tipo: 'sistema', texto: `${p.nome} entrou na sala` });
      avisarPresentes(sala);
      void deps.premiar(userId, 'casa_entrada', `casa-${noite.chave}`).catch(() => {});
    }
    res.json(estadoPara(sala, userId, p));
  });

  app.post('/api/casa/:sala/ping', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    const p = sala.presentes.get(userId);
    if (p) p.ultimoPing = Date.now();
    else if (sala.espiando.has(userId)) sala.espiando.set(userId, Date.now());
    else { res.json({ dentro: false }); return; }
    res.json({ dentro: true });
  });

  app.post('/api/casa/:sala/sair', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    sala.espiando.delete(userId);
    if (sala.presentes.delete(userId)) avisarPresentes(sala);
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/brincar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const p = sala?.presentes.get(userDe(req));
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    p.querBrincar = !!(req.body as any)?.quer;
    avisarPresentes(sala);
    res.json({ ok: true, querBrincar: p.querBrincar });
  });

  app.post('/api/casa/:sala/mensagem', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const p = sala?.presentes.get(userDe(req));
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    const texto = String((req.body as any)?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!texto) { res.status(400).json({ error: 'texto_vazio' }); return; }
    if (/https?:\/\/|www\.|\.com\b|\.net\b|wa\.me|t\.me/i.test(texto)) {
      res.status(400).json({ error: 'link', message: 'Links não são permitidos na sala. Chame a pessoa pra cabine 😉' });
      return;
    }
    if (Date.now() - p.ultimaMsg < 1200) { res.status(429).json({ error: 'devagar' }); return; }
    p.ultimaMsg = Date.now();
    p.ultimoPing = Date.now();
    publicarMsg(sala, { tipo: 'pessoa', autor: { id: p.id, nome: p.nome, avatar: p.avatar, cat: p.cat }, texto });
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/jogo', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    const { jogoId, valor } = (req.body || {}) as { jogoId?: string; valor?: unknown };
    const j = sala.jogo;
    if (!j || j.id !== jogoId) { res.status(410).json({ error: 'jogo_encerrado' }); return; }

    if (j.tipo === 'enquete' || j.tipo === 'eu_nunca') {
      const i = Number(valor);
      if (!Number.isInteger(i) || i < 0 || i >= j.opcoes.length) { res.status(400).json({ error: 'opcao' }); return; }
      j.votos.set(userId, i);
      avisarJogo(sala);
    } else if (j.tipo === 'quiz') {
      const i = Number(valor);
      if (j.votos.has(userId) || !Number.isInteger(i)) { res.json({ ok: true }); return; }
      j.votos.set(userId, i);
      if (i === j.correta) {
        sala.jogo = null;
        sala.proximoJogoEm = Date.now() + INTERVALO_JOGO_MS();
        lola(sala, `🏆 ${p.nome} acertou primeiro: "${j.opcoes[j.correta]}". +3 tokens! 🔥`);
        void deps.premiar(userId, 'casa_quiz', `casa-quiz-${j.id}`).catch(() => {});
        avisarJogo(sala);
        res.json({ ok: true, acertou: true });
        return;
      }
      res.json({ ok: true, acertou: false });
      return;
    } else if (j.tipo === 'vd') {
      if (j.alvoId !== userId) { res.status(403).json({ error: 'nao_e_sua_vez' }); return; }
      const escolha = String(valor);
      if (escolha === 'passo') {
        lola(sala, `${p.nome} passou a vez 😏 Tudo bem, aqui ninguém é obrigado a nada.`);
      } else if (escolha === 'verdade') {
        lola(sala, `🗣️ VERDADE: ${itemDoBanco(sala, VERDADES, 've').replace('{nome}', p.nome)}`);
      } else if (escolha === 'desafio') {
        lola(sala, `😈 DESAFIO: ${itemDoBanco(sala, DESAFIOS, 'de').replace('{nome}', p.nome)}`);
      } else { res.status(400).json({ error: 'opcao' }); return; }
      await encerrarJogo(sala, 'fim');
    } else if (j.tipo === 'match') {
      if (j.aId !== userId && j.bId !== userId) { res.status(403).json({ error: 'nao_e_sua_vez' }); return; }
      j.respostas.set(userId, valor === true || valor === 'sim');
      if (valor !== true && valor !== 'sim') {
        lola(sala, 'Não rolou desta vez 😉 Mas a noite é longa…');
        await encerrarJogo(sala, 'fim');
      } else if (j.respostas.get(j.aId) && j.respostas.get(j.bId)) {
        const conversa = await abrirCabine(j.aId, j.bId);
        if (conversa) {
          lola(sala, `🚪🔥 ${j.aNome} e ${j.bNome} foram pra cabine! Comportem-se… ou não 😈`);
          emitirPara(j.aId, 'casa.cabine', { conversationId: conversa, com: j.bNome });
          emitirPara(j.bId, 'casa.cabine', { conversationId: conversa, com: j.aNome });
        }
        await encerrarJogo(sala, 'fim');
      } else {
        avisarJogo(sala);
      }
    }
    res.json({ ok: true });
  });

  // Convite para a cabine (a qualquer momento, para alguém da mesma sala).
  app.post('/api/casa/:sala/convidar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const paraId = String((req.body as any)?.para || '');
    const alvo = sala?.presentes.get(paraId);
    if (!sala || !p || !alvo || paraId === userId) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    if (Date.now() - p.ultimoConvite < 45_000) { res.status(429).json({ error: 'devagar', message: 'Espere um pouquinho antes de chamar de novo.' }); return; }
    if (await bloqueados(userId, paraId)) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está disponível.' }); return; }
    p.ultimoConvite = Date.now();
    const id = randomUUID();
    convites.set(id, { de: userId, para: paraId, sala: sala.id, criadoEm: Date.now() });
    emitirPara(paraId, 'casa.convite', { id, de: { id: p.id, nome: p.nome, avatar: p.avatar, cat: p.cat }, sala: sala.nome });
    res.json({ ok: true });
  });

  // ─── Rádio da Casa: todo mundo ouve a mesma faixa no mesmo ponto ─────────
  // A posição sai do relógio: (agora - início fixo) módulo a duração total da
  // playlist. Nada de estado no servidor; mexer na playlist só "pula" a faixa.
  mkdirSync(deps.pastaMusicas, { recursive: true });
  const INICIO_DA_RADIO = Date.UTC(2026, 0, 1);
  const lerPlaylist = async (): Promise<Faixa[]> => {
    const row = (await db.queryOne("SELECT value FROM system_settings WHERE key = 'casa_playlist' LIMIT 1", [])) as any;
    try { const v = JSON.parse(String(row?.value || '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const salvarPlaylist = async (lista: Faixa[]) => {
    await db.run("DELETE FROM system_settings WHERE key = 'casa_playlist'", []);
    await db.run("INSERT INTO system_settings (key, value, updated_at) VALUES ('casa_playlist', ?, ?)", [JSON.stringify(lista), new Date().toISOString()]);
    await db.persist();
  };
  const urlDaFaixa = (f: Faixa) => `/api/casa/musica/${f.arquivo}`;
  const souAdmin = async (req: express.Request) => !!(await carregarPerfil(userDe(req)))?.admin;

  app.get('/api/casa/radio', deps.requireAuth, async (req, res) => {
    if (!(await noiteAtual()) && !(await souAdmin(req))) { res.json({ tocando: null }); return; }
    const lista = (await lerPlaylist()).filter((f) => f.duracao > 0);
    const total = lista.reduce((s, f) => s + f.duracao, 0);
    if (total <= 0) { res.json({ tocando: null }); return; }
    let pos = ((Date.now() - INICIO_DA_RADIO) / 1000) % total;
    let i = 0;
    while (i < lista.length - 1 && pos >= lista[i].duracao) { pos -= lista[i].duracao; i += 1; }
    const f = lista[i];
    res.json({
      tocando: { id: f.id, titulo: f.titulo, artista: f.artista, url: urlDaFaixa(f), duracao: f.duracao, offset: pos },
      proxima: lista[(i + 1) % lista.length]?.titulo ?? null,
    });
  });

  // Áudio público (nome aleatório, músicas livres): o <audio> não manda cabeçalho de login.
  app.get('/api/casa/musica/:arquivo', (req, res) => {
    const nome = path.basename(String(req.params.arquivo));
    if (!/^[0-9a-f-]{36}\.(mp3|m4a|aac|ogg)$/i.test(nome)) { res.status(404).end(); return; }
    const caminho = path.join(deps.pastaMusicas, nome);
    if (!existsSync(caminho)) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.sendFile(caminho);
  });

  const envioDeMusica = multer({
    storage: multer.diskStorage({
      destination: (_req, _f, cb) => cb(null, deps.pastaMusicas),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${randomUUID()}${/^\.(mp3|m4a|aac|ogg)$/.test(ext) ? ext : '.mp3'}`);
      },
    }),
    limits: { fileSize: 30 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^audio\//.test(file.mimetype) || /\.(mp3|m4a|aac|ogg)$/i.test(file.originalname || '')),
  });

  app.get('/api/casa/admin/playlist', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    res.json({ faixas: (await lerPlaylist()).map((f) => ({ ...f, url: urlDaFaixa(f) })) });
  });

  app.post('/api/casa/admin/playlist', deps.requireAuth, envioDeMusica.single('arquivo'), async (req, res) => {
    const arquivo = (req as any).file as { path: string; filename: string } | undefined;
    const apagar = () => { if (arquivo) { try { unlinkSync(arquivo.path); } catch { /* ok */ } } };
    if (!(await souAdmin(req))) { apagar(); res.status(403).json({ error: 'forbidden' }); return; }
    if (!arquivo) { res.status(400).json({ error: 'arquivo', message: 'Envie um áudio (MP3) de até 30 MB.' }); return; }
    const duracao = await duracaoDoAudio(arquivo.path);
    if (duracao <= 0) { apagar(); res.status(400).json({ error: 'audio_invalido', message: 'Não consegui ler esse áudio. Tente um MP3.' }); return; }
    const corpo = (req.body || {}) as Record<string, string>;
    const faixa: Faixa = {
      id: randomUUID(),
      arquivo: arquivo.filename,
      titulo: String(corpo.titulo || '').trim().slice(0, 80) || 'Sem título',
      artista: String(corpo.artista || '').trim().slice(0, 80),
      fonte: String(corpo.fonte || '').trim().slice(0, 200),
      duracao: Math.round(duracao * 10) / 10,
    };
    const lista = await lerPlaylist();
    lista.push(faixa);
    await salvarPlaylist(lista);
    res.json({ ok: true, faixa: { ...faixa, url: urlDaFaixa(faixa) } });
  });

  app.post('/api/casa/admin/playlist/:id/mover', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const lista = await lerPlaylist();
    const i = lista.findIndex((f) => f.id === req.params.id);
    const j = i + ((req.body as any)?.direcao === 'cima' ? -1 : 1);
    if (i >= 0 && j >= 0 && j < lista.length) {
      [lista[i], lista[j]] = [lista[j], lista[i]];
      await salvarPlaylist(lista);
    }
    res.json({ ok: true });
  });

  app.delete('/api/casa/admin/playlist/:id', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const lista = await lerPlaylist();
    const f = lista.find((x) => x.id === req.params.id);
    if (!f) { res.status(404).json({ error: 'not_found' }); return; }
    await salvarPlaylist(lista.filter((x) => x.id !== f.id));
    try { unlinkSync(path.join(deps.pastaMusicas, f.arquivo)); } catch { /* já não existia */ }
    res.json({ ok: true });
  });

  app.post('/api/casa/convite/:id/responder', deps.requireAuth, async (req, res) => {
    const c = convites.get(String(req.params.id));
    const userId = userDe(req);
    if (!c || c.para !== userId) { res.status(410).json({ error: 'convite_expirado' }); return; }
    convites.delete(String(req.params.id));
    const aceitar = !!(req.body as any)?.aceitar;
    const sala = salas.get(c.sala);
    const de = sala?.presentes.get(c.de);
    const eu = sala?.presentes.get(userId);
    if (!aceitar) {
      emitirPara(c.de, 'casa.convite.resposta', { aceito: false });
      res.json({ ok: true });
      return;
    }
    const conversa = await abrirCabine(c.de, userId);
    if (!conversa) { res.status(409).json({ error: 'indisponivel' }); return; }
    emitirPara(c.de, 'casa.cabine', { conversationId: conversa, com: eu?.nome ?? 'alguém' });
    if (sala && de && eu) lola(sala, `🚪 ${de.nome} e ${eu.nome} foram pra cabine 🔥`);
    res.json({ ok: true, conversationId: conversa, com: de?.nome ?? 'alguém' });
  });
}
