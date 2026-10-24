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
  PERGUNTAS_QUENTES, PROVOCACOES_CABINE, DADO_ACOES, DADO_PARTES, QUIZ, SUGESTOES_DE_DESAFIO, TEMAS_DA_NOITE, TEMAS_DUELO, TEMAS_FOTO, TEMAS_RELAMPAGO, VERDADES,
  type Item, type Nivel,
} from './casaBrincadeiras.js';

type Categoria = 'homem' | 'mulher' | 'casal' | 'outros';
/** Pulseira da noite, como nas casas de swing de verdade. */
type Pulseira = 'verde' | 'amarela' | 'roxa' | 'vermelha';
const PULSEIRAS: Record<Pulseira, string> = {
  verde: '🟢 aberto(a) a tudo',
  amarela: '🟡 só soft (beijos e carícias)',
  roxa: '🟣 single é bem-vindo',
  vermelha: '🔴 só olhando hoje',
};
/** Bar da Casa: o drink custa tokens, que vão para quem recebe. */
const DRINKS: Record<string, { emoji: string; nome: string; tokens: number }> = {
  cerveja: { emoji: '🍺', nome: 'uma cerveja', tokens: 3 },
  caipirinha: { emoji: '🍹', nome: 'uma caipirinha', tokens: 5 },
  gin: { emoji: '🍸', nome: 'um gin tônica', tokens: 8 },
  champanhe: { emoji: '🍾', nome: 'um champanhe', tokens: 15 },
};
const CHEGADAS = [
  '{nome} acabou de passar pela recepção 😈',
  '{nome} chegou na pista 🔥',
  'Olha quem chegou: {nome} 👀',
  '{nome} entrou e já está olhando a sala toda 😏',
  'Boa noite, {nome}! Pega um drink no bar e fica à vontade 🍸',
];
// Lola chamando alguém quieto pelo nome.
const PROVOCA_QUIETO: Record<'casal' | 'mulher' | 'homem' | 'outros', string[]> = {
  casal: [
    '{nome}, vocês estão quietos demais… qual a fantasia que vocês nunca contaram pra ninguém? 😈',
    '{nome}, conta pra sala: quem de vocês dois é o mais safado? 🔥',
    '{nome}, se pudessem escolher alguém dessa sala pra cabine, quem seria? 👀',
    '{nome}, qual foi a coisa mais ousada que vocês já fizeram juntos? A sala quer saber 😏',
    '{nome}, ela gosta de ser olhada ou ele gosta de olhar? Contem 💋',
  ],
  mulher: [
    '{nome}, tá só olhando ou vai provocar alguém hoje? 😈',
    '{nome}, conta pra gente: casal ou solteiro, qual te deixa mais curiosa? 👀',
    '{nome}, qual o seu ponto fraco? A sala promete usar com carinho 😏',
    '{nome}, se tivesse que escolher alguém da sala pra um drink agora, quem seria? 🍸',
  ],
  homem: [
    '{nome}, chegou calado… manda uma cantada pra sala, vamos ver se você é bom de papo 😏',
    '{nome}, qual o seu talento escondido? Os casais querem saber 😈',
    '{nome}, se um casal te chamasse pra cabine agora, o que você faria primeiro? 🔥',
    '{nome}, paga um drink pra alguém e mostra que veio pra brincar 🍸',
  ],
  outros: [
    '{nome}, tá muito quietinho(a)… conta o que te trouxe pra Casa hoje 😈',
    '{nome}, qual a sua fantasia favorita? A sala tá curiosa 👀',
  ],
};
// Lola comentando a mensagem que pegou fogo.
const COMENTA_QUENTE = [
  'Eita, a mensagem de {nome} pegou fogo 🔥 alguém vai responder à altura?',
  '{nome} incendiou a sala 😈 quem tem coragem de responder?',
  'Olha as reações na mensagem de {nome}… vocês estão animados, hein? 💦',
  '{nome} sabe provocar 🔥 quem vai ser o próximo a aquecer essa conversa?',
];
// Lola recebendo quem chegou, para puxar os outros a interagir.
const RECEBE_CASAL = [
  'Chegou casal novo na pista: {nome} 😈 quem vai ser o primeiro a pagar um drink pra eles?',
  '{nome} acabou de chegar 🔥 casal bonito assim não pode ficar sozinho, hein?',
  'Atenção, sala: {nome} chegou 💋 quem vai puxar assunto primeiro?',
];
const RECEBE_CUCKOLD = [
  '{nome} chegou no Quarto Cuckold 😈 ele adora ver a esposa sendo desejada… homens, capricha no elogio (com respeito)',
  'Olha quem veio se exibir: {nome} 🔥 aqui quem escolhe é ela, e o marido assiste de camarote',
  '{nome} entrou 👀 quem vai fazer essa esposa se sentir a mulher mais gostosa da Casa? Ela decide quem chega perto 💋',
];
// Lola respondendo quem respondeu a ela (sem IA disponível).
const RESPOSTAS_DA_LOLA = [
  'Gostei, {nome} 😏 continua assim que a noite é sua',
  '{nome}, você sabe provocar… agora quero ver coragem na próxima brincadeira 🔥',
  'Anotado, {nome} 😈 a sala inteira leu isso',
  'Hmm, {nome}… assim você me deixa curiosa 💋',
  'Isso, {nome}! É desse clima que A Casa gosta 🔥',
];
const RECEBE_MULHER = [
  'Chegou {nome} 💋 a sala ficou mais bonita… quem vai ser educado e oferecer um drink?',
  '{nome} entrou na pista 🔥 meninos e casais, comportem-se… ou não 😈',
];
type SalaId = 'salao' | 'casais' | 'quarto' | 'cuckold' | 'glory';

type Presente = {
  id: string;
  /** Id que os outros veem. Igual ao id real, menos no Glory Hole (anônimo). */
  idPublico: string;
  nomeReal: string;
  avatarReal: string | null;
  nome: string;
  avatar: string | null;
  genero: string;
  cat: Categoria;
  procura: string[];
  cidade: string | null;
  uf: string | null;
  podeFalar: boolean;
  querBrincar: boolean;
  ultimoPing: number;
  /** Quando entrou na sala (a Lola só provoca quem já está há uns minutos). */
  entrouEm: number;
  ultimaMsg: number;
  ultimaMidia: number;
  ultimoConvite: number;
  /** Cumpriu um desafio: pode mandar uma "revelação" (foto extra paga) até esta hora. */
  revelarAte: number;
  pulseira: Pulseira | null;
  /** Olhares que esta pessoa deu: alvo -> quando (olhares cruzados viram sugestão de cabine). */
  olhares: Map<string, number>;
};

type Msg = {
  id: string;
  tipo: 'pessoa' | 'lola' | 'sistema' | 'midia' | 'acao';
  /** Efeito animado que toca na tela de quem está na sala/cabine (drink, brinde, ação da cabine). */
  efeito?: string;
  autor?: { id: string; nome: string; avatar: string | null; cat: Categoria };
  texto: string;
  criadoEm: string;
  /** Foto ou vídeo de visualização única: o link só sai pelo /ver, uma vez por pessoa. */
  midia?: { tipo: 'foto' | 'video'; preco?: number; livre?: boolean };
  /** Mensagem respondida (citação curta). */
  resposta?: { id: string; nome: string; trecho: string };
  /** Reações: emoji → ids públicos de quem reagiu. */
  reacoes?: Record<string, string[]>;
  /** Anúncio de brincadeira da Lola: os botões de votar aparecem dentro da própria mensagem. */
  jogoId?: string;
};

// Reações da sala (as "safadas").
const REACOES_DA_CASA = ['🔥', '😈', '💦', '🍑', '🍆', '😍', '👀', '💋'];

type Jogo =
  | { id: string; tipo: 'enquete' | 'eu_nunca'; texto: string; opcoes: string[]; votos: Map<string, number>; fimEm: number }
  | { id: string; tipo: 'quiz'; texto: string; opcoes: string[]; correta: number; votos: Map<string, number>; fimEm: number }
  | { id: string; tipo: 'vd'; alvoId: string; alvoNome: string; fimEm: number }
  | { id: string; tipo: 'match'; aId: string; aNome: string; bId: string; bNome: string; respostas: Map<string, boolean>; fimEm: number }
  | { id: string; tipo: 'foto'; alvoId: string; alvoNome: string; tema: string; fimEm: number }
  | { id: string; tipo: 'duelo'; aId: string; aNome: string; bId: string; bNome: string; tema: string; fase: 'fotos' | 'votacao'; enviados: Set<string>; votos: Map<string, 'a' | 'b'>; fimEm: number }
  | { id: string; tipo: 'relampago'; tema: string; quem: 'todos' | 'casal'; vencedor: { id: string; nome: string } | null; cumpriram: Set<string>; fimEm: number };

type Sala = {
  id: SalaId;
  nome: string;
  emoji: string;
  descricao: string;
  nivel: Nivel;
  semHomens: boolean;
  /** Quarto Cuckold: homens entram à vontade, sem cota nem fila. */
  homensLivres?: boolean;
  /** Glory Hole: ninguém vê nome nem foto de ninguém. */
  anonima: boolean;
  contadorAnonimo: number;
  presentes: Map<string, Presente>;
  espiando: Map<string, number>; // userId -> último ping
  mensagens: Msg[];
  jogo: Jogo | null;
  proximoJogoEm: number;
  usados: Set<string>;
  iniciando: boolean;
  /** Fila de espera de homens quando a cota da sala está cheia. */
  fila: string[];
  /** Primeiro da fila chamado para a vaga: tem 3 minutos de prioridade. */
  convocado: { userId: string; ate: number } | null;
};

export type DependenciasDaCasa = {
  db: DbHandle;
  deepseekKey?: string;
  requireAuth: express.RequestHandler;
  getIo: () => SocketIOServer | undefined;
  temPremium: (userId: string) => Promise<boolean>;
  premiar: (userId: string, acao: 'casa_entrada' | 'casa_quiz' | 'casa_desafio' | 'casa_duelo' | 'casa_relampago', refId: string) => Promise<void>;
  /** Passa tokens de uma pessoa para outra (revelação paga). false = saldo insuficiente. */
  transferirTokens: (de: string, para: string, valor: number, refId: string) => Promise<boolean>;
  /** Tira tokens de alguém (desafio sugerido: fica guardado até cumprir). false = saldo insuficiente. */
  debitar: (userId: string, valor: number, motivo: string, refId: string) => Promise<boolean>;
  /** Devolve/entrega tokens (desafio cumprido, recusado ou vencido). */
  creditar: (userId: string, valor: number, motivo: string, refId: string) => Promise<void>;
  push: (userId: string, payload: { title: string; body: string; url: string; tag: string }) => Promise<unknown>;
  /** Pagamentos de assinatura (extrato do Hub) já ligados ao usuário. */
  assinaturasPagas: () => Promise<Array<{ userId: string; valorCents: number; pagoEm: string }>>;
  /** E-mail "A Casa abriu" para quem reservou (respeita quem desligou e-mail). */
  emailAbriu: (userId: string, tema: string) => Promise<void>;
  /** Alerta no Telegram do admin (categoria "A Casa"). */
  alertar: (texto: string) => Promise<unknown>;
  /** Pasta onde ficam os áudios da rádio da Casa (no volume de storage, fora do repositório). */
  pastaMusicas: string;
};

type Faixa = { id: string; arquivo: string; titulo: string; artista: string; fonte: string; duracao: number; tipo?: 'musica' | 'vinheta' | 'abertura' | 'fechamento' };

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
const PRECO_REVELACAO = 5;
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

/** Abertura de cada noite (Brasília). Sábado às 22h desde 24/10/2026 (teste contra a sexta às 21h). */
const HORA_DE_ABRIR = { sexta: 21, sabado: 22 } as const;
const HORARIO_DA_CASA = 'Sexta às 21h e sábado às 22h, até 1h';
const inicioDaNoite = (chave: string, tema: 'sexta' | 'sabado') => Date.parse(`${chave}T${HORA_DE_ABRIR[tema]}:00:00-03:00`);

/** Noite em curso pelo horário fixo (sex 21h–1h, sáb 22h–1h) ou null. */
function noiteDoHorario(d = new Date()): { chave: string; tema: 'sexta' | 'sabado' } | null {
  const { dow, hora, data } = agoraBrasilia(d);
  if (dow === 5 && hora >= HORA_DE_ABRIR.sexta) return { chave: data, tema: 'sexta' };
  if (dow === 6 && hora >= HORA_DE_ABRIR.sabado) return { chave: data, tema: 'sabado' };
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

// Embaralha sempre do mesmo jeito para a mesma semente (Fisher-Yates com mulberry32).
function embaralharComSemente<T>(lista: T[], semente: string): T[] {
  let h = 1779033703 ^ semente.length;
  for (let i = 0; i < semente.length; i++) { h = Math.imul(h ^ semente.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  const aleatorio = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(aleatorio() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
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

  const novaSala = (id: SalaId, nome: string, emoji: string, descricao: string, nivel: Nivel, semHomens: boolean, anonima = false, homensLivres = false): Sala => ({
    id, nome, emoji, descricao, nivel, semHomens, anonima, homensLivres, contadorAnonimo: 0,
    presentes: new Map(), espiando: new Map(), mensagens: [], jogo: null,
    proximoJogoEm: Date.now() + 2 * 60_000, usados: new Set(), iniciando: false,
    fila: [], convocado: null,
  });
  const salas = new Map<SalaId, Sala>([
    ['salao', novaSala('salao', 'Salão Principal', '🍸', 'A pista de todo mundo: conhecer, provocar e chamar pra cabine.', 'quente', false)],
    ['casais', novaSala('casais', 'Sala dos Casais', '💑', 'Só casais e mulheres. Brincadeiras muito quentes.', 'muito_quente', true)],
    ['quarto', novaSala('quarto', 'Quarto Escuro', '🖤', 'Para quem veio brincar de verdade. Sem filtro (com respeito).', 'muito_quente', false)],
    ['cuckold', novaSala('cuckold', 'Quarto Cuckold', '😈', 'Casais exibem a esposa para os homens: o marido gosta de ver os outros desejando, e até transando com ela. Sempre aberto: solteiros entram à vontade, sem fila. Quem escolhe é ela, e o casal pode chamar o solteiro para as outras salas.', 'muito_quente', false, false, true)],
    ['glory', novaSala('glory', 'Glory Hole', '🕳️', 'Anônimo: ninguém sabe quem está do outro lado. Fotos e vídeos de visualização única; revela quem quiser.', 'muito_quente', false, true)],
  ]);
  const convites = new Map<string, { de: string; para: string; sala: SalaId; criadoEm: number }>();
  // Desafios sugeridos por um perfil para outro, valendo tokens (guardados até cumprir).
  type Proposta = {
    id: string; de: string; deNome: string; para: string; paraNome: string; sala: SalaId;
    texto: string; tokens: number; privado: boolean; status: 'pendente' | 'aceita'; criadoEm: number; prazo: number;
  };
  const propostas = new Map<string, Proposta>();

  // ─── Cabines da Casa: a dois ou em grupo, porta fechada ou aberta (voyeur) ──
  type Membro = { id: string; idPublico: string; nome: string; avatar: string | null; cat: Categoria };
  type Entrada = { tipo: 'pedido' | 'convite'; pessoa: Membro; aprovados: Set<string>; convidadoAceitou: boolean; criadoEm: number };
  type Cabine = {
    id: string; salaId: SalaId; membros: Map<string, Membro>; porta: Set<string>; aberta: boolean;
    espectadores: Map<string, number>; entradas: Map<string, Entrada>; mensagens: Msg[]; criadaEm: number;
    /** Esquentar: só liga quando TODOS de dentro topam; qualquer um esfria. */
    topamEsquentar: Set<string>; quente: boolean; quenteDesde: number; ultimaProvocacao: number; ultimaFala: number; usadas: Set<string>;
    /** Tesão da cabine (0–100): sobe com as ações e libera a transa a partir de 40. */
    calor: number; liberouTransa: boolean; ultimaAcao: Map<string, number>;
    /** Quem saiu da Casa (fechou o app) e desde quando: volta em 5 min ou sai da cabine. */
    ausentes: Map<string, number>;
  };
  const cabines = new Map<string, Cabine>();
  const MAX_NA_CABINE = 6;
  const membroDe = (p: Presente): Membro => ({ id: p.id, idPublico: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat });
  const cabinePublica = (c: Cabine, userId: string) => {
    const souMembro = c.membros.has(userId);
    return {
      id: c.id,
      salaId: c.salaId,
      membros: [...c.membros.values()].map((m) => ({ id: m.idPublico, nome: m.nome, avatar: m.avatar, cat: m.cat, naCasa: estaNaCasa(m.id) })),
      aberta: c.aberta,
      votosPorta: c.porta.size,
      voteiPorta: c.porta.has(userId),
      espectadores: c.espectadores.size,
      // Quem está espiando (só quem está dentro vê os nomes; quem só espia sem assinar não aparece).
      espiandoLista: souMembro
        ? [...c.espectadores.keys()].map((id) => salas.get(c.salaId)?.presentes.get(id)).filter((p): p is Presente => !!p)
          .map((p) => ({ id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat }))
        : [],
      anonima: !!salas.get(c.salaId)?.anonima,
      souMembro,
      souEspectador: c.espectadores.has(userId),
      entradas: souMembro
        ? [...c.entradas.values()].map((e) => ({
          id: e.pessoa.idPublico, nome: e.pessoa.nome, avatar: e.pessoa.avatar, cat: e.pessoa.cat, tipo: e.tipo,
          aprovei: e.aprovados.has(userId), aprovados: e.aprovados.size, convidadoAceitou: e.convidadoAceitou,
        }))
        : [],
      pedi: c.entradas.has(userId),
      quente: c.quente,
      votosQuente: [...c.membros.keys()].filter((id) => c.topamEsquentar.has(id)).length,
      voteiQuente: c.topamEsquentar.has(userId),
      nivel: c.quente ? nivelDaCabine(c) : 0,
      calor: c.calor,
      mensagens: c.mensagens.slice(-60),
    };
  };
  const avisarCabine = (c: Cabine) => {
    for (const id of [...c.membros.keys(), ...c.espectadores.keys()]) emitirPara(id, 'casa.cabine.estado', { cabine: cabinePublica(c, id) });
  };
  const msgCabine = (c: Cabine, msg: Omit<Msg, 'id' | 'criadoEm'>, mediaId: string | null = null) => {
    const completa: Msg = { ...msg, id: randomUUID(), criadoEm: new Date().toISOString() };
    c.mensagens.push(completa);
    if (msg.tipo === 'pessoa' || msg.tipo === 'midia' || msg.tipo === 'acao') c.ultimaFala = Date.now();
    if (c.mensagens.length > MAX_MENSAGENS) c.mensagens.splice(0, c.mensagens.length - MAX_MENSAGENS);
    if (chaveDaNoite) {
      void db.run('INSERT INTO casa_mensagens (id, noite, sala, tipo, autor_id, texto, media_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [completa.id, chaveDaNoite, `cab:${c.id}`, completa.tipo, msg.autor ? [...c.membros.values()].find((m) => m.idPublico === msg.autor!.id)?.id ?? null : null, completa.texto, mediaId, completa.criadoEm]).catch(() => {});
    }
    for (const id of [...c.membros.keys(), ...c.espectadores.keys()]) emitirPara(id, 'casa.cabine.mensagem', { cabineId: c.id, msg: completa });
    return completa;
  };
  // Nível sobe com o tempo de cabine esquentada: flerte → nudez → sexo virtual.
  const nivelDaCabine = (c: Cabine): 1 | 2 | 3 => {
    const min = (Date.now() - c.quenteDesde) / 60_000;
    return min < 6 ? 1 : min < 14 ? 2 : 3;
  };
  const provocar = (c: Cabine, dado = false) => {
    c.ultimaProvocacao = Date.now();
    if (dado) {
      const nomes = [...c.membros.values()].map((m) => m.nome);
      const quem = nomes[Math.floor(Math.random() * nomes.length)];
      msgCabine(c, { tipo: 'lola', texto: `🎲 DADO DO PRAZER: ${quem}, ${sortear(DADO_ACOES)} ${sortear(DADO_PARTES)}… e mostra na câmera (visualização única) 😈` });
      return;
    }
    const nivel = nivelDaCabine(c);
    const lista = PROVOCACOES_CABINE[nivel].map((t, i) => ({ t, k: `${nivel}-${i}` }));
    let livres = lista.filter((x) => !c.usadas.has(x.k));
    if (livres.length === 0) { lista.forEach((x) => c.usadas.delete(x.k)); livres = lista; }
    const escolha = sortear(livres);
    c.usadas.add(escolha.k);
    const selo = nivel === 1 ? '🔥' : nivel === 2 ? '🔥🔥' : '🔥🔥🔥';
    msgCabine(c, { tipo: 'lola', texto: `${selo} ${escolha.t}` });
  };
  // Quem entra depois ainda não topou: a cabine esfria até todos toparem de novo.
  const conferirQuente = (c: Cabine) => {
    const todos = c.membros.size >= 2 && [...c.membros.keys()].every((id) => c.topamEsquentar.has(id));
    if (c.quente && !todos) {
      c.quente = false;
      msgCabine(c, { tipo: 'sistema', texto: '🧊 A cabine esfriou: para esquentar de novo, todos aqui dentro precisam topar.' });
    }
  };

  const criarCabine = (sala: Sala, a: Presente, b: Presente) => {
    const c: Cabine = {
      id: randomUUID(), salaId: sala.id, membros: new Map([[a.id, membroDe(a)], [b.id, membroDe(b)]]), porta: new Set(), aberta: false,
      espectadores: new Map(), entradas: new Map(), mensagens: [], criadaEm: Date.now(),
      topamEsquentar: new Set(), quente: false, quenteDesde: 0, ultimaProvocacao: 0, ultimaFala: Date.now(), usadas: new Set(),
      calor: 0, liberouTransa: false, ultimaAcao: new Map(), ausentes: new Map(),
    };
    cabines.set(c.id, c);
    msgCabine(c, { tipo: 'lola', texto: `🚪 Cabine de ${a.nome} e ${b.nome}. A porta está fechada: só vocês veem. Se todos quiserem plateia, abram a porta 👀` });
    registrarEvento(sala.id, 'cabine', a.id, b.id);
    emitirPara(a.id, 'casa.cabine', { cabineId: c.id, com: b.nome });
    emitirPara(b.id, 'casa.cabine', { cabineId: c.id, com: a.nome });
    return c;
  };
  // Na Casa = presente em alguma sala (o ping do app chega a cada 25 s).
  const estaNaCasa = (userId: string) => [...salas.values()].some((s) => s.presentes.has(userId));
  const AUSENCIA_MAX_MS = 5 * 60_000;
  const tirarDaCabine = (c: Cabine, userId: string, texto: string) => {
    c.membros.delete(userId);
    c.porta.delete(userId);
    c.topamEsquentar.delete(userId);
    c.ausentes.delete(userId);
    if (c.membros.size === 0) { fecharCabine(c); return; }
    conferirQuente(c);
    c.aberta = c.aberta && [...c.membros.keys()].every((id) => c.porta.has(id));
    msgCabine(c, { tipo: 'sistema', texto });
    avisarCabine(c);
  };
  const conferirAusentes = (c: Cabine, agora: number) => {
    let mudou = false;
    for (const [id, m] of [...c.membros]) {
      const fora = c.ausentes.get(id);
      if (estaNaCasa(id)) {
        if (fora) { c.ausentes.delete(id); msgCabine(c, { tipo: 'sistema', texto: `🔥 ${m.nome} voltou pra Casa` }); mudou = true; }
        continue;
      }
      if (!fora) {
        c.ausentes.set(id, agora);
        msgCabine(c, {
          tipo: 'lola',
          texto: c.membros.size === 2
            ? `📴 ${m.nome} saiu da Casa. Se voltar em 5 minutos, continua aqui… Pra não perder o clima, toquem em "Continuar no chat" e sigam no chat do NoSigilo 😉`
            : `📴 ${m.nome} saiu da Casa. Se voltar em 5 minutos, continua aqui; senão, sai da cabine.`,
        });
        mudou = true;
      } else if (agora - fora > AUSENCIA_MAX_MS) {
        tirarDaCabine(c, id, `${m.nome} não voltou e saiu da cabine`);
        if (!cabines.has(c.id)) return;
        mudou = false;
      }
    }
    if (mudou) avisarCabine(c);
  };
  const fecharCabine = (c: Cabine) => {
    for (const id of [...c.membros.keys(), ...c.espectadores.keys()]) emitirPara(id, 'casa.cabine.fechou', { cabineId: c.id });
    cabines.delete(c.id);
  };
  const devolverProposta = async (pr: Proposta, motivo: string) => {
    propostas.delete(pr.id);
    await deps.creditar(pr.de, pr.tokens, 'casa_desafio_estorno', `casa-proposta-${pr.id}`).catch(() => {});
    emitirPara(pr.de, 'casa.proposta.fim', { id: pr.id, cumprida: false, motivo, nome: pr.paraNome, tokens: pr.tokens });
    emitirPara(pr.para, 'casa.proposta.fim', { id: pr.id, cumprida: false, motivo, nome: pr.deNome, tokens: pr.tokens });
  };

  // Abertura forçada pelo admin (teste ou noite extra), guardada no banco.
  let abertaAteCache: { valor: number; lidoEm: number } = { valor: 0, lidoEm: 0 };
  const abertaAte = async () => {
    if (Date.now() - abertaAteCache.lidoEm < 30_000) return abertaAteCache.valor;
    const row = (await db.queryOne("SELECT value FROM system_settings WHERE key = 'casa_aberta_ate' LIMIT 1", [])) as any;
    abertaAteCache = { valor: Date.parse(String(row?.value || '')) || 0, lidoEm: Date.now() };
    return abertaAteCache.valor;
  };
  // Modo teste: abertura forçada que só admins (e os e-mails convidados) enxergam.
  // Ninguém mais vê a Casa aberta, não sai aviso e a noite não aceita reserva.
  let testeCache: { ativo: boolean; convidados: string[]; lidoEm: number } = { ativo: false, convidados: [], lidoEm: 0 };
  const modoTeste = async () => {
    if (Date.now() - testeCache.lidoEm < 30_000) return testeCache;
    const row = (await db.queryOne("SELECT value FROM system_settings WHERE key = 'casa_teste' LIMIT 1", [])) as any;
    let v: any = null;
    try { v = JSON.parse(String(row?.value || 'null')); } catch { v = null; }
    testeCache = { ativo: !!v?.ativo, convidados: Array.isArray(v?.convidados) ? v.convidados.map((e: unknown) => String(e).toLowerCase()) : [], lidoEm: Date.now() };
    return testeCache;
  };
  const noiteAtual = async () => {
    const pelaHora = noiteDoHorario();
    if (pelaHora) return { ...pelaHora, forcada: false, teste: false };
    if ((await abertaAte()) > Date.now()) {
      const { dow, data } = agoraBrasilia();
      const teste = (await modoTeste()).ativo;
      return { chave: `${teste ? 'teste' : 'extra'}-${data}`, tema: (dow === 6 ? 'sabado' : 'sexta') as 'sexta' | 'sabado', forcada: true, teste };
    }
    return null;
  };
  /** A noite como a pessoa enxerga: no modo teste, só admin e convidados veem a Casa aberta. */
  const noitePara = async (userId: string) => {
    const noite = await noiteAtual();
    if (!noite?.teste) return noite;
    const perfil = await carregarPerfil(userId);
    if (perfil?.admin) return noite;
    const email = String(((await db.queryOne('SELECT email FROM users WHERE id = ?', [userId])) as any)?.email || '').toLowerCase();
    return email && (await modoTeste()).convidados.includes(email) ? noite : null;
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

  // Noite em curso (chave do histórico do admin). Atualizada no relógio e ao entrar.
  let chaveDaNoite = '';
  const registrarEvento = (salaId: SalaId | null, tipo: string, userId: string | null, outroId: string | null = null) => {
    if (!chaveDaNoite) return;
    void db.run('INSERT INTO casa_eventos (id, noite, sala, tipo, user_id, outro_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), chaveDaNoite, salaId, tipo, userId, outroId, new Date().toISOString()]).catch(() => {});
  };

  // O histórico guarda sempre o id REAL (no Glory Hole o autor aparece com id anônimo).
  const idRealDoAutor = (sala: Sala, idPublico?: string) =>
    idPublico ? ([...sala.presentes.values()].find((x) => x.idPublico === idPublico)?.id ?? idPublico) : null;

  // Ranking da Casa: pontos por desafio cumprido, duelo, relâmpago, drink recebido.
  const pontuar = (userId: string, pontos: number, motivo: string) => {
    if (!chaveDaNoite) return;
    void db.run('INSERT INTO casa_pontos (id, noite, user_id, pontos, motivo, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), chaveDaNoite, userId, pontos, motivo, new Date().toISOString()]).catch(() => {});
  };

  // Mídia que vai só para uma pessoa (desafio sugerido "só pra mim"): não entra na sala.
  const publicarPrivado = (sala: Sala, destinoId: string, msg: Omit<Msg, 'id' | 'criadoEm'>, mediaId: string) => {
    const completa: Msg = { ...msg, id: randomUUID(), criadoEm: new Date().toISOString() };
    if (chaveDaNoite) {
      void db.run('INSERT INTO casa_mensagens (id, noite, sala, tipo, autor_id, texto, media_id, destino_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [completa.id, chaveDaNoite, sala.id, completa.tipo, idRealDoAutor(sala, completa.autor?.id), completa.texto, mediaId, destinoId, completa.criadoEm]).catch((e) => console.error('[casa] histórico', e));
    }
    emitirPara(destinoId, 'casa.mensagem', { sala: sala.id, msg: completa });
    return completa;
  };

  const publicarMsg = (sala: Sala, msg: Omit<Msg, 'id' | 'criadoEm'>, mediaId: string | null = null) => {
    const completa: Msg = { ...msg, id: randomUUID(), criadoEm: new Date().toISOString() };
    if (completa.tipo === 'lola' && sala.iniciando && sala.jogo) completa.jogoId = sala.jogo.id;
    // Tudo que acontece na Casa fica guardado para o admin (histórico por noite).
    if (chaveDaNoite) {
      void db.run('INSERT INTO casa_mensagens (id, noite, sala, tipo, autor_id, texto, media_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [completa.id, chaveDaNoite, sala.id, completa.tipo, idRealDoAutor(sala, completa.autor?.id), completa.texto, mediaId, completa.criadoEm]).catch((e) => console.error('[casa] histórico', e));
    }
    sala.mensagens.push(completa);
    if (sala.mensagens.length > MAX_MENSAGENS) sala.mensagens.splice(0, sala.mensagens.length - MAX_MENSAGENS);
    emitirParaSala(sala, 'casa.mensagem', { sala: sala.id, msg: completa });
    return completa;
  };
  const lola = (sala: Sala, texto: string) => publicarMsg(sala, { tipo: 'lola', texto });

  // ─── Moderação da Lola ─────────────────────────────────────────────────────
  // Conversa sexual explícita entre adultos é PERMITIDA. A Lola só age em:
  // menor de idade e coerção (expulsa na hora), Pix/dinheiro (bloqueia; na 2ª vez
  // expulsa), contato de fora (pedir ou mandar: só bloqueia e avisa, nunca expulsa)
  // e ofensa (avisa; na 2ª expulsa).
  const avisosDaNoite = new Map<string, number>(); // userId -> avisos
  const expulsos = new Map<string, string>(); // userId -> chave da noite
  const contadoresDaNoite = { expulsoes: 0, avisos: 0, denuncias: 0 };
  const estaExpulso = (userId: string) => !!chaveDaNoite && expulsos.get(userId) === chaveDaNoite;
  const BLOQUEIO_RAPIDO: Array<{ cat: 'dinheiro' | 'contato'; re: RegExp; aviso: string }> = [
    { cat: 'dinheiro', re: /\bpix\b|chave pix|transfer[eê]ncia|\bcobro\b|\bcach[eê]\b|r\$\s*\d|\bprograma\s+(completo|com\s+valor)/i, aviso: 'Aqui não rola Pix, cachê nem programa: A Casa é só entre liberais 😉' },
    {
      cat: 'contato',
      // Mandar contato (número, @, redes) ou pedir ("me passa seu número", "qual seu insta"…).
      re: /(\d[\s().-]?){9,}|\b(whats(app)?|zap|zapzap|wpp|telegram|insta(gram)?|onlyfans|privacy|kik|signal|discord|skype|tiktok|facebook|face)\b|(^|\s)@[a-z0-9_.]{3,}|\b(passa|passe|manda|mande|me d[aáê]|qual|tem|deixa|add)\b[^.!?]{0,25}\b(n[uú]mero|contato|cel(ular)?|telefone|fone|arroba|e-?mail)\b/i,
      aviso: 'Pedir ou mandar contato não é permitido na Casa: sua mensagem não foi enviada. Chame a pessoa pra cabine e, se rolar, continuem no chat do NoSigilo 😉',
    },
  ];
  const SUSPEITA_MENOR = /\bmenor de idade\b|\b1[0-7]\s*anos\b|\bcrian[çc]as?\b|\badolescente|\bninfet|\bpedo|\bcolegial\b/i;

  type Veredito = 'ok' | 'ofensa' | 'menor' | 'coercao';
  let moderacoesRodando = 0;
  const julgarComIa = async (texto: string): Promise<Veredito | null> => {
    if (!deps.deepseekKey || moderacoesRodando >= 6) return null;
    moderacoesRodando++;
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 10_000);
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0,
          max_tokens: 10,
          messages: [
            {
              role: 'system',
              content: `Você modera o chat de uma boate virtual ADULTA e liberal (swing). Todos são maiores de 18. Conversa sexual explícita, palavrão carinhoso, fantasias e convites entre adultos são PERMITIDOS e devem ser "ok".
Responda com UMA palavra:
- menor: fala sexual envolvendo menor de idade, criança ou adolescente, ou alguém dizendo ter menos de 18 anos.
- coercao: ameaça, forçar alguém sem consentimento, chantagem, expor/vazar foto de alguém, violência real.
- ofensa: xingamento ou humilhação dirigida a alguém da sala, racismo, homofobia, gordofobia.
- ok: todo o resto.`,
            },
            { role: 'user', content: texto.slice(0, 400) },
          ],
        }),
        signal: controle.signal,
      });
      if (!r.ok) return null;
      const json = await r.json() as any;
      const v = String(json?.choices?.[0]?.message?.content || '').trim().toLowerCase();
      return (['ok', 'ofensa', 'menor', 'coercao'] as const).find((x) => v.startsWith(x)) ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      moderacoesRodando--;
    }
  };

  // Rei/Rainha da Noite: quem venceu um duelo nesta noite ganha a 👑 na Casa.
  const reisDaNoite = new Map<string, string>(); // userId -> chave da noite
  const ehRei = (userId: string) => !!chaveDaNoite && reisDaNoite.get(userId) === chaveDaNoite;
  // Cidade só aparece para quem é do mesmo estado (igual ao chat) e nunca no Glory Hole.
  const ufDeQuemVe = new Map<string, string | null>();
  const resumoPresentes = (sala: Sala, quemVe?: string) => {
    const ufVe = quemVe ? ufDeQuemVe.get(quemVe) ?? null : null;
    return {
      sala: sala.id,
      presentes: [...sala.presentes.values()].filter((p) => p.podeFalar).map((p) => ({
        id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat, querBrincar: p.querBrincar, rei: ehRei(p.id), pulseira: p.pulseira,
        cidade: !sala.anonima && ufVe && p.uf === ufVe && p.cidade ? p.cidade : null,
      })),
      espiando: sala.espiando.size + [...sala.presentes.values()].filter((p) => !p.podeFalar).length,
    };
  };
  const avisarPresentes = (sala: Sala) => {
    for (const id of [...sala.presentes.keys(), ...sala.espiando.keys()]) emitirPara(id, 'casa.presentes', resumoPresentes(sala, id));
  };

  const contagem = (sala: Sala) => {
    const c = { homem: 0, mulher: 0, casal: 0, outros: 0 };
    for (const p of sala.presentes.values()) if (p.podeFalar) c[p.cat] += 1;
    return c;
  };
  // Com pouca gente, só Salão e Sala dos Casais (senão cada sala fica com 3 e parece vazia).
  // As outras destravam com 25 pessoas na Casa e ficam abertas até o fim da noite.
  // O Quarto Cuckold fica sempre aberto: é onde os solteiros entram sem fila.
  const SALAS_EXTRAS: SalaId[] = ['quarto', 'glory'];
  const MINIMO_PARA_DESTRAVAR = 25;
  const liberadas = new Set<string>();
  const naCasaAgora = () => [...salas.values()].reduce((n, s) => n + s.presentes.size + s.espiando.size, 0);
  const trancada = (sala: Sala, noite: { chave: string; forcada: boolean } | null) =>
    !!noite && !noite.forcada && SALAS_EXTRAS.includes(sala.id) && !liberadas.has(`${noite.chave}:${sala.id}`);
  const destravarSeEncheu = (noite: { chave: string; forcada: boolean }) => {
    if (noite.forcada) return;
    const n = naCasaAgora();
    if (n < MINIMO_PARA_DESTRAVAR) return;
    for (const id of SALAS_EXTRAS) {
      const chave = `${noite.chave}:${id}`;
      if (liberadas.has(chave)) continue;
      liberadas.add(chave);
      const s = salas.get(id)!;
      for (const outra of salas.values()) {
        if (outra.presentes.size > 0) lola(outra, `🔓 O ${s.emoji} ${s.nome} ABRIU! A Casa encheu (${n} pessoas)… quem tem coragem entra primeiro 😈`);
      }
    }
  };
  const limiteDeHomens = (sala: Sala) => {
    if (sala.homensLivres) return Number.POSITIVE_INFINITY;
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
    if (j.tipo === 'foto') return { ...base, texto: j.tema, alvoNome: j.alvoNome, souAlvo: j.alvoId === userId };
    if (j.tipo === 'duelo') {
      const souParte = j.aId === userId || j.bId === userId;
      return {
        ...base, texto: j.tema, aNome: j.aNome, bNome: j.bNome, fase: j.fase, souParte,
        jaEnviei: j.enviados.has(userId), meuVoto: j.votos.get(userId) ?? null, total: j.votos.size,
      };
    }
    if (j.tipo === 'relampago') {
      return { ...base, texto: j.tema, quem: j.quem, vencedorNome: j.vencedor?.nome ?? null, cumpriram: j.cumpriram.size, jaEnviei: j.cumpriram.has(userId) };
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

  // Lola responde quem respondeu a ela (no máximo 1 a cada 8 s na sala e 1 a cada 40 s por pessoa).
  const ultimaRespostaLola = new Map<string, number>();
  const falaDaIa = async (sala: Sala, falaDaLola: string, nome: string, texto: string): Promise<string | null> => {
    if (!deps.deepseekKey) return null;
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), 10_000);
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 1,
          max_tokens: 120,
          messages: [
            {
              role: 'system',
              content: `Você é a Lola, anfitriã IA de "A Casa", boate virtual de uma rede social adulta e liberal brasileira (swing, casais, singles; todos maiores de 18). Você está no ${sala.nome}. Responda a quem respondeu você: provocante, divertida, ${sala.nivel === 'muito_quente' ? 'bem safada' : 'sensual'}, puxando a pessoa e a sala para interagir. Regras: tudo consensual entre adultos; nada de menores, violência, drogas, dinheiro, links, contatos ou dados pessoais; não peça fotos íntimas na sala aberta; nunca diga que é humana. Chame a pessoa pelo nome. Português do Brasil. Responda SOMENTE com a frase, sem aspas, no máximo 160 caracteres, no máximo um emoji.`,
            },
            { role: 'user', content: `Você disse na sala: "${falaDaLola.slice(0, 200)}"\n${nome} respondeu: "${texto.slice(0, 200)}"` },
          ],
        }),
        signal: controle.signal,
      });
      if (!r.ok) return null;
      const json = await r.json() as any;
      const t = String(json?.choices?.[0]?.message?.content || '').trim().replace(/^["“”'\-\s]+|["“”']+$/g, '').trim();
      return t.length >= 4 && t.length <= 200 ? t : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const responderComoLola = async (sala: Sala, p: Presente, texto: string, falaDaLola: string, msgId: string) => {
    const agora = Date.now();
    if (agora - (ultimaRespostaLola.get(sala.id) ?? 0) < 8_000 || agora - (ultimaRespostaLola.get(p.id) ?? 0) < 40_000) return;
    ultimaRespostaLola.set(sala.id, agora);
    ultimaRespostaLola.set(p.id, agora);
    const dita = (await falaDaIa(sala, falaDaLola, p.nome, texto)) ?? sortear(RESPOSTAS_DA_LOLA).replace('{nome}', p.nome);
    await new Promise((r) => setTimeout(r, 1200));
    if (!sala.presentes.has(p.id)) return;
    publicarMsg(sala, { tipo: 'lola', texto: dita, resposta: { id: msgId, nome: p.nome, trecho: texto.slice(0, 80) } });
  };

  // Pulseira vermelha = "só olhando": nunca é sorteada para desafio, duelo ou match.
  const brincantes = (sala: Sala) => [...sala.presentes.values()].filter((p) => p.podeFalar && p.querBrincar && p.pulseira !== 'vermelha');
  const falantes = (sala: Sala) => [...sala.presentes.values()].filter((p) => p.podeFalar);

  const bloqueados = async (a: string, b: string) => !!(await db.queryOne(
    'SELECT 1 AS x FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1',
    [a, b, b, a],
  ));

  const iniciarJogo = async (sala: Sala, forcado?: string) => {
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
        // Desafios com câmera: os que mais esquentam a sala.
        { tipo: 'foto', peso: pessoas.length >= 1 ? 18 : 0 },
        { tipo: 'duelo', peso: pessoas.length >= 2 && falantes(sala).length >= 3 ? 14 : 0 },
        { tipo: 'relampago', peso: falantes(sala).length >= 2 ? 12 : 0 },
      ];
      const totalPeso = opcoes.reduce((s, o) => s + o.peso, 0);
      let r = Math.random() * totalPeso;
      let tipo = 'eu_nunca';
      for (const o of opcoes) { if ((r -= o.peso) <= 0) { tipo = o.tipo; break; } }
      if (forcado) tipo = forcado;

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
        sala.jogo = { id: randomUUID(), tipo: 'enquete', texto: e.t, opcoes: e.o, votos: new Map(), fimEm: agora + 180_000 };
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
      } else if (tipo === 'foto') {
        const alvo = sortear(pessoas);
        const tema = itemDoBanco(sala, TEMAS_FOTO, 'fo').replace('{nome}', alvo.nome);
        sala.jogo = { id: randomUUID(), tipo: 'foto', alvoId: alvo.id, alvoNome: alvo.nome, tema, fimEm: agora + 150_000 };
        lola(sala, `📸 DESAFIO DA FOTO! ${tema}\nVocê tem 2 minutos e meio. Cumpriu, ganha +5 tokens. Não quer? Toca em "Passo" 😉`);
      } else if (tipo === 'duelo') {
        // De preferência dois do mesmo tipo de perfil (casal x casal, mulher x mulher).
        const embaralhados = embaralhar(pessoas);
        let par: [Presente, Presente] | null = null;
        for (const a of embaralhados) {
          const b = embaralhados.find((x) => x.id !== a.id && x.cat === a.cat);
          if (b) { par = [a, b]; break; }
        }
        if (!par) par = [embaralhados[0], embaralhados[1]];
        const [a, b] = par;
        const tema = itemDoBanco(sala, TEMAS_DUELO, 'du');
        sala.jogo = { id: randomUUID(), tipo: 'duelo', aId: a.id, aNome: a.nome, bId: b.id, bNome: b.nome, tema, fase: 'fotos', enviados: new Set(), votos: new Map(), fimEm: agora + 180_000 };
        lola(sala, `🔥 DUELO: ${a.nome} x ${b.nome}! Tema: ${tema} (sem rosto). Mandem a foto pela câmera em até 3 minutos. Depois a sala vota em quem foi mais quente, e quem ganhar vira Rei/Rainha da Noite 👑 + 10 tokens`);
      } else if (tipo === 'relampago') {
        const pode = TEMAS_RELAMPAGO.map((t, i) => ({ t, chave: `re${i}` }))
          .filter(({ t }) => t.n === 'quente' || sala.nivel === 'muito_quente')
          .filter(({ t }) => t.quem === 'todos' || falantes(sala).some((p) => p.cat === 'casal'));
        let livres = pode.filter(({ chave }) => !sala.usados.has(chave));
        if (livres.length === 0) { pode.forEach(({ chave }) => sala.usados.delete(chave)); livres = pode; }
        if (livres.length === 0) { sala.proximoJogoEm = agora + 30_000; return; }
        const { t, chave } = sortear(livres);
        sala.usados.add(chave);
        sala.jogo = { id: randomUUID(), tipo: 'relampago', tema: t.t, quem: t.quem, vencedor: null, cumpriram: new Set(), fimEm: agora + 180_000 };
        lola(sala, `⚡ DESAFIO RELÂMPAGO pra sala toda! ${t.t}. Vale a câmera ao vivo, 3 minutos. Bora! 😈`);
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
    } else if (j.tipo === 'foto' && motivo === 'tempo') {
      lola(sala, `${j.alvoNome} amarelou no desafio da foto 🙈 Fica pra próxima!`);
    } else if (j.tipo === 'relampago') {
      lola(sala, j.vencedor
        ? `⚡ Fim do relâmpago! ${j.vencedor.nome} foi o primeiro e levou +10 tokens. ${j.cumpriram.size > 1 ? `${j.cumpriram.size} pessoas cumpriram, abram as fotos (1 vez) 🔥` : ''}`
        : '⚡ Ninguém teve coragem no relâmpago desta vez 😏');
    } else if (j.tipo === 'duelo') {
      if (j.fase === 'fotos' && j.enviados.size < 2) {
        const so = j.enviados.has(j.aId) ? { id: j.aId, nome: j.aNome } : j.enviados.has(j.bId) ? { id: j.bId, nome: j.bNome } : null;
        if (so) await coroar(sala, so.id, so.nome, j.id, 'venceu o duelo por W.O.');
        else lola(sala, `${j.aNome} e ${j.bNome} fugiram do duelo 🙈`);
      } else if (j.fase === 'votacao') {
        const a = [...j.votos.values()].filter((v) => v === 'a').length;
        const b = [...j.votos.values()].filter((v) => v === 'b').length;
        if (a === b) lola(sala, `🔥 Empate no duelo (${a} x ${b})! Os dois mandaram muito bem 😈`);
        else {
          const venc = a > b ? { id: j.aId, nome: j.aNome } : { id: j.bId, nome: j.bNome };
          await coroar(sala, venc.id, venc.nome, j.id, `venceu o duelo por ${Math.max(a, b)} x ${Math.min(a, b)}`);
        }
      }
    }
    avisarJogo(sala);
  };

  const coroar = async (sala: Sala, userId: string, nome: string, jogoId: string, como: string) => {
    reisDaNoite.set(userId, chaveDaNoite);
    registrarEvento(sala.id, 'rei', userId);
    pontuar(userId, 30, 'duelo_venceu');
    lola(sala, `👑 ${nome} ${como} e é Rei/Rainha da Noite! +10 tokens 🔥`);
    void deps.premiar(userId, 'casa_duelo', `casa-duelo-${jogoId}`).catch(() => {});
    avisarPresentes(sala);
  };

  // Quem cumpriu um desafio pode mandar uma foto extra paga ("revelação") por 5 minutos.
  const liberarRevelacao = (sala: Sala, p: Presente) => {
    p.revelarAte = Date.now() + 5 * 60_000;
    emitirPara(p.id, 'casa.revelacao', { sala: sala.id, ate: new Date(p.revelarAte).toISOString(), preco: PRECO_REVELACAO });
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
    registrarEvento(null, 'cabine', a, b);
    return String(conv.id);
  };

  // ─── Relógio da Casa: presença, jogos, fechamento e aviso das 21h ─────────
  const avisosEnviados = new Set<string>();
  let noiteAnterior: string | null = null;
  let ultimaLimpeza = '';
  let noiteParaResumo: string | null = null;
  const resumoMeiaNoite = new Set<string>();
  const showAvisado = new Set<string>();
  const showFeito = new Set<string>();
  const espiouHoje = new Set<string>();
  // Pico de gente ao mesmo tempo na noite (vai para o painel de negócio).
  const picoDaNoite = new Map<string, number>();
  const tick = async () => {
    const agora = Date.now();
    const noite = await noiteAtual();
    chaveDaNoite = noite?.chave ?? '';
    if (noite) {
      let agoraNaCasa = 0;
      for (const sl of salas.values()) agoraNaCasa += sl.presentes.size + sl.espiando.size;
      if (agoraNaCasa > (picoDaNoite.get(noite.chave) ?? 0)) {
        picoDaNoite.set(noite.chave, agoraNaCasa);
        void db.run('DELETE FROM system_settings WHERE key = ?', [`casa_pico:${noite.chave}`])
          .then(() => db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', [`casa_pico:${noite.chave}`, String(agoraNaCasa), new Date().toISOString()]))
          .catch(() => {});
      }
    }
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
          lola(sala, `A Casa fechou por hoje 🌙 Obrigada pela noite! ${HORARIO_DA_CASA}, tem mais.`);
          emitirParaSala(sala, 'casa.fechou', { sala: sala.id });
          sala.presentes.clear();
          sala.espiando.clear();
        }
        sala.jogo = null;
        sala.mensagens = [];
        sala.usados.clear();
        sala.fila = [];
        sala.convocado = null;
        continue;
      }
      // Fila de espera dos homens: abriu vaga, chama o primeiro (3 min de prioridade).
      if (sala.convocado && agora > sala.convocado.ate) sala.convocado = null;
      if (!sala.convocado && sala.fila.length > 0 && contagem(sala).homem < limiteDeHomens(sala)) {
        const proximo = sala.fila.shift()!;
        sala.convocado = { userId: proximo, ate: agora + 3 * 60_000 };
        emitirPara(proximo, 'casa.vaga', { sala: sala.id, nome: sala.nome });
        void deps.push(proximo, { title: `🔥 Abriu vaga no ${sala.nome}!`, body: 'Sua vez na fila d\'A Casa: você tem 3 minutos para entrar.', url: '/casa', tag: 'casa-vaga' }).catch(() => {});
      }
      // Show da Meia-Noite: aviso às 23h55 e, à meia-noite, o desafio mais quente da noite.
      const br = agoraBrasilia();
      const minuto = new Date().getUTCMinutes();
      const chaveShow = `${noite.chave}:${sala.id}`;
      if (br.hora === 23 && minuto >= 55 && !showAvisado.has(chaveShow)) {
        showAvisado.add(chaveShow);
        lola(sala, '🎆 Daqui a 5 minutos começa o SHOW DA MEIA-NOITE! Marquem "Quero brincar" e preparem a câmera 😈');
      }
      if (br.hora === 0 && !showFeito.has(chaveShow) && falantes(sala).length >= 2) {
        showFeito.add(chaveShow);
        if (sala.jogo) await encerrarJogo(sala, 'fim');
        lola(sala, '🎆🎆 SHOW DA MEIA-NOITE! As luzes baixaram… é agora que a Casa esquenta de verdade 🔥');
        await iniciarJogo(sala, brincantes(sala).length >= 2 && falantes(sala).length >= 3 ? 'duelo' : 'relampago');
      }
      if (sala.jogo && agora >= sala.jogo.fimEm) await encerrarJogo(sala, 'tempo');
      if (!sala.jogo && agora >= sala.proximoJogoEm && falantes(sala).length >= 2) {
        // Lola fala menos quando ninguém está conversando: sem fala de gente em 6 min, adia a brincadeira.
        const ultimaFalaDeGente = Math.max(0, ...[...sala.presentes.values()].map((x) => x.ultimaMsg));
        if (agora - ultimaFalaDeGente > 6 * 60_000) sala.proximoJogoEm = agora + 3 * 60_000;
        else await iniciarJogo(sala);
      }
      if (!sala.jogo) provocarQuieto(sala, agora);
    }
    if (noite) anunciarRanking(noite.chave);
    if (noite && !noite.teste) destravarSeEncheu(noite);
    void lembrarReservas(noite).catch((err) => console.error('[casa] lembrete de reserva falhou', err));

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
          void (async () => {
            const n = await totalReservas(noite.chave);
            await deps.alertar(`🔥 A Casa abriu (${TEMAS_DA_NOITE[noite.tema].nome}). A Lola assumiu. Reservas para hoje: ${n}. Vou te avisar de expulsões, denúncias e o resumo da noite.`);
          })().catch(() => {});
        }
      }
    }
    if (!noite) noiteAnterior = null;

    // Resumo da meia-noite e resumo final (quando a noite acaba).
    if (noite) {
      noiteParaResumo = noite.chave;
      const br0 = agoraBrasilia();
      if (br0.hora === 0 && !resumoMeiaNoite.has(noite.chave)) {
        resumoMeiaNoite.add(noite.chave);
        const linhas = [...salas.values()].map((sl) => `${sl.emoji} ${sl.nome}: ${falantes(sl).length} na sala`).join('\n');
        void deps.alertar(`🌙 Meia-noite na Casa\n${linhas}\nCabines: ${cabines.size} · avisos da Lola: ${contadoresDaNoite.avisos} · expulsões: ${contadoresDaNoite.expulsoes} · denúncias: ${contadoresDaNoite.denuncias}`).catch(() => {});
      }
    } else if (noiteParaResumo) {
      const chave = noiteParaResumo;
      noiteParaResumo = null;
      const contadores = { ...contadoresDaNoite };
      contadoresDaNoite.expulsoes = 0; contadoresDaNoite.avisos = 0; contadoresDaNoite.denuncias = 0;
      avisosDaNoite.clear();
      void (async () => {
        const m = (await db.queryOne(`SELECT COUNT(*) AS msgs, SUM(CASE WHEN tipo = 'midia' THEN 1 ELSE 0 END) AS midias, COUNT(DISTINCT autor_id) AS falaram FROM casa_mensagens WHERE noite = ?`, [chave])) as any;
        const e = (await db.queryOne(`SELECT COUNT(DISTINCT CASE WHEN tipo = 'entrou' THEN user_id END) AS pessoas, SUM(CASE WHEN tipo = 'cabine' THEN 1 ELSE 0 END) AS cabines, SUM(CASE WHEN tipo = 'drink' THEN 1 ELSE 0 END) AS drinks FROM casa_eventos WHERE noite = ?`, [chave])) as any;
        await deps.alertar(`🌅 A Casa fechou (${chave}). Resumo:\n👥 ${Number(e?.pessoas || 0)} pessoas entraram · 🗣️ ${Number(m?.falaram || 0)} falaram\n💬 ${Number(m?.msgs || 0)} mensagens · 📸 ${Number(m?.midias || 0)} fotos/vídeos\n🚪 ${Number(e?.cabines || 0)} cabines · 🍸 ${Number(e?.drinks || 0)} drinks\n💋 Lola: ${contadores.avisos} avisos, ${contadores.expulsoes} expulsões · 🚩 ${contadores.denuncias} denúncias\nTudo no Histórico da Casa (admin).`);
      })().catch(() => {});
    }

    // Sexta, 18h: "Hoje tem Casa às 21h, chama seu par" (uma vez por sexta).
    const relogioBr = agoraBrasilia();
    if (relogioBr.dow === 5 && relogioBr.hora === 18) {
      const chave18 = `casa_aviso18:${relogioBr.data}`;
      if (!avisosEnviados.has(chave18)) {
        avisosEnviados.add(chave18);
        const ja = await db.queryOne('SELECT 1 AS x FROM system_settings WHERE key = ? LIMIT 1', [chave18]);
        if (!ja) {
          await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', [chave18, 'enviando', new Date().toISOString()]);
          void avisarParaAtivos({
            title: '🔥 Hoje tem A Casa às 21h!',
            body: 'Sexta Liberal ao vivo até 1h: brincadeiras quentes, música e cabine a dois. Chama seu par 😈',
            url: '/casa',
            tag: 'casa-hoje',
          }).catch((err) => console.error('[casa] aviso das 18h falhou', err));
        }
      }
    }

    for (const [id, c] of convites) if (agora - c.criadoEm > 120_000) convites.delete(id);
    for (const c of [...cabines.values()]) {
      if (!noite) { fecharCabine(c); continue; }
      conferirAusentes(c, agora);
      if (!cabines.has(c.id)) continue;
      if (c.quente && agora - c.ultimaProvocacao > 3 * 60_000 && agora - c.ultimaFala > 45_000) provocar(c, Math.random() < 0.3);
      let mudou = false;
      for (const [id, t] of c.espectadores) if (agora - t > PING_EXPIRA_MS) { c.espectadores.delete(id); mudou = true; }
      for (const [id, e] of c.entradas) if (agora - e.criadoEm > 3 * 60_000) { c.entradas.delete(id); mudou = true; }
      if (mudou) avisarCabine(c);
    }
    for (const pr of [...propostas.values()]) {
      if (!noite) { await devolverProposta(pr, 'A Casa fechou: os tokens voltaram.'); continue; }
      if (pr.status === 'pendente' && agora - pr.criadoEm > 2 * 60_000) await devolverProposta(pr, 'Não respondeu a tempo: os tokens voltaram.');
      else if (pr.status === 'aceita' && agora > pr.prazo) {
        const sala = salas.get(pr.sala);
        if (sala) lola(sala, `⏰ ${pr.paraNome} aceitou mas não cumpriu o desafio de ${pr.deNome} a tempo… os tokens voltaram 😏`);
        await devolverProposta(pr, 'O prazo acabou: os tokens voltaram.');
      }
    }

    // Histórico da Casa fica 90 dias (limpeza uma vez por dia, fora da noite).
    if (!noite && relogioBr.data !== ultimaLimpeza) {
      ultimaLimpeza = relogioBr.data;
      const limite = new Date(agora - 90 * 86_400_000).toISOString();
      void (async () => {
        await db.run('DELETE FROM casa_midia_vistas WHERE mensagem_id IN (SELECT id FROM casa_mensagens WHERE created_at < ?)', [limite]);
        await db.run('DELETE FROM casa_mensagens WHERE created_at < ?', [limite]);
        await db.run('DELETE FROM casa_eventos WHERE created_at < ?', [limite]);
        await db.run('DELETE FROM casa_reservas WHERE created_at < ?', [limite]);
      })().catch((e) => console.error('[casa] limpeza do histórico', e));
    }
  };

  // Quem reservou: lembrete 15 min antes de abrir e, 20 min depois, convite com a Casa já cheia.
  const umaVez = async (chave: string) => {
    if (avisosEnviados.has(chave)) return false;
    avisosEnviados.add(chave);
    if (await db.queryOne('SELECT 1 AS x FROM system_settings WHERE key = ? LIMIT 1', [chave])) return false;
    await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', [chave, 'enviado', new Date().toISOString()]);
    return true;
  };
  const lembrarReservas = async (noite: { chave: string; tema: 'sexta' | 'sabado'; forcada: boolean; teste: boolean } | null) => {
    if (!noite) {
      const daqui15 = noiteDoHorario(new Date(Date.now() + 15 * 60_000));
      if (!daqui15 || !(await umaVez(`casa_lembrete15:${daqui15.chave}`))) return;
      const t = TEMAS_DA_NOITE[daqui15.tema];
      const ids = ((await db.queryAll('SELECT user_id FROM casa_reservas WHERE noite = ?', [daqui15.chave])) as any[]).map((r) => String(r.user_id));
      for (const id of ids) {
        await deps.push(id, { title: '⏰ Faltam 15 minutos para A Casa!', body: `${t.nome} começa às ${HORA_DE_ABRIR[daqui15.tema]}h. Seu lugar está reservado: chega cedo pra pegar a sala cheia 😈`, url: '/casa', tag: 'casa-15min' }).catch(() => {});
        await new Promise((r) => setTimeout(r, 60));
      }
      return;
    }
    if (noite.forcada || noite.teste) return;
    const passou = Date.now() - inicioDaNoite(noite.chave, noite.tema);
    if (passou < 20 * 60_000 || passou > 40 * 60_000) return;
    if (!(await umaVez(`casa_lembrete20:${noite.chave}`))) return;
    const pessoas = naCasaAgora();
    const nCabines = cabines.size;
    const faltam = (await db.queryAll(
      "SELECT r.user_id FROM casa_reservas r WHERE r.noite = ? AND NOT EXISTS (SELECT 1 FROM casa_eventos e WHERE e.noite = r.noite AND e.user_id = r.user_id AND e.tipo IN ('entrou', 'espiou'))",
      [noite.chave],
    )) as any[];
    const corpo = pessoas >= 5
      ? `Já tem ${pessoas} pessoas${nCabines > 0 ? ` e ${nCabines} cabine(s) rolando` : ''} 🔥 Seu lugar está te esperando, entra!`
      : 'A Lola já está puxando as brincadeiras 🔥 Seu lugar está te esperando, entra!';
    for (const r of faltam) {
      await deps.push(String(r.user_id), { title: '🔥 A Casa está pegando fogo', body: corpo, url: '/casa', tag: 'casa-20min' }).catch(() => {});
      await new Promise((res) => setTimeout(res, 60));
    }
  };

  const avisarAbertura = async (tema: 'sexta' | 'sabado') => {
    const t = TEMAS_DA_NOITE[tema];
    const reservados = (await db.queryAll('SELECT user_id FROM casa_reservas WHERE noite = ?', [chaveDaNoite])) as any[];
    const jaAvisados = new Set<string>();
    for (const r of reservados) {
      const id = String(r.user_id);
      jaAvisados.add(id);
      await deps.push(id, {
        title: '🔥 Seu lugar n\'A Casa está esperando!',
        body: `${t.nome} começou agora, até 1h. Você reservou: entra e chega antes da sala lotar 😈`,
        url: '/casa',
        tag: 'casa-abriu',
      }).catch(() => {});
      await deps.emailAbriu(id, t.nome).catch(() => {});
      await new Promise((r) => setTimeout(r, 120)); // respeita o limite do Resend
    }
    await avisarParaAtivos({
      title: `🔥 A Casa abriu: ${t.nome}!`,
      body: 'Até 1h da manhã: salas ao vivo, brincadeiras quentes com a Lola e cabine a dois. Entra!',
      url: '/casa',
      tag: 'casa-abriu',
    }, jaAvisados);
  };

  const avisarParaAtivos = async (payload: { title: string; body: string; url: string; tag: string }, pular: Set<string> = new Set()) => {
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const pessoas = (await db.queryAll(
      `SELECT DISTINCT u.id FROM users u JOIN push_subscriptions ps ON ps.user_id = u.id
        WHERE u.last_seen_at >= ? AND COALESCE(u.is_showcase,0) = 0 AND COALESCE(u.is_banned,0) = 0
          AND COALESCE(u.is_deactivated,0) = 0 AND u.deleted_at IS NULL`,
      [desde],
    )) as any[];
    let enviados = 0;
    for (const p of pessoas) {
      if (pular.has(String(p.id))) continue;
      try {
        await deps.push(String(p.id), payload);
        enviados++;
      } catch { /* segue para o próximo */ }
    }
    console.log(`[casa] aviso "${payload.tag}" enviado para ${enviados} pessoa(s)`);
  };

  const relogio = setInterval(() => { tick().catch((err) => console.error('[casa] tick', err)); }, 15_000);
  relogio.unref?.();

  // ─── Rotas ────────────────────────────────────────────────────────────────
  const carregarPerfil = async (userId: string) => {
    const u = (await db.queryOne(
      `SELECT u.id, u.name, u.gender, u.looking_for_json, u.is_admin, u.avatar, u.city, u.state, u.created_at,
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
      criadoEm: u.created_at ? String(u.created_at) : null,
      cidade: u.city ? String(u.city) : null,
      uf: u.state ? String(u.state).trim().toUpperCase() : null,
    };
  };

  /** Chave da noite em curso ou da próxima (é nela que a reserva vale). */
  const proximaNoite = async (): Promise<{ chave: string; inicio: string | null }> => {
    const agora = await noiteAtual();
    if (agora && !agora.teste) return { chave: agora.chave, inicio: null };
    const base = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    for (let h = 0; h < 8 * 24; h++) {
      const t = new Date(base + h * 3_600_000);
      const n = noiteDoHorario(t);
      if (n) return { chave: n.chave, inicio: t.toISOString() };
    }
    return { chave: '', inicio: null };
  };
  const totalReservas = async (chave: string) =>
    Number(((await db.queryOne('SELECT COUNT(*) AS c FROM casa_reservas WHERE noite = ?', [chave])) as any)?.c || 0);

  const expulsar = async (userId: string, nome: string, motivo: string, texto: string | null, salaId: string) => {
    expulsos.set(userId, chaveDaNoite);
    contadoresDaNoite.expulsoes++;
    for (const sala of salas.values()) {
      const estava = sala.presentes.delete(userId) || sala.espiando.delete(userId);
      sala.fila = sala.fila.filter((id) => id !== userId);
      if (estava) {
        publicarMsg(sala, { tipo: 'sistema', texto: `🚫 ${nome} foi retirado(a) da Casa por desrespeitar as regras.` });
        avisarPresentes(sala);
      }
    }
    for (const c of [...cabines.values()]) {
      c.espectadores.delete(userId);
      if (c.membros.delete(userId)) {
        c.porta.delete(userId);
        c.topamEsquentar.delete(userId);
        if (c.membros.size === 0) fecharCabine(c);
        else { conferirQuente(c); msgCabine(c, { tipo: 'sistema', texto: `🚫 ${nome} foi retirado(a) da Casa.` }); avisarCabine(c); }
      }
    }
    emitirPara(userId, 'casa.expulso', { motivo });
    registrarEvento(null, 'expulso', userId);
    const email = ((await db.queryOne('SELECT email FROM users WHERE id = ?', [userId])) as any)?.email ?? '?';
    void deps.alertar(`🚫 A Casa: ${nome} (${email}) foi retirado(a) da noite.\nMotivo: ${motivo}\nSala: ${salaId}${texto ? `\nMensagem: "${texto.slice(0, 200)}"` : ''}`).catch(() => {});
  };

  /** Bloqueio na hora (Pix/contato). Devolve a mensagem para a pessoa ou null se pode publicar. */
  const bloqueioRapido = async (userId: string, nome: string, texto: string, salaId: string): Promise<string | null> => {
    const achou = BLOQUEIO_RAPIDO.find((b) => b.re.test(texto));
    if (!achou) return null;
    // Contato: só bloqueia a mensagem e avisa (sem contar aviso nem expulsar).
    if (achou.cat === 'contato') return `💋 Lola: ${achou.aviso}`;
    const n = (avisosDaNoite.get(userId) ?? 0) + 1;
    avisosDaNoite.set(userId, n);
    contadoresDaNoite.avisos++;
    if (n >= 2) {
      await expulsar(userId, nome, 'Pix/dinheiro na sala (2º aviso)', texto, salaId);
      return 'Você foi retirado(a) da Casa nesta noite por repetir o que a Lola pediu para não fazer.';
    }
    return `💋 Lola: ${achou.aviso} (1º aviso; no próximo você sai da Casa)`;
  };

  /** Depois de publicar: a IA olha menor de idade, coerção e ofensa. */
  const moderarDepois = (userId: string, nome: string, texto: string, salaId: string, remover: () => void) => {
    if (texto.length < 6) return;
    void (async () => {
      const veredito = await julgarComIa(texto);
      if (veredito === null) {
        if (SUSPEITA_MENOR.test(texto)) void deps.alertar(`⚠️ A Casa: possível menção a menor de idade (IA indisponível, confira).\n${nome}: "${texto.slice(0, 200)}"\nSala: ${salaId}`).catch(() => {});
        return;
      }
      if (veredito === 'ok') return;
      remover();
      if (veredito === 'menor') { await expulsar(userId, nome, 'Menção a menor de idade', texto, salaId); return; }
      if (veredito === 'coercao') { await expulsar(userId, nome, 'Ameaça / falta de consentimento', texto, salaId); return; }
      const n = (avisosDaNoite.get(userId) ?? 0) + 1;
      avisosDaNoite.set(userId, n);
      contadoresDaNoite.avisos++;
      if (n >= 2) await expulsar(userId, nome, 'Ofensa (2º aviso)', texto, salaId);
      else emitirPara(userId, 'casa.aviso', { texto: '💋 Lola: aqui a regra é respeito. Sua mensagem foi removida (1º aviso; no próximo você sai da Casa).' });
    })();
  };

  const removerMsgDaSala = (sala: Sala, msgId: string) => {
    sala.mensagens = sala.mensagens.filter((m) => m.id !== msgId);
    emitirParaSala(sala, 'casa.mensagem.removida', { sala: sala.id, id: msgId });
    void db.run("UPDATE casa_mensagens SET tipo = 'removida' WHERE id = ?", [msgId]).catch(() => {});
  };

  const acharPublico = (sala: Sala, idPublico: string) => [...sala.presentes.values()].find((x) => x.idPublico === idPublico);
  // Casal ou mulher chama um solteiro para outra sala: ele entra sem fila (vale 5 min, uma entrada).
  const convitesDeSala = new Map<string, { sala: SalaId; ate: number }>();

  // Mulher entra grátis com tudo liberado (é quem segura a sala); o resto precisa assinar.
  const podeFalarNaCasa = async (userId: string, cat: Categoria | undefined) => cat === 'mulher' || (await deps.temPremium(userId));
  const salaDe = (req: express.Request) => salas.get(String(req.params.sala) as SalaId) ?? null;
  const userDe = (req: express.Request) => String((req as any).auth?.userId || '');

  // Página pública d'A Casa (sem login): só números, nada de nomes ou fotos.
  app.get('/api/casa/publico', async (_req, res) => {
    const noiteReal = await noiteAtual();
    const noite = noiteReal?.teste ? null : noiteReal;
    let pessoas = 0;
    // No modo teste a contagem fica zerada (ninguém de fora sabe que tem gente testando).
    if (!noiteReal?.teste) for (const s of salas.values()) pessoas += s.presentes.size + s.espiando.size;
    // Próxima abertura: anda de hora em hora até cair dentro do horário.
    let proxima: string | null = null;
    if (!noite) {
      const base = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
      for (let h = 0; h < 8 * 24; h++) {
        const t = new Date(base + h * 3_600_000);
        if (noiteDoHorario(t)) { proxima = t.toISOString(); break; }
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=30');
    const prox = await proximaNoite();
    res.json({
      aberta: !!noite,
      tema: noite ? TEMAS_DA_NOITE[noite.tema] : null,
      pessoas,
      reservas: prox.chave ? await totalReservas(prox.chave) : 0,
      proximaAbertura: proxima,
      salas: [...salas.values()].map((s) => ({ nome: s.nome, emoji: s.emoji, descricao: s.descricao, nivel: s.nivel })),
    });
  });

  app.get('/api/casa', deps.requireAuth, async (req, res) => {
    const userId = userDe(req);
    const noite = await noitePara(userId);
    const perfil = await carregarPerfil(userId);
    const podeFalar = await podeFalarNaCasa(userId, perfil?.cat);
    const prox = await proximaNoite();
    const reservado = prox.chave ? !!(await db.queryOne('SELECT 1 AS x FROM casa_reservas WHERE user_id = ? AND noite = ?', [userId, prox.chave])) : false;
    res.json({
      aberta: !!noite,
      tema: noite ? TEMAS_DA_NOITE[noite.tema] : null,
      horario: HORARIO_DA_CASA,
      reservado,
      contaCriadaEm: perfil?.criadoEm ?? null,
      reservas: prox.chave ? await totalReservas(prox.chave) : 0,
      proximaAbertura: prox.inicio,
      souAdmin: !!perfil?.admin,
      // Modo teste: sem proteção de print (para mandar prints das melhorias).
      teste: !!noite?.teste,
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
          trancada: trancada(s, noite) && !perfil?.admin,
          faltamParaAbrir: trancada(s, noite) ? Math.max(0, MINIMO_PARA_DESTRAVAR - naCasaAgora()) : 0,
          lotadaParaMim: !s.semHomens && souHomem && podeFalar && c.homem >= limiteDeHomens(s) && s.convocado?.userId !== userId,
          posicaoNaFila: s.fila.indexOf(userId) >= 0 ? s.fila.indexOf(userId) + 1 : null,
          // Para o mapa da Casa: só o tipo de cada pessoa (sem nome) e as cabines da sala.
          pessoas: [...s.presentes.values()].map((x) => x.cat),
          cabines: [...cabines.values()].filter((c) => c.salaId === s.id).map((c) => ({
            id: c.id, aberta: c.aberta, pessoas: c.membros.size, espiando: c.espectadores.size,
            tipos: c.aberta ? [...c.membros.values()].map((m) => m.cat) : [],
          })),
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
    const teste = minutos > 0 && !!(req.body as any)?.teste;
    const convidados = String((req.body as any)?.convidados || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')).slice(0, 20);
    await db.run('DELETE FROM system_settings WHERE key = ?', ['casa_aberta_ate']);
    await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', ['casa_aberta_ate', ate, new Date().toISOString()]);
    await db.run('DELETE FROM system_settings WHERE key = ?', ['casa_teste']);
    await db.run('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)', ['casa_teste', JSON.stringify({ ativo: teste, convidados }), new Date().toISOString()]);
    await db.persist();
    abertaAteCache = { valor: Date.parse(ate), lidoEm: Date.now() };
    testeCache = { ativo: teste, convidados, lidoEm: Date.now() };
    res.json({ ok: true, abertaAte: minutos > 0 ? ate : null, teste, convidados });
  });

  const midiasQueVi = async (sala: Sala, userId: string) => {
    const ids = sala.mensagens.filter((m) => m.tipo === 'midia').map((m) => m.id);
    if (ids.length === 0) return [] as string[];
    const rows = (await db.queryAll(
      `SELECT mensagem_id FROM casa_midia_vistas WHERE user_id = ? AND mensagem_id IN (${ids.map(() => '?').join(',')})`,
      [userId, ...ids],
    )) as any[];
    return rows.map((r) => String(r.mensagem_id));
  };

  const estadoPara = async (sala: Sala, userId: string, p: Presente | null) => ({
    midiasVistas: await midiasQueVi(sala, userId),
    sala: { id: sala.id, nome: sala.nome, emoji: sala.emoji, descricao: sala.descricao, nivel: sala.nivel },
    mensagens: sala.mensagens.slice(-60),
    presentes: resumoPresentes(sala, userId).presentes,
    espiando: resumoPresentes(sala, userId).espiando,
    jogo: jogoPublico(sala.jogo, userId),
    eu: { podeFalar: !!p?.podeFalar, querBrincar: !!p?.querBrincar, espiando: !p, pulseira: p?.pulseira ?? null, idPublico: p?.idPublico ?? null, revelado: !!p && p.nome === p.nomeReal },
    sala_anonima: sala.anonima,
  });

  app.post('/api/casa/:sala/entrar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    const userId = userDe(req);
    const noite = await noitePara(userId);
    if (!noite) { res.status(403).json({ error: 'fechada', message: `A Casa abre ${HORARIO_DA_CASA.toLowerCase()}.` }); return; }
    chaveDaNoite = noite.chave;
    if (estaExpulso(userId)) { res.status(403).json({ error: 'expulso', message: 'Você foi retirado(a) da Casa nesta noite. Na próxima noite você pode voltar.' }); return; }
    const perfil = await carregarPerfil(userId);
    if (!perfil) { res.status(404).json({ error: 'not_found' }); return; }
    if (trancada(sala, noite) && !perfil.admin && !sala.presentes.has(userId)) {
      const n = naCasaAgora();
      res.status(403).json({ error: 'trancada', message: `O ${sala.nome} abre quando a Casa tiver ${MINIMO_PARA_DESTRAVAR} pessoas (agora ${n}). Chama mais gente! 😈` });
      return;
    }
    if (sala.semHomens && perfil.cat === 'homem') {
      res.status(403).json({ error: 'so_casais', message: 'A Sala dos Casais é só para casais e mulheres. Que tal o Salão Principal?' });
      return;
    }
    const podeFalar = await podeFalarNaCasa(userId, perfil.cat);
    ufDeQuemVe.set(userId, perfil.uf);

    // Uma sala por vez.
    for (const outra of salas.values()) {
      if (outra === sala) continue;
      const saiu = outra.presentes.delete(userId) || outra.espiando.delete(userId);
      if (saiu) avisarPresentes(outra);
    }

    if (!podeFalar) {
      sala.presentes.delete(userId);
      sala.espiando.set(userId, Date.now());
      if (!espiouHoje.has(`${noite.chave}:${userId}`)) { espiouHoje.add(`${noite.chave}:${userId}`); registrarEvento(sala.id, 'espiou', userId); }
      avisarPresentes(sala);
      res.json(await estadoPara(sala, userId, null));
      return;
    }
    const jaEstava = sala.presentes.get(userId);
    if (!jaEstava && perfil.cat === 'homem') {
      const convocadoAtivo = sala.convocado && sala.convocado.ate > Date.now() ? sala.convocado : null;
      const souConvocado = convocadoAtivo?.userId === userId;
      const vagaGuardada = convocadoAtivo && !souConvocado ? 1 : 0;
      const convidado = convitesDeSala.get(userId);
      const temConvite = !!convidado && convidado.sala === sala.id && convidado.ate > Date.now();
      if (temConvite) convitesDeSala.delete(userId);
      else if (contagem(sala).homem + vagaGuardada >= limiteDeHomens(sala)) {
        const pos = sala.fila.indexOf(userId);
        res.status(409).json({
          error: 'lotada_homens',
          posicaoNaFila: pos >= 0 ? pos + 1 : null,
          message: 'A cota de homens desta sala está cheia (no máximo metade da sala). Entre na fila: quando abrir vaga, a gente te chama.',
        });
        return;
      }
      if (souConvocado) sala.convocado = null;
    }
    sala.fila = sala.fila.filter((id) => id !== userId);
    sala.espiando.delete(userId);
    const apelido = sala.anonima ? `Anônimo ${++sala.contadorAnonimo}` : null;
    const p: Presente = jaEstava ?? {
      id: userId, idPublico: sala.anonima ? randomUUID().slice(0, 12) : userId, nomeReal: perfil.nome, avatarReal: perfil.avatar,
      nome: apelido ?? perfil.nome, avatar: sala.anonima ? null : perfil.avatar, genero: perfil.genero, cat: perfil.cat, procura: perfil.procura,
      cidade: perfil.cidade, uf: perfil.uf,
      podeFalar: true, querBrincar: false, ultimoPing: Date.now(), ultimaMsg: 0, ultimaMidia: 0, ultimoConvite: 0, revelarAte: 0,
      pulseira: null, olhares: new Map(), entrouEm: Date.now(),
    };
    p.ultimoPing = Date.now();
    sala.presentes.set(userId, p);
    if (!jaEstava) {
      if ((falantes(sala).length === 1 || sala.mensagens.length === 0) && Date.now() - (ultimaSaudacao.get(sala.id) ?? 0) > 30 * 60_000) {
        ultimaSaudacao.set(sala.id, Date.now());
        lola(sala, sortear(BOAS_VINDAS));
      }
      // Quem cai e volta (celular em segundo plano) não gera "chegou" de novo a cada minuto.
      const chaveChegada = `${sala.id}:${userId}`;
      if (Date.now() - (ultimaChegada.get(chaveChegada) ?? 0) > 15 * 60_000) {
        publicarMsg(sala, { tipo: 'sistema', texto: sortear(CHEGADAS).replace('{nome}', p.nome) });
      }
      ultimaChegada.set(chaveChegada, Date.now());
      // Mulher sempre é anunciada (é quem mais atrai a sala); casal, no máximo 1 a cada 2 min.
      const intervaloRecepcao = p.cat === 'mulher' ? 30_000 : 120_000;
      const jaRecebido = recebidosNaNoite.has(`${noite.chave}:${userId}`);
      if ((p.cat === 'casal' || p.cat === 'mulher') && !jaRecebido && falantes(sala).length >= 2 && Date.now() - (ultimaRecepcao.get(sala.id) ?? 0) > intervaloRecepcao) {
        recebidosNaNoite.add(`${noite.chave}:${userId}`);
        ultimaRecepcao.set(sala.id, Date.now());
        lola(sala, sortear(sala.homensLivres ? RECEBE_CUCKOLD : p.cat === 'casal' ? RECEBE_CASAL : RECEBE_MULHER).replace('{nome}', p.nome));
      }
      registrarEvento(sala.id, 'entrou', userId);
      avisarPresentes(sala);
      void deps.premiar(userId, 'casa_entrada', `casa-${noite.chave}`).catch(() => {});
    }
    res.json(await estadoPara(sala, userId, p));
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

  // Fila de espera (homem com a cota da sala cheia).
  app.post('/api/casa/:sala/fila', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    if (!(await noitePara(userId))) { res.status(403).json({ error: 'fechada' }); return; }
    sala.fila = sala.fila.filter((id) => id !== userId);
    if ((req.body as any)?.entrar !== false) sala.fila.push(userId);
    const pos = sala.fila.indexOf(userId);
    res.json({ ok: true, posicaoNaFila: pos >= 0 ? pos + 1 : null });
  });

  // Reservar lugar na próxima noite (ou na de hoje): aviso no celular quando abrir.
  app.post('/api/casa/reservar', deps.requireAuth, async (req, res) => {
    const userId = userDe(req);
    const prox = await proximaNoite();
    if (!prox.chave) { res.status(400).json({ error: 'sem_noite' }); return; }
    if ((req.body as any)?.reservar === false) {
      await db.run('DELETE FROM casa_reservas WHERE user_id = ? AND noite = ?', [userId, prox.chave]);
    } else {
      await db.run(
        db.mode === 'pg'
          ? 'INSERT INTO casa_reservas (user_id, noite, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
          : 'INSERT OR IGNORE INTO casa_reservas (user_id, noite, created_at) VALUES (?, ?, ?)',
        [userId, prox.chave, new Date().toISOString()],
      );
    }
    await db.persist();
    res.json({ ok: true, reservado: (req.body as any)?.reservar !== false, reservas: await totalReservas(prox.chave) });
  });

  // Foto ou vídeo ao vivo na sala, sempre de visualização única.
  app.post('/api/casa/:sala/midia', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    if (Date.now() - p.ultimaMidia < 3000) { res.status(429).json({ error: 'devagar' }); return; }
    const mediaId = String((req.body as any)?.mediaId || '');
    const m = (await db.queryOne('SELECT id, user_id, mime_type FROM media WHERE id = ? LIMIT 1', [mediaId])) as any;
    if (!m || String(m.user_id) !== userId) { res.status(404).json({ error: 'midia' }); return; }
    const tipo: 'foto' | 'video' = String(m.mime_type || '').startsWith('video/') ? 'video' : 'foto';
    const revelacao = !!(req.body as any)?.revelacao;
    const propostaId = String((req.body as any)?.propostaId || '');
    if (propostaId) {
      const pr = propostas.get(propostaId);
      if (!pr || pr.para !== userId || pr.status !== 'aceita') { res.status(410).json({ error: 'expirada', message: 'Esse desafio já acabou.' }); return; }
      propostas.delete(pr.id);
      p.ultimaMidia = Date.now();
      const autor = { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat };
      const rotulo = `😈 Desafio de ${pr.deNome} cumprido: ${pr.texto}`;
      if (pr.privado) publicarPrivado(sala, pr.de, { tipo: 'midia', autor, texto: `🤫 ${rotulo} (só pra você)`, midia: { tipo } }, String(m.id));
      else publicarMsg(sala, { tipo: 'midia', autor, texto: rotulo, midia: { tipo } }, String(m.id));
      await deps.creditar(userId, pr.tokens, 'casa_desafio_recebido', `casa-proposta-${pr.id}`);
      pontuar(userId, 10, 'desafio_sugerido');
      lola(sala, `✅ ${p.nome} cumpriu o desafio de ${pr.deNome} e levou ${pr.tokens} tokens 🔥${pr.privado ? ' (foi só pra quem pediu 🤫)' : ''}`);
      emitirPara(pr.de, 'casa.proposta.fim', { id: pr.id, cumprida: true, nome: p.nome, tokens: pr.tokens });
      liberarRevelacao(sala, p);
      res.json({ ok: true });
      return;
    }
    if (revelacao && p.revelarAte < Date.now()) {
      res.status(403).json({ error: 'sem_revelacao', message: 'A revelação fica liberada por 5 minutos depois de cumprir um desafio.' });
      return;
    }
    p.ultimaMidia = Date.now();
    p.ultimoPing = Date.now();
    const j = sala.jogo;
    // "Para todos verem": fica aberta na sala (quem assina vê quantas vezes quiser).
    // Desafios, duelos, relâmpago e revelação continuam de visualização única.
    const emJogo = (j?.tipo === 'foto' && j.alvoId === userId) || (j?.tipo === 'duelo' && (j.aId === userId || j.bId === userId) && j.fase === 'fotos') || j?.tipo === 'relampago';
    const livre = !!(req.body as any)?.livre && !revelacao && !emJogo;
    let rotulo = livre
      ? (tipo === 'video' ? '🎥 Vídeo para todos' : '📸 Foto para todos')
      : (tipo === 'video' ? '🎥 Vídeo de visualização única' : '📸 Foto de visualização única');
    if (revelacao) {
      rotulo = `👀 Revelação de ${p.nome}: ${PRECO_REVELACAO} tokens para abrir (vão para ${p.nome})`;
      p.revelarAte = 0;
    } else if (j?.tipo === 'foto' && j.alvoId === userId) rotulo = `📸 Desafio cumprido: ${j.tema.replace(`${p.nome}, `, '')}`;
    else if (j?.tipo === 'duelo' && (j.aId === userId || j.bId === userId) && j.fase === 'fotos') rotulo = `🔥 Foto do duelo (${j.tema})`;
    else if (j?.tipo === 'relampago') rotulo = `⚡ Relâmpago: ${tipo === 'video' ? 'vídeo' : 'foto'} de ${p.nome}`;
    publicarMsg(sala, {
      tipo: 'midia',
      autor: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat },
      texto: rotulo,
      midia: { tipo, ...(revelacao ? { preco: PRECO_REVELACAO } : {}), ...(livre ? { livre: true } : {}) },
    }, String(m.id));

    // Conta para o desafio da vez.
    if (!revelacao && j) {
      if (j.tipo === 'foto' && j.alvoId === userId) {
        lola(sala, `🔥 ${p.nome} cumpriu o desafio! +5 tokens. Abram (1 vez) e comentem 😈`);
        void deps.premiar(userId, 'casa_desafio', `casa-foto-${j.id}`).catch(() => {});
        pontuar(userId, 10, 'desafio_foto');
        liberarRevelacao(sala, p);
        await encerrarJogo(sala, 'fim');
      } else if (j.tipo === 'duelo' && j.fase === 'fotos' && (j.aId === userId || j.bId === userId) && !j.enviados.has(userId)) {
        j.enviados.add(userId);
        pontuar(userId, 5, 'duelo_participou');
        liberarRevelacao(sala, p);
        if (j.enviados.size === 2) {
          j.fase = 'votacao';
          j.fimEm = Date.now() + 120_000;
          lola(sala, `🗳️ As duas fotos chegaram! Abram (1 vez) e votem: ${j.aNome} ou ${j.bNome}? 2 minutos!`);
        }
        avisarJogo(sala);
      } else if (j.tipo === 'relampago' && !j.cumpriram.has(userId) && (j.quem === 'todos' || p.cat === 'casal')) {
        j.cumpriram.add(userId);
        pontuar(userId, 5, 'relampago_cumpriu');
        liberarRevelacao(sala, p);
        if (!j.vencedor) {
          j.vencedor = { id: userId, nome: p.nome };
          lola(sala, `⚡ ${p.nome} foi o primeiro! +10 tokens 🔥 Ainda dá tempo pros outros mostrarem que também têm coragem 😏`);
          void deps.premiar(userId, 'casa_relampago', `casa-relampago-${j.id}`).catch(() => {});
          pontuar(userId, 15, 'relampago_primeiro');
        }
        avisarJogo(sala);
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/midia/:msgId/ver', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required', message: 'Assine para ver as fotos e vídeos da Casa.' }); return; }
    const row = (await db.queryOne(
      `SELECT cm.id, cm.autor_id, cm.destino_id, med.filename, med.mime_type FROM casa_mensagens cm
         JOIN media med ON med.id = cm.media_id WHERE cm.id = ? AND cm.sala = ? LIMIT 1`,
      [String(req.params.msgId), sala.id],
    )) as any;
    if (!row || (row.destino_id && String(row.destino_id) !== userId)) { res.status(404).json({ error: 'not_found' }); return; }
    if (sala.mensagens.find((x) => x.id === String(row.id))?.midia?.livre) {
      res.json({ url: `/uploads/${String(row.filename)}`, mime: row.mime_type ? String(row.mime_type) : null, livre: true });
      return;
    }
    if (String(row.autor_id) === userId) { res.status(400).json({ error: 'propria', message: 'É de visualização única: nem quem enviou abre de novo.' }); return; }
    const ja = await db.queryOne('SELECT 1 AS x FROM casa_midia_vistas WHERE mensagem_id = ? AND user_id = ?', [String(row.id), userId]);
    if (ja) { res.status(410).json({ error: 'ja_vista', message: 'Você já abriu esta mídia.' }); return; }
    const naSala = sala.mensagens.find((x) => x.id === String(row.id));
    const preco = Number(naSala?.midia?.preco || 0);
    if (preco > 0) {
      const pagou = await deps.transferirTokens(userId, String(row.autor_id), preco, `casa-revelacao-${row.id}`);
      if (!pagou) { res.status(402).json({ error: 'insufficient_tokens', message: `A revelação custa ${preco} tokens. Ganhe tokens usando o site ou compre em Tokens.` }); return; }
    }
    await db.run('INSERT INTO casa_midia_vistas (mensagem_id, user_id, viewed_at) VALUES (?, ?, ?)', [String(row.id), userId, new Date().toISOString()]);
    await db.persist();
    res.json({ url: `/uploads/${String(row.filename)}`, mime: row.mime_type ? String(row.mime_type) : null });
  });

  // ─── Admin: tudo o que aconteceu na Casa, noite por noite ─────────────────
  app.get('/api/casa/admin/noites', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const noites = (await db.queryAll(
      `SELECT noite, COUNT(*) AS mensagens,
              SUM(CASE WHEN tipo = 'midia' THEN 1 ELSE 0 END) AS midias,
              COUNT(DISTINCT autor_id) AS falaram, MIN(created_at) AS inicio, MAX(created_at) AS fim
         FROM casa_mensagens GROUP BY noite ORDER BY noite DESC LIMIT 60`,
      [],
    )) as any[];
    const eventos = (await db.queryAll(
      `SELECT noite, COUNT(DISTINCT CASE WHEN tipo = 'entrou' THEN user_id END) AS pessoas,
              SUM(CASE WHEN tipo = 'cabine' THEN 1 ELSE 0 END) AS cabines
         FROM casa_eventos GROUP BY noite`,
      [],
    )) as any[];
    const porNoite = new Map(eventos.map((e) => [String(e.noite), e]));
    const reservas = (await db.queryAll('SELECT noite, COUNT(*) AS c FROM casa_reservas GROUP BY noite', [])) as any[];
    const resPorNoite = new Map(reservas.map((r) => [String(r.noite), Number(r.c || 0)]));
    res.json({
      noites: noites.map((n) => ({
        noite: String(n.noite),
        mensagens: Number(n.mensagens || 0),
        midias: Number(n.midias || 0),
        falaram: Number(n.falaram || 0),
        pessoas: Number(porNoite.get(String(n.noite))?.pessoas || 0),
        cabines: Number(porNoite.get(String(n.noite))?.cabines || 0),
        reservas: resPorNoite.get(String(n.noite)) ?? 0,
        inicio: n.inicio, fim: n.fim,
      })),
    });
  });

  app.get('/api/casa/admin/noites/:noite', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const noite = String(req.params.noite);
    const mensagens = (await db.queryAll(
      `SELECT cm.id, cm.sala, cm.tipo, cm.texto, cm.created_at, cm.autor_id, u.name AS autor_nome, u.gender AS autor_genero,
              (SELECT name FROM users d WHERE d.id = cm.destino_id) AS destino_nome,
              med.filename, med.mime_type,
              (SELECT COUNT(*) FROM casa_midia_vistas v WHERE v.mensagem_id = cm.id) AS vistas
         FROM casa_mensagens cm
         LEFT JOIN users u ON u.id = cm.autor_id
         LEFT JOIN media med ON med.id = cm.media_id
        WHERE cm.noite = ? ORDER BY cm.created_at ASC LIMIT 5000`,
      [noite],
    )) as any[];
    const cabines = (await db.queryAll(
      `SELECT e.created_at, a.name AS a_nome, b.name AS b_nome FROM casa_eventos e
         LEFT JOIN users a ON a.id = e.user_id LEFT JOIN users b ON b.id = e.outro_id
        WHERE e.noite = ? AND e.tipo = 'cabine' ORDER BY e.created_at ASC`,
      [noite],
    )) as any[];
    res.json({
      mensagens: mensagens.map((m) => ({
        id: String(m.id), sala: String(m.sala), tipo: String(m.tipo), criadoEm: String(m.created_at),
        texto: `${String(m.texto || '')}${m.destino_nome ? ` [privado para ${String(m.destino_nome)}]` : ''}`,
        autor: m.autor_id ? { id: String(m.autor_id), nome: String(m.autor_nome || 'conta excluída'), genero: m.autor_genero ? String(m.autor_genero) : '' } : null,
        midia: m.filename ? { url: `/uploads/${String(m.filename)}`, mime: String(m.mime_type || ''), vistas: Number(m.vistas || 0) } : null,
      })),
      cabines: cabines.map((c) => ({ criadoEm: String(c.created_at), a: String(c.a_nome || '?'), b: String(c.b_nome || '?') })),
    });
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
    const barrada = await bloqueioRapido(p.id, p.nome, texto, sala.nome);
    if (barrada) { res.status(400).json({ error: 'moderacao', message: barrada }); return; }
    const respondida = sala.mensagens.find((m) => m.id === String((req.body as any)?.respostaA || ''));
    const resposta = respondida && respondida.tipo !== 'sistema'
      ? { id: respondida.id, nome: respondida.autor?.nome ?? 'Lola', trecho: respondida.tipo === 'midia' ? (respondida.midia?.tipo === 'video' ? '🎥 vídeo' : '📸 foto') : respondida.texto.slice(0, 80) }
      : undefined;
    const publicada = publicarMsg(sala, { tipo: 'pessoa', autor: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat }, texto, ...(resposta ? { resposta } : {}) });
    moderarDepois(p.id, p.nome, texto, sala.nome, () => removerMsgDaSala(sala, publicada.id));
    if (respondida?.tipo === 'lola') void responderComoLola(sala, p, texto, respondida.texto, publicada.id);
    res.json({ ok: true });
  });

  // Reação na mensagem: tocar de novo no mesmo emoji tira a reação.
  app.post('/api/casa/:sala/reagir', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const p = sala?.presentes.get(userDe(req));
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    const emoji = String((req.body as any)?.emoji || '');
    const msg = sala.mensagens.find((m) => m.id === String((req.body as any)?.mensagemId || ''));
    if (!REACOES_DA_CASA.includes(emoji) || !msg || msg.tipo === 'sistema') { res.status(400).json({ error: 'reacao' }); return; }
    msg.reacoes ??= {};
    const lista = msg.reacoes[emoji] ?? [];
    msg.reacoes[emoji] = lista.includes(p.idPublico) ? lista.filter((x) => x !== p.idPublico) : [...lista, p.idPublico];
    if (msg.reacoes[emoji].length === 0) delete msg.reacoes[emoji];
    emitirParaSala(sala, 'casa.reacao', { sala: sala.id, mensagemId: msg.id, reacoes: msg.reacoes });
    const total = Object.values(msg.reacoes).reduce((n, ids) => n + ids.length, 0);
    if (total >= 3 && msg.tipo === 'pessoa' && msg.autor && !comentadas.has(msg.id) && Date.now() - (ultimoComentario.get(sala.id) ?? 0) > 60_000) {
      comentadas.add(msg.id);
      ultimoComentario.set(sala.id, Date.now());
      lola(sala, sortear(COMENTA_QUENTE).replace('{nome}', msg.autor.nome));
    }
    res.json({ ok: true, reacoes: msg.reacoes });
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
    } else if (j.tipo === 'foto') {
      if (j.alvoId !== userId || String(valor) !== 'passo') { res.status(400).json({ error: 'opcao' }); return; }
      lola(sala, `${p.nome} passou o desafio da foto 😏 Tudo bem, aqui ninguém é obrigado a nada.`);
      await encerrarJogo(sala, 'fim');
    } else if (j.tipo === 'duelo') {
      if (j.fase !== 'votacao') { res.status(409).json({ error: 'ainda_nao', message: 'A votação abre quando os dois mandarem a foto.' }); return; }
      if (userId === j.aId || userId === j.bId) { res.status(403).json({ error: 'parte', message: 'Quem está no duelo não vota 😉' }); return; }
      if (valor !== 'a' && valor !== 'b') { res.status(400).json({ error: 'opcao' }); return; }
      j.votos.set(userId, valor);
      avisarJogo(sala);
    } else if (j.tipo === 'relampago') {
      res.status(400).json({ error: 'use_a_camera' });
      return;
    } else if (j.tipo === 'match') {
      if (j.aId !== userId && j.bId !== userId) { res.status(403).json({ error: 'nao_e_sua_vez' }); return; }
      j.respostas.set(userId, valor === true || valor === 'sim');
      if (valor !== true && valor !== 'sim') {
        lola(sala, 'Não rolou desta vez 😉 Mas a noite é longa…');
        await encerrarJogo(sala, 'fim');
      } else if (j.respostas.get(j.aId) && j.respostas.get(j.bId)) {
        const pa = sala.presentes.get(j.aId);
        const pb = sala.presentes.get(j.bId);
        if (pa && pb && !(await bloqueados(pa.id, pb.id))) {
          criarCabine(sala, pa, pb);
          lola(sala, `🚪🔥 ${j.aNome} e ${j.bNome} foram pra cabine! Comportem-se… ou não 😈`);
        }
        await encerrarJogo(sala, 'fim');
      } else {
        avisarJogo(sala);
      }
    }
    res.json({ ok: true });
  });

  // Desafio sugerido: um perfil propõe a outro, valendo tokens.
  app.get('/api/casa/sugestoes-de-desafio', deps.requireAuth, async (_req, res) => {
    res.json({ sugestoes: SUGESTOES_DE_DESAFIO.map((x) => ({ texto: x.t, nivel: x.n })) });
  });

  app.post('/api/casa/:sala/propor', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const corpo = (req.body || {}) as { para?: string; texto?: string; tokens?: number; privado?: boolean };
    const alvo = sala ? acharPublico(sala, String(corpo.para || '')) : undefined;
    if (!sala || !p || !alvo || alvo.id === userId) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    if (alvo.pulseira === 'vermelha') { res.status(409).json({ error: 'so_olhando', message: `${alvo.nome} está de pulseira vermelha (só olhando hoje).` }); return; }
    const texto = String(corpo.texto || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (texto.length < 3) { res.status(400).json({ error: 'texto', message: 'Escreva o desafio.' }); return; }
    if (/https?:\/\/|www\.|wa\.me|t\.me/i.test(texto)) { res.status(400).json({ error: 'link', message: 'Sem links no desafio.' }); return; }
    const barradaProposta = await bloqueioRapido(userId, p.nome, texto, sala.nome);
    if (barradaProposta) { res.status(400).json({ error: 'moderacao', message: barradaProposta }); return; }
    const tokens = Math.round(Number(corpo.tokens || 0));
    if (!Number.isFinite(tokens) || tokens < 3 || tokens > 100) { res.status(400).json({ error: 'tokens', message: 'Ofereça de 3 a 100 tokens.' }); return; }
    const minhas = [...propostas.values()].filter((x) => x.de === userId);
    if (minhas.length >= 3) { res.status(429).json({ error: 'muitas', message: 'Você já tem 3 desafios esperando resposta.' }); return; }
    if (minhas.some((x) => x.para === alvo.id)) { res.status(409).json({ error: 'repetida', message: 'Você já tem um desafio esperando essa pessoa.' }); return; }
    if (await bloqueados(userId, alvo.id)) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    const id = randomUUID();
    const pago = await deps.debitar(userId, tokens, 'casa_desafio_reservado', `casa-proposta-${id}`);
    if (!pago) { res.status(402).json({ error: 'insufficient_tokens', message: `Você não tem ${tokens} tokens.` }); return; }
    const pr: Proposta = {
      id, de: userId, deNome: p.nome, para: alvo.id, paraNome: alvo.nome, sala: sala.id,
      texto, tokens, privado: !!corpo.privado, status: 'pendente', criadoEm: Date.now(), prazo: 0,
    };
    propostas.set(id, pr);
    registrarEvento(sala.id, 'proposta', userId, alvo.id);
    avisarSeFora(alvo.id, `😈 ${p.nome} te propôs um desafio na Casa!`, 'Vale tokens. Toque para ver e responder.');
    emitirPara(alvo.id, 'casa.proposta', {
      id, texto, tokens, privado: pr.privado, de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat },
    });
    res.json({ ok: true, id });
  });

  app.post('/api/casa/proposta/:id/responder', deps.requireAuth, async (req, res) => {
    const pr = propostas.get(String(req.params.id));
    const userId = userDe(req);
    if (!pr || pr.para !== userId || pr.status !== 'pendente') { res.status(410).json({ error: 'expirada', message: 'Esse desafio expirou.' }); return; }
    const sala = salas.get(pr.sala);
    if (!(req.body as any)?.aceitar) {
      await devolverProposta(pr, `${pr.paraNome} recusou desta vez: os tokens voltaram.`);
      res.json({ ok: true });
      return;
    }
    pr.status = 'aceita';
    pr.prazo = Date.now() + 5 * 60_000;
    emitirPara(pr.de, 'casa.proposta.aceita', { id: pr.id, nome: pr.paraNome });
    if (sala) {
      lola(sala, pr.privado
        ? `🤫🔥 ${pr.paraNome} aceitou um desafio secreto de ${pr.deNome} valendo ${pr.tokens} tokens… só ${pr.deNome} vai ver 😈`
        : `🔥 ${pr.paraNome} aceitou o desafio de ${pr.deNome}: "${pr.texto}" valendo ${pr.tokens} tokens! Câmera ligada 😈`);
    }
    res.json({ ok: true, prazo: new Date(pr.prazo).toISOString(), texto: pr.texto, tokens: pr.tokens, privado: pr.privado, deNome: pr.deNome });
  });

  app.get('/api/casa/ranking', deps.requireAuth, async (req, res) => {
    const periodo = String(req.query.periodo || 'noite') === 'mes' ? 'mes' : 'noite';
    const soCasais = String(req.query.cat || 'casal') === 'casal';
    let filtro = '';
    const params: unknown[] = [];
    if (periodo === 'noite') {
      let noite = chaveDaNoite;
      if (!noite) noite = String(((await db.queryOne('SELECT MAX(noite) AS n FROM casa_pontos', [])) as any)?.n || '');
      filtro = 'cp.noite = ?';
      params.push(noite);
    } else {
      const d = new Date();
      filtro = 'cp.created_at >= ?';
      params.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString());
    }
    const rows = (await db.queryAll(
      `SELECT cp.user_id, SUM(cp.pontos) AS pontos, u.name, u.gender,
              (SELECT filename FROM media WHERE user_id = u.id AND is_main = 1 AND is_private = 0 ORDER BY created_at DESC LIMIT 1) AS foto
         FROM casa_pontos cp JOIN users u ON u.id = cp.user_id
        WHERE ${filtro} ${soCasais ? "AND u.gender LIKE 'Casal%'" : ''}
        GROUP BY cp.user_id, u.name, u.gender, u.id
        ORDER BY pontos DESC LIMIT 20`,
      params,
    )) as any[];
    res.json({
      periodo,
      ranking: rows.map((r, i) => ({
        posicao: i + 1, id: String(r.user_id), nome: String(r.name || '?'), cat: categoria(r.gender),
        avatar: r.foto ? `/uploads/${r.foto}` : null, pontos: Number(r.pontos || 0),
      })),
    });
  });

  // Denunciar alguém da sala: vai para o Telegram do admin com as últimas mensagens da pessoa.
  const ultimaDenuncia = new Map<string, number>();
  app.post('/api/casa/:sala/denunciar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId) ?? null;
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    if (!sala || !alvo) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (Date.now() - (ultimaDenuncia.get(userId) ?? 0) < 60_000) { res.status(429).json({ error: 'devagar', message: 'Aguarde um minuto para denunciar de novo.' }); return; }
    ultimaDenuncia.set(userId, Date.now());
    contadoresDaNoite.denuncias++;
    const motivo = String((req.body as any)?.motivo || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'sem motivo escrito';
    const ultimas = sala.mensagens.filter((m) => m.autor?.id === alvo.idPublico).slice(-5).map((m) => `• ${m.texto}`).join('\n');
    const quem = ((await db.queryOne('SELECT name, email FROM users WHERE id = ?', [userId])) as any) ?? {};
    const denunciado = ((await db.queryOne('SELECT email FROM users WHERE id = ?', [alvo.id])) as any)?.email ?? '?';
    registrarEvento(sala.id, 'denuncia', userId, alvo.id);
    void deps.alertar(`🚩 A Casa — denúncia na sala ${sala.nome}\nDenunciado: ${alvo.nomeReal} (${denunciado})${alvo.nome !== alvo.nomeReal ? ` [aparece como ${alvo.nome}]` : ''}\nPor: ${quem.name ?? p?.nome ?? '?'} (${quem.email ?? '?'})\nMotivo: ${motivo}${ultimas ? `\nÚltimas mensagens:\n${ultimas}` : ''}`).catch(() => {});
    res.json({ ok: true });
  });

  // ─── Admin: painel ao vivo da Casa ─────────────────────────────────────────
  app.get('/api/casa/admin/ao-vivo', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const noite = await noiteAtual();
    const prox = await proximaNoite();
    const reservados = prox.chave
      ? ((await db.queryAll(
        `SELECT r.user_id, u.name, u.gender, r.created_at FROM casa_reservas r JOIN users u ON u.id = r.user_id
          WHERE r.noite = ? ORDER BY r.created_at DESC LIMIT 300`,
        [prox.chave],
      )) as any[])
      : [];
    // A lista de nomes é limitada a 300; o total e a divisão por perfil contam todas as reservas.
    const reservasPorPerfil: Record<Categoria, number> = { casal: 0, mulher: 0, homem: 0, outros: 0 };
    if (prox.chave) {
      const porGenero = (await db.queryAll(
        'SELECT u.gender, COUNT(*) AS c FROM casa_reservas r JOIN users u ON u.id = r.user_id WHERE r.noite = ? GROUP BY u.gender',
        [prox.chave],
      )) as any[];
      for (const g of porGenero) reservasPorPerfil[categoria(g.gender)] += Number(g.c || 0);
    }
    const totalReservas = Object.values(reservasPorPerfil).reduce((a, b) => a + b, 0);
    const nomeDe = async (id: string) => String(((await db.queryOne('SELECT name FROM users WHERE id = ?', [id])) as any)?.name || '?');
    const salasVivo = await Promise.all([...salas.values()].map(async (sl) => ({
      id: sl.id, nome: sl.nome, emoji: sl.emoji, anonima: sl.anonima,
      presentes: [...sl.presentes.values()].map((p) => ({
        id: p.id, idPublico: p.idPublico, nome: p.nomeReal, apelido: p.nome !== p.nomeReal ? p.nome : null, cat: p.cat,
        pulseira: p.pulseira, querBrincar: p.querBrincar, podeFalar: p.podeFalar, rei: ehRei(p.id), avisos: avisosDaNoite.get(p.id) ?? 0,
      })),
      espiando: sl.espiando.size,
      fila: await Promise.all(sl.fila.map(async (id) => ({ id, nome: await nomeDe(id) }))),
      jogo: sl.jogo ? { tipo: sl.jogo.tipo, texto: 'texto' in sl.jogo ? sl.jogo.texto : 'tema' in sl.jogo ? sl.jogo.tema : null } : null,
      mensagens: sl.mensagens.length,
    })));
    const expulsosHoje = await Promise.all([...expulsos.entries()].filter(([, n]) => n === chaveDaNoite).map(async ([id]) => ({ id, nome: await nomeDe(id) })));
    res.json({
      aberta: !!noite,
      forcada: !!noite?.forcada,
      teste: !!noite?.teste,
      convidadosTeste: noite?.teste ? (await modoTeste()).convidados : [],
      tema: noite ? TEMAS_DA_NOITE[noite.tema] : null,
      abertaAte: noite?.forcada ? new Date(await abertaAte()).toISOString() : null,
      proximaAbertura: prox.inicio,
      proximaNoite: prox.chave,
      totalReservas,
      reservasPorPerfil,
      reservas: reservados.map((r) => ({ id: String(r.user_id), nome: String(r.name || '?'), cat: categoria(r.gender), em: String(r.created_at) })),
      salas: salasVivo,
      cabines: [...cabines.values()].map((c) => ({
        id: c.id, sala: c.salaId, aberta: c.aberta, espectadores: c.espectadores.size, mensagens: c.mensagens.length,
        membros: [...c.membros.values()].map((m) => m.nome), pedidos: c.entradas.size,
      })),
      propostas: [...propostas.values()].map((p) => ({ de: p.deNome, para: p.paraNome, texto: p.texto, tokens: p.tokens, status: p.status, privado: p.privado })),
      expulsos: expulsosHoje,
      contadores: { ...contadoresDaNoite },
    });
  });

  // ─── Admin: a Casa como negócio (por noite) ───────────────────────────────
  // Faturamento = dinheiro que entrou de verdade: assinaturas e compras de
  // tokens feitas DURANTE a noite por quem entrou ou espiou a Casa. Tokens
  // gastos lá dentro (drinks, revelações, desafios) passam de um usuário para
  // outro: medem o movimento, não são faturamento.
  app.get('/api/casa/admin/negocio', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const noites = (await db.queryAll(
      `SELECT noite, MIN(created_at) AS inicio, MAX(created_at) AS fim FROM casa_eventos GROUP BY noite ORDER BY noite DESC LIMIT 30`, [],
    )) as any[];
    let assinaturas: Array<{ userId: string; valorCents: number; pagoEm: string }> = [];
    let extratoIndisponivel = false;
    try { assinaturas = await deps.assinaturasPagas(); } catch { extratoIndisponivel = true; }
    const resultado = [];
    for (const n of noites) {
      const noite = String(n.noite);
      const inicio = String(n.inicio);
      const fim = new Date(Date.parse(String(n.fim)) + 60 * 60_000).toISOString(); // 1h depois de fechar ainda conta
      const part = (await db.queryAll(
        `SELECT user_id, MAX(CASE WHEN tipo = 'entrou' THEN 1 ELSE 0 END) AS entrou, MAX(CASE WHEN tipo = 'espiou' THEN 1 ELSE 0 END) AS espiou
           FROM casa_eventos WHERE noite = ? AND user_id IS NOT NULL AND tipo IN ('entrou', 'espiou') GROUP BY user_id`,
        [noite],
      )) as any[];
      const ids = new Set(part.map((x) => String(x.user_id)));
      const soEspiaram = new Set(part.filter((x) => Number(x.espiou) === 1 && Number(x.entrou) === 0).map((x) => String(x.user_id)));
      const assinNaNoite = assinaturas.filter((a) => ids.has(a.userId) && a.pagoEm >= inicio && a.pagoEm <= fim);
      const convertidos = new Set(assinNaNoite.filter((a) => soEspiaram.has(a.userId)).map((a) => a.userId));
      const compras = ids.size === 0 ? [] : (await db.queryAll(
        `SELECT user_id, valor_cents, tokens FROM compras_tokens WHERE status = 'paga' AND pago_em >= ? AND pago_em <= ?`,
        [inicio, fim],
      ) as any[]).filter((c) => ids.has(String(c.user_id)));
      const tx = (await db.queryAll(
        `SELECT action_type, ref_id, points FROM token_transactions
          WHERE created_at >= ? AND created_at <= ? AND (action_type LIKE 'casa_%')`,
        [inicio, fim],
      )) as any[];
      const soma = (f: (t: any) => boolean) => tx.filter(f).reduce((s2, t) => s2 + Number(t.points || 0), 0);
      const conta = (f: (t: any) => boolean) => tx.filter(f).length;
      const ehDrink = (t: any) => t.action_type === 'casa_revelacao_paga' && String(t.ref_id || '').startsWith('casa-drink-');
      const ehRevelacao = (t: any) => t.action_type === 'casa_revelacao_paga' && String(t.ref_id || '').startsWith('casa-revelacao-');
      const m = (await db.queryOne(
        `SELECT COUNT(*) AS msgs, SUM(CASE WHEN tipo = 'midia' THEN 1 ELSE 0 END) AS midias, COUNT(DISTINCT autor_id) AS falaram FROM casa_mensagens WHERE noite = ?`,
        [noite],
      )) as any;
      const ev = (await db.queryOne(
        `SELECT SUM(CASE WHEN tipo = 'cabine' THEN 1 ELSE 0 END) AS cabines, SUM(CASE WHEN tipo = 'expulso' THEN 1 ELSE 0 END) AS expulsos,
                SUM(CASE WHEN tipo = 'denuncia' THEN 1 ELSE 0 END) AS denuncias FROM casa_eventos WHERE noite = ?`,
        [noite],
      )) as any;
      const dia = noite.replace('extra-', '');
      const cadastros = Number(((await db.queryOne(
        `SELECT COUNT(*) AS c FROM users WHERE origem_canal LIKE 'A Casa%' AND created_at >= ? AND created_at <= ?`,
        [inicio, fim],
      )) as any)?.c || 0);
      const pico = Number(((await db.queryOne('SELECT value FROM system_settings WHERE key = ?', [`casa_pico:${noite}`])) as any)?.value || 0);
      const receitaAssinaturas = assinNaNoite.reduce((s2, a) => s2 + a.valorCents, 0);
      const receitaTokens = compras.reduce((s2, c) => s2 + Number(c.valor_cents || 0), 0);
      resultado.push({
        noite, dia, extra: noite.startsWith('extra-'),
        pessoas: ids.size, entraram: ids.size - soEspiaram.size, soEspiaram: soEspiaram.size, pico,
        falaram: Number(m?.falaram || 0), mensagens: Number(m?.msgs || 0), midias: Number(m?.midias || 0),
        cabines: Number(ev?.cabines || 0), expulsos: Number(ev?.expulsos || 0), denuncias: Number(ev?.denuncias || 0),
        cadastrosPelaCasa: cadastros,
        receita: {
          assinaturasCents: receitaAssinaturas, assinaturas: assinNaNoite.length, convertidosDeEspiao: convertidos.size,
          tokensCents: receitaTokens, compras: compras.length, totalCents: receitaAssinaturas + receitaTokens,
        },
        tokens: {
          drinks: conta(ehDrink), drinksTokens: -soma(ehDrink),
          revelacoes: conta(ehRevelacao), revelacoesTokens: -soma(ehRevelacao),
          desafiosCumpridos: conta((t) => t.action_type === 'casa_desafio_recebido'), desafiosTokens: soma((t) => t.action_type === 'casa_desafio_recebido'),
          premiosDaCasa: soma((t) => ['casa_entrada', 'casa_quiz', 'casa_desafio', 'casa_duelo', 'casa_relampago'].includes(t.action_type)),
        },
      });
    }
    // Quem chegou ao site PELA Casa e quanto já pagou (desde sempre).
    const pelaCasa = (await db.queryAll("SELECT id FROM users WHERE origem_canal LIKE 'A Casa%'", [])) as any[];
    const idsPelaCasa = new Set(pelaCasa.map((u) => String(u.id)));
    const receitaPelaCasa = assinaturas.filter((a) => idsPelaCasa.has(a.userId)).reduce((s2, a) => s2 + a.valorCents, 0);
    res.json({ noites: resultado, extratoIndisponivel, cadastrosPelaCasa: idsPelaCasa.size, receitaDeQuemVeioPelaCasaCents: receitaPelaCasa });
  });

  // Admin: devolve a entrada de quem foi retirado nesta noite.
  app.post('/api/casa/admin/perdoar', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const id = String((req.body as any)?.userId || '');
    expulsos.delete(id);
    avisosDaNoite.delete(id);
    res.json({ ok: true });
  });

  // Admin: recado da Lola numa sala (ou em todas).
  app.post('/api/casa/admin/recado', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const texto = String((req.body as any)?.texto || '').trim().slice(0, 400);
    const alvo = String((req.body as any)?.sala || 'todas');
    if (!texto) { res.status(400).json({ error: 'texto' }); return; }
    if (!(await noiteAtual())) { res.status(409).json({ error: 'fechada', message: 'A Casa está fechada.' }); return; }
    let enviados = 0;
    for (const sl of salas.values()) if (alvo === 'todas' || alvo === sl.id) { lola(sl, texto); enviados++; }
    res.json({ ok: true, enviados });
  });

  // Admin: tira alguém da Casa direto do painel (pelo id real).
  app.post('/api/casa/admin/expulsar', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const id = String((req.body as any)?.userId || '');
    const nome = String(((await db.queryOne('SELECT name FROM users WHERE id = ?', [id])) as any)?.name || '');
    if (!nome) { res.status(404).json({ error: 'not_found' }); return; }
    await expulsar(id, nome, 'Retirado(a) pelo admin', null, 'painel');
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/expulsar', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const sala = salaDe(req);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    if (!sala || !alvo) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    await expulsar(alvo.id, alvo.nome, 'Retirado(a) pelo admin', null, sala.nome);
    res.json({ ok: true });
  });

  // Glory Hole: revelar quem é (só se a pessoa quiser).
  app.post('/api/casa/:sala/revelar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const p = sala?.presentes.get(userDe(req));
    if (!sala || !p || !sala.anonima) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (p.nome !== p.nomeReal) {
      const apelido = p.nome;
      p.nome = p.nomeReal;
      p.avatar = p.avatarReal;
      publicarMsg(sala, { tipo: 'sistema', texto: `🎭 ${apelido} se revelou: é ${p.nomeReal} 😈` });
      avisarPresentes(sala);
    }
    res.json({ ok: true });
  });

  // Glory Hole: bater na parede chama alguém sem dizer quem bateu.
  app.post('/api/casa/:sala/bater', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    if (!sala || !p || !alvo || alvo.id === userId) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    const ultimo = p.olhares.get(`bater:${alvo.id}`) ?? 0;
    if (Date.now() - ultimo < 3 * 60_000) { res.status(429).json({ error: 'devagar', message: 'Espere um pouco antes de bater de novo 😏' }); return; }
    if (await bloqueados(userId, alvo.id)) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    p.olhares.set(`bater:${alvo.id}`, Date.now());
    emitirPara(alvo.id, 'casa.batida', { de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat } });
    res.json({ ok: true });
  });

  // Pulseira da noite.
  app.post('/api/casa/:sala/pulseira', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const p = sala?.presentes.get(userDe(req));
    if (!sala || !p) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    const cor = String((req.body as any)?.cor || '') as Pulseira;
    if (!PULSEIRAS[cor]) { res.status(400).json({ error: 'cor' }); return; }
    const antes = p.pulseira;
    p.pulseira = cor;
    if (cor === 'vermelha') p.querBrincar = false;
    if (antes !== cor) publicarMsg(sala, { tipo: 'sistema', texto: `${p.nome} colocou a pulseira ${PULSEIRAS[cor]}` });
    avisarPresentes(sala);
    res.json({ ok: true, pulseira: cor });
  });

  // Olhar discreto: só a pessoa olhada fica sabendo. Olhares cruzados = sugestão de cabine.
  app.post('/api/casa/:sala/chamar-pra-sala', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    const destino = salas.get(String((req.body as any)?.destino || '') as SalaId);
    const noite = await noitePara(userId);
    if (!sala || !p || !alvo || !destino || !noite) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!p.podeFalar || (p.cat !== 'casal' && p.cat !== 'mulher')) { res.status(403).json({ error: 'so_casal_ou_mulher', message: 'Só casais e mulheres chamam solteiros para outra sala.' }); return; }
    if (alvo.cat !== 'homem') { res.status(400).json({ error: 'so_solteiro', message: 'Casais e mulheres entram nas salas sem fila.' }); return; }
    if (sala.anonima || destino.anonima || destino.semHomens) { res.status(400).json({ error: 'destino', message: 'Essa sala não aceita convite.' }); return; }
    if (trancada(destino, noite)) { res.status(409).json({ error: 'trancada', message: `O ${destino.nome} ainda não abriu.` }); return; }
    if (await bloqueados(userId, alvo.id)) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    convitesDeSala.set(alvo.id, { sala: destino.id, ate: Date.now() + 5 * 60_000 });
    emitirPara(alvo.id, 'casa.convite.sala', { de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat }, sala: destino.id, nome: `${destino.emoji} ${destino.nome}` });
    avisarSeFora(alvo.id, `🎟️ ${p.nome} te chamou para o ${destino.nome}!`, 'Você entra sem fila nos próximos 5 minutos 😈');
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/olhar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    const paraId = alvo?.id ?? '';
    if (!sala || !p || !alvo || paraId === userId) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    const ultimo = p.olhares.get(paraId) ?? 0;
    if (Date.now() - ultimo < 10 * 60_000) { res.json({ ok: true, repetido: true }); return; }
    if (await bloqueados(userId, paraId)) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    p.olhares.set(paraId, Date.now());
    const devolveu = (alvo.olhares.get(userId) ?? 0) > Date.now() - 20 * 60_000;
    if (devolveu) {
      emitirPara(paraId, 'casa.olhares', { com: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat } });
      emitirPara(userId, 'casa.olhares', { com: { id: alvo.idPublico, nome: alvo.nome, avatar: alvo.avatar, cat: alvo.cat } });
    } else {
      emitirPara(paraId, 'casa.olhar', { de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat, pulseira: p.pulseira } });
    }
    res.json({ ok: true, cruzados: devolveu });
  });

  // Bar: pagar um drink (os tokens vão para quem recebe). A sala vê; quem recebe pode brindar de volta.
  app.post('/api/casa/:sala/drink', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    const paraId = alvo?.id ?? '';
    const drinkId = String((req.body as any)?.drink || '');
    const drink = Object.prototype.hasOwnProperty.call(DRINKS, drinkId) ? DRINKS[drinkId] : undefined;
    if (!sala || !p || !alvo || paraId === userId) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!drink) { res.status(400).json({ error: 'drink' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    // Recado opcional junto com o drink: só quem recebe lê.
    const recado = String((req.body as any)?.mensagem || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (recado && /https?:\/\/|www\.|\.com\b|\.net\b|wa\.me|t\.me/i.test(recado)) { res.status(400).json({ error: 'link', message: 'Sem links no recado do drink.' }); return; }
    if (recado) {
      const barrada = await bloqueioRapido(userId, p.nome, recado, sala.nome);
      if (barrada) { res.status(400).json({ error: 'moderacao', message: barrada }); return; }
    }
    if (await bloqueados(userId, paraId)) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    const pagou = await deps.transferirTokens(userId, paraId, drink.tokens, `casa-drink-${randomUUID()}`);
    if (!pagou) { res.status(402).json({ error: 'insufficient_tokens', message: `${drink.nome[0].toUpperCase()}${drink.nome.slice(1)} custa ${drink.tokens} tokens.` }); return; }
    publicarMsg(sala, { tipo: 'sistema', texto: `${drink.emoji} ${p.nome} pagou ${drink.nome} pra ${alvo.nome} 😏`, efeito: drinkId });
    registrarEvento(sala.id, 'drink', userId, paraId);
    pontuar(paraId, 2, 'drink_recebido');
    emitirPara(paraId, 'casa.drink', { de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat }, drink: `${drink.emoji} ${drink.nome}`, tokens: drink.tokens, ...(recado ? { mensagem: recado } : {}) });
    avisarSeFora(paraId, `${drink.emoji} ${p.nome} te pagou ${drink.nome} na Casa!`, `+${drink.tokens} tokens pra você. Vai agradecer? 😏`);
    res.json({ ok: true });
  });

  app.post('/api/casa/:sala/brindar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    if (!sala || !p || !alvo) { res.status(404).json({ error: 'fora_da_sala' }); return; }
    publicarMsg(sala, { tipo: 'sistema', texto: `🥂 ${p.nome} brindou com ${alvo.nome}… esses dois vão longe 🔥`, efeito: 'brinde' });
    emitirPara(alvo.id, 'casa.brinde', { de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat } });
    // Drink + brinde de volta: a Lola sugere a cabine a quem brindou.
    emitirPara(userId, 'casa.olhares', { com: { id: alvo.idPublico, nome: alvo.nome, avatar: alvo.avatar, cat: alvo.cat }, motivo: 'brinde' });
    res.json({ ok: true });
  });

  // Convite para a cabine (a qualquer momento, para alguém da mesma sala).
  app.post('/api/casa/:sala/convidar', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    const p = sala?.presentes.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    const paraId = alvo?.id ?? '';
    if (!sala || !p || !alvo || paraId === userId) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está mais na sala.' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required' }); return; }
    if (Date.now() - p.ultimoConvite < 45_000) { res.status(429).json({ error: 'devagar', message: 'Espere um pouquinho antes de chamar de novo.' }); return; }
    if (await bloqueados(userId, paraId)) { res.status(404).json({ error: 'fora_da_sala', message: 'Essa pessoa não está disponível.' }); return; }
    p.ultimoConvite = Date.now();
    const id = randomUUID();
    convites.set(id, { de: userId, para: paraId, sala: sala.id, criadoEm: Date.now() });
    emitirPara(paraId, 'casa.convite', { id, de: { id: p.idPublico, nome: p.nome, avatar: p.avatar, cat: p.cat }, sala: sala.nome });
    avisarSeFora(paraId, `🚪 ${p.nome} te chamou pra cabine na Casa!`, 'Toque para abrir a Casa e responder.');
    res.json({ ok: true, id });
  });

  // Push quando a pessoa recebe algo da Casa mas não está com ela aberta (fora de todas as salas).
  // Só chega para quem ligou as notificações no perfil (inscrição de push).
  const avisarSeFora = (userId: string, title: string, body: string) => {
    const agora = Date.now();
    for (const sl of salas.values()) {
      const p = sl.presentes.get(userId);
      if (p && agora - p.ultimoPing < 45_000) return;
      const e = sl.espiando.get(userId);
      if (e && agora - e < 45_000) return;
    }
    void deps.push(userId, { title, body, url: '/casa', tag: `casa-${userId}` }).catch(() => {});
  };
  const ultimaSaudacao = new Map<string, number>();
  // A Lola anuncia cada casal/mulher só na primeira entrada da noite (não a cada troca de sala).
  const recebidosNaNoite = new Set<string>();
  const ultimaChegada = new Map<string, number>();

  // ─── Lola mais provocadora: memória da noite ────────────────────────────────
  const ultimaRecepcao = new Map<string, number>();
  const ultimoComentario = new Map<string, number>();
  const ultimaProvocacao = new Map<string, number>();
  const comentadas = new Set<string>();
  const rankingsAnunciados = new Set<string>();
  const provocarQuieto = (sala: Sala, agora: number) => {
    if (sala.anonima || falantes(sala).length < 2) return;
    if (agora - (ultimaProvocacao.get(sala.id) ?? 0) < 10 * 60_000) return;
    // Quieto: está há mais de 3 min na sala e não fala há mais de 8 min.
    const quietos = [...sala.presentes.values()].filter((x) => x.podeFalar && agora - x.ultimaMsg > 8 * 60_000 && agora - x.entrouEm > 3 * 60_000);
    if (quietos.length === 0) return;
    const alvo = sortear(quietos);
    ultimaProvocacao.set(sala.id, agora);
    lola(sala, sortear(PROVOCA_QUIETO[alvo.cat]).replace('{nome}', alvo.nome));
  };
  // 4) Ranking da noite a cada 30 min: casal mais desejado e mensagem mais quente (pelas reações).
  const anunciarRanking = (chaveNoite: string) => {
    const agoraMin = Math.floor(Date.now() / 60_000);
    const slot = Math.floor(agoraMin / 30);
    if (agoraMin % 30 > 2) return;
    const chave = `${chaveNoite}:${slot}`;
    if (rankingsAnunciados.has(chave)) return;
    rankingsAnunciados.add(chave);
    let maisQuente: { nome: string; texto: string; n: number } | null = null;
    const desejo = new Map<string, { nome: string; n: number }>();
    for (const sl of salas.values()) {
      if (sl.anonima) continue;
      for (const m of sl.mensagens) {
        const n = Object.values(m.reacoes ?? {}).reduce((a, ids) => a + ids.length, 0);
        if (!n || !m.autor) continue;
        if (m.tipo === 'pessoa' && (!maisQuente || n > maisQuente.n)) maisQuente = { nome: m.autor.nome, texto: m.texto.slice(0, 60), n };
        if (m.autor.cat === 'casal') {
          const d = desejo.get(m.autor.id) ?? { nome: m.autor.nome, n: 0 };
          d.n += n;
          desejo.set(m.autor.id, d);
        }
      }
    }
    const casal = [...desejo.values()].sort((a, b) => b.n - a.n)[0];
    if (!maisQuente && !casal) return;
    const linhas = ['🏆 RANKING DA NOITE (pelas reações de vocês)'];
    if (casal) linhas.push(`💑 Casal mais desejado: ${casal.nome} (${casal.n} reações) 🔥`);
    if (maisQuente) linhas.push(`💬 Mensagem mais quente: ${maisQuente.nome} — "${maisQuente.texto}" (${maisQuente.n} reações)`);
    linhas.push('Reajam com 🔥😈💦 no que mexer com vocês: daqui a 30 min tem mais 😏');
    for (const sl of salas.values()) if (!sl.anonima && falantes(sl).length >= 2) lola(sl, linhas.join('\n'));
  };

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
    if (!(await noitePara(userDe(req))) && !(await souAdmin(req))) { res.json({ tocando: null }); return; }
    // Vinhetas da Lola entram entre as músicas: uma a cada 2 músicas, revezando.
    // A sequência é a mesma para todo mundo na noite, então a sincronia continua.
    const todas = (await lerPlaylist()).filter((f) => f.duracao > 0);
    // Abertura (21h) e fechamento (terminando à 1h) tocam só no horário certo.
    const noiteAgora = await noiteAtual();
    const agoraMs = Date.now();
    const vinhetaNaHora = (f: Faixa, inicioMs: number) => res.json({
      tocando: { id: f.id, titulo: '💋 Lola', artista: f.tipo === 'abertura' ? 'a Casa abriu' : 'a Casa vai fechar', url: urlDaFaixa(f), duracao: f.duracao, offset: Math.max(0, (agoraMs - inicioMs) / 1000), vinheta: true },
      proxima: null,
    });
    if (noiteAgora) {
      const inicioNoite = noiteAgora.forcada ? null : inicioDaNoite(noiteAgora.chave, noiteAgora.tema);
      const fimNoite = noiteAgora.forcada ? await abertaAte() : (inicioNoite as number) + (noiteAgora.tema === 'sabado' ? 3 : 4) * 3_600_000;
      const abertura = todas.find((f) => f.tipo === 'abertura');
      const fechamento = todas.find((f) => f.tipo === 'fechamento');
      if (abertura && inicioNoite && agoraMs >= inicioNoite && agoraMs < inicioNoite + abertura.duracao * 1000) { vinhetaNaHora(abertura, inicioNoite); return; }
      if (fechamento && agoraMs >= fimNoite - fechamento.duracao * 1000 && agoraMs < fimNoite) { vinhetaNaHora(fechamento, fimNoite - fechamento.duracao * 1000); return; }
    }
    // Cada noite tem a sua ordem (embaralhada pela data da noite): sexta e sábado
    // não repetem a mesma sequência, e todo mundo da mesma noite ouve igual.
    const semente = noiteAgora?.chave ?? new Date(agoraMs - 3 * 3_600_000).toISOString().slice(0, 10);
    const musicas = embaralharComSemente(todas.filter((f) => !f.tipo || f.tipo === 'musica'), semente);
    const vinhetas = embaralharComSemente(todas.filter((f) => f.tipo === 'vinheta'), `${semente}:lola`);
    let lista: Faixa[] = musicas;
    if (vinhetas.length > 0) {
      lista = [];
      let k = 0;
      musicas.forEach((m, idx) => {
        lista.push(m);
        if ((idx + 1) % 2 === 0) lista.push(vinhetas[k++ % vinhetas.length]);
      });
      // Sem música não tem rádio: a Lola não fica falando sem parar.
      if (musicas.length === 0) lista = [];
    }
    const total = lista.reduce((s, f) => s + f.duracao, 0);
    if (total <= 0) { res.json({ tocando: null }); return; }
    // Na noite normal a rádio começa do 1º item logo depois da abertura das 21h.
    const inicioNormal = noiteAgora && !noiteAgora.forcada ? inicioDaNoite(noiteAgora.chave, noiteAgora.tema) + (todas.find((f) => f.tipo === 'abertura')?.duracao ?? 0) * 1000 : null;
    const zero = inicioNormal && agoraMs >= inicioNormal ? inicioNormal : INICIO_DA_RADIO;
    let pos = ((agoraMs - zero) / 1000) % total;
    let i = 0;
    while (i < lista.length - 1 && pos >= lista[i].duracao) { pos -= lista[i].duracao; i += 1; }
    const f = lista[i];
    res.json({
      tocando: { id: f.id, titulo: f.tipo === 'vinheta' ? '💋 Lola' : f.titulo, artista: f.tipo === 'vinheta' ? 'anfitriã da Casa' : f.artista, url: urlDaFaixa(f), duracao: f.duracao, offset: pos, vinheta: f.tipo === 'vinheta' },
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

  // Vídeo de apresentação da página pública (/acasa): arquivos fixos no storage.
  const pastaApresentacao = path.join(deps.pastaMusicas, '..', 'casa-apresentacao');
  app.get('/api/casa/apresentacao/:arquivo', (req, res) => {
    const nome = String(req.params.arquivo);
    if (!['video.mp4', 'capa.jpg', 'capa.png'].includes(nome)) { res.status(404).end(); return; }
    const caminho = path.join(pastaApresentacao, nome);
    if (!existsSync(caminho)) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'public, max-age=86400');
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
      tipo: (['vinheta', 'abertura', 'fechamento'] as const).find((x) => x === corpo.tipo) ?? 'musica',
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

  // Trocar o tipo de um áudio (música, vinheta, abertura, fechamento).
  app.post('/api/casa/admin/playlist/:id/tipo', deps.requireAuth, async (req, res) => {
    if (!(await souAdmin(req))) { res.status(403).json({ error: 'forbidden' }); return; }
    const tipo = (['musica', 'vinheta', 'abertura', 'fechamento'] as const).find((x) => x === (req.body as any)?.tipo);
    if (!tipo) { res.status(400).json({ error: 'tipo' }); return; }
    const lista = await lerPlaylist();
    const f = lista.find((x) => x.id === req.params.id);
    if (!f) { res.status(404).json({ error: 'not_found' }); return; }
    f.tipo = tipo;
    await salvarPlaylist(lista);
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
    if (!sala || !de || !eu || (await bloqueados(c.de, userId))) { res.status(409).json({ error: 'indisponivel', message: 'A pessoa saiu da sala.' }); return; }
    const cab = criarCabine(sala, de, eu);
    lola(sala, `🚪 ${de.nome} e ${eu.nome} foram pra cabine 🔥`);
    res.json({ ok: true, cabineId: cab.id, com: de.nome });
  });

  // ─── Rotas das cabines ─────────────────────────────────────────────────────
  const cabineDe = (req: express.Request) => cabines.get(String(req.params.id)) ?? null;

  // Cabines com porta aberta na sala (para espiar) e as minhas.
  app.get('/api/casa/:sala/cabines', deps.requireAuth, async (req, res) => {
    const sala = salaDe(req);
    const userId = userDe(req);
    if (!sala) { res.status(404).json({ error: 'not_found' }); return; }
    const lista = [...cabines.values()].filter((c) => c.salaId === sala.id);
    res.json({
      cabines: lista.map((c) => ({
        id: c.id, aberta: c.aberta, souMembro: c.membros.has(userId), espectadores: c.espectadores.size,
        membros: [...c.membros.values()].map((m) => ({ id: m.idPublico, nome: m.nome, avatar: m.avatar, cat: m.cat })),
      })),
    });
  });

  app.post('/api/casa/cabine/:id/estado', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c || (!c.membros.has(userId) && !c.espectadores.has(userId))) { res.status(404).json({ error: 'fora' }); return; }
    if (c.espectadores.has(userId)) c.espectadores.set(userId, Date.now());
    res.json({ cabine: cabinePublica(c, userId) });
  });

  app.post('/api/casa/cabine/:id/espiar', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const sala = c ? salas.get(c.salaId) : null;
    const p = sala?.presentes.get(userId);
    if (!c || !p) { res.status(404).json({ error: 'fora', message: 'Essa cabine fechou.' }); return; }
    if (!p.podeFalar) { res.status(403).json({ error: 'premium_required', message: 'Assine para espiar as cabines.' }); return; }
    if (!c.aberta && !c.membros.has(userId)) { res.status(403).json({ error: 'porta_fechada', message: 'A porta fechou 🔒' }); return; }
    for (const m of c.membros.keys()) if (await bloqueados(userId, m)) { res.status(404).json({ error: 'fora' }); return; }
    if (!c.membros.has(userId) && !c.espectadores.has(userId)) {
      c.espectadores.set(userId, Date.now());
      msgCabine(c, { tipo: 'sistema', texto: `👀 ${p.nome} está espiando pela porta` });
      avisarCabine(c);
    }
    res.json({ cabine: cabinePublica(c, userId) });
  });

  app.post('/api/casa/cabine/:id/mensagem', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const m = c?.membros.get(userId);
    if (!c || !m) { res.status(403).json({ error: 'so_quem_esta_dentro', message: 'Só quem está na cabine fala. Peça para participar 😉' }); return; }
    const texto = String((req.body as any)?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!texto) { res.status(400).json({ error: 'texto_vazio' }); return; }
    if (/https?:\/\/|www\.|wa\.me|t\.me/i.test(texto)) { res.status(400).json({ error: 'link', message: 'Sem links na cabine.' }); return; }
    const barrada = await bloqueioRapido(userId, m.nome, texto, 'cabine');
    if (barrada) { res.status(400).json({ error: 'moderacao', message: barrada }); return; }
    // Responder/comentar uma mensagem ou mídia da cabine (como no WhatsApp).
    const respondida = c.mensagens.find((x) => x.id === String((req.body as any)?.respostaA || ''));
    const resposta = respondida && respondida.tipo !== 'sistema'
      ? { id: respondida.id, nome: respondida.autor?.nome ?? 'Lola', trecho: respondida.tipo === 'midia' ? (respondida.midia?.tipo === 'video' ? '🎥 vídeo' : '📸 foto') : respondida.texto.slice(0, 80) }
      : undefined;
    const publicada = msgCabine(c, { tipo: 'pessoa', autor: { id: m.idPublico, nome: m.nome, avatar: m.avatar, cat: m.cat }, texto, ...(resposta ? { resposta } : {}) });
    moderarDepois(userId, m.nome, texto, 'cabine', () => {
      c.mensagens = c.mensagens.filter((x) => x.id !== publicada.id);
      for (const id of [...c.membros.keys(), ...c.espectadores.keys()]) emitirPara(id, 'casa.cabine.mensagem.removida', { cabineId: c.id, id: publicada.id });
    });
    res.json({ ok: true });
  });

  app.post('/api/casa/cabine/:id/midia', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const m = c?.membros.get(userId);
    if (!c || !m) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const mediaId = String((req.body as any)?.mediaId || '');
    const med = (await db.queryOne('SELECT id, user_id, mime_type FROM media WHERE id = ? LIMIT 1', [mediaId])) as any;
    if (!med || String(med.user_id) !== userId) { res.status(404).json({ error: 'midia' }); return; }
    const tipo: 'foto' | 'video' = String(med.mime_type || '').startsWith('video/') ? 'video' : 'foto';
    msgCabine(c, {
      tipo: 'midia', autor: { id: m.idPublico, nome: m.nome, avatar: m.avatar, cat: m.cat },
      texto: tipo === 'video' ? '🎥 Vídeo de visualização única' : '📸 Foto de visualização única', midia: { tipo },
    }, String(med.id));
    res.json({ ok: true });
  });

  // Reação em mensagem ou mídia da cabine: tocar de novo no mesmo emoji tira.
  app.post('/api/casa/cabine/:id/reagir', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const m = c?.membros.get(userDe(req));
    if (!c || !m) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const emoji = String((req.body as any)?.emoji || '');
    const msg = c.mensagens.find((x) => x.id === String((req.body as any)?.mensagemId || ''));
    if (!REACOES_DA_CASA.includes(emoji) || !msg || msg.tipo === 'sistema') { res.status(400).json({ error: 'reacao' }); return; }
    msg.reacoes ??= {};
    const lista = msg.reacoes[emoji] ?? [];
    msg.reacoes[emoji] = lista.includes(m.idPublico) ? lista.filter((x) => x !== m.idPublico) : [...lista, m.idPublico];
    if (msg.reacoes[emoji].length === 0) delete msg.reacoes[emoji];
    for (const id of [...c.membros.keys(), ...c.espectadores.keys()]) emitirPara(id, 'casa.cabine.reacao', { cabineId: c.id, mensagemId: msg.id, reacoes: msg.reacoes });
    res.json({ ok: true, reacoes: msg.reacoes });
  });

  app.post('/api/casa/cabine/:id/midia/:msgId/ver', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c || (!c.membros.has(userId) && !c.espectadores.has(userId))) { res.status(404).json({ error: 'fora' }); return; }
    const row = (await db.queryOne(
      `SELECT cm.id, cm.autor_id, med.filename, med.mime_type FROM casa_mensagens cm JOIN media med ON med.id = cm.media_id
        WHERE cm.id = ? AND cm.sala = ? LIMIT 1`,
      [String(req.params.msgId), `cab:${c.id}`],
    )) as any;
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    if (String(row.autor_id) === userId) { res.status(400).json({ error: 'propria', message: 'É de visualização única: nem quem enviou abre de novo.' }); return; }
    if (await db.queryOne('SELECT 1 AS x FROM casa_midia_vistas WHERE mensagem_id = ? AND user_id = ?', [String(row.id), userId])) {
      res.status(410).json({ error: 'ja_vista', message: 'Você já abriu esta mídia.' });
      return;
    }
    await db.run('INSERT INTO casa_midia_vistas (mensagem_id, user_id, viewed_at) VALUES (?, ?, ?)', [String(row.id), userId, new Date().toISOString()]);
    res.json({ url: `/uploads/${String(row.filename)}`, mime: row.mime_type ? String(row.mime_type) : null });
  });

  // Porta: só abre quando TODOS que estão dentro concordam; qualquer um fecha.
  app.post('/api/casa/cabine/:id/porta', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const m = c?.membros.get(userId);
    if (!c || !m) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const abrir = !!(req.body as any)?.abrir;
    const estava = c.aberta;
    if (abrir) c.porta.add(userId); else c.porta.delete(userId);
    c.aberta = [...c.membros.keys()].every((id) => c.porta.has(id));
    if (!c.aberta && estava) {
      for (const id of c.espectadores.keys()) emitirPara(id, 'casa.cabine.fechou', { cabineId: c.id, porta: true });
      c.espectadores.clear();
      c.entradas.forEach((e, id) => { if (e.tipo === 'pedido') c.entradas.delete(id); });
      msgCabine(c, { tipo: 'sistema', texto: `🔒 ${m.nome} fechou a porta` });
    } else if (c.aberta && !estava) {
      msgCabine(c, { tipo: 'lola', texto: '👀 Porta aberta! Agora quem está na sala pode espiar… e pedir para entrar 😈' });
      const sala = salas.get(c.salaId);
      if (sala) lola(sala, `🚪👀 A cabine de ${[...c.membros.values()].map((x) => x.nome).join(', ')} está com a porta aberta… quem quiser, vai espiar 😈`);
    } else if (abrir) {
      msgCabine(c, { tipo: 'sistema', texto: `${m.nome} quer abrir a porta 👀 (${c.porta.size}/${c.membros.size})` });
      for (const id of c.membros.keys()) {
        if (!c.porta.has(id)) emitirPara(id, 'casa.cabine.decidir', { cabineId: c.id, tipo: 'porta', nome: m.nome });
      }
    } else if (!abrir && !estava) {
      msgCabine(c, { tipo: 'sistema', texto: `🔒 ${m.nome} prefere manter a porta fechada` });
    }
    avisarCabine(c);
    res.json({ ok: true, aberta: c.aberta });
  });

  const tentarEntrar = (c: Cabine, idReal: string) => {
    const e = c.entradas.get(idReal);
    if (!e) return;
    const todosAprovaram = [...c.membros.keys()].every((id) => e.aprovados.has(id));
    if (!todosAprovaram || !e.convidadoAceitou) return;
    if (c.membros.size >= MAX_NA_CABINE) { c.entradas.delete(idReal); return; }
    c.entradas.delete(idReal);
    c.espectadores.delete(idReal);
    c.membros.set(idReal, e.pessoa);
    c.porta.delete(idReal);
    conferirQuente(c);
    c.aberta = c.aberta && [...c.membros.keys()].every((id) => c.porta.has(id));
    msgCabine(c, { tipo: 'lola', texto: `🔥 ${e.pessoa.nome} entrou na cabine! Agora são ${c.membros.size} 😈` });
    const sala = salas.get(c.salaId);
    if (sala) lola(sala, `🔥 ${e.pessoa.nome} entrou na cabine de ${[...c.membros.values()].filter((x) => x.id !== idReal).map((x) => x.nome).join(', ')}…`);
    emitirPara(idReal, 'casa.cabine', { cabineId: c.id, com: 'a cabine' });
  };

  // Esquentar a cabine (sexo virtual guiado pela Lola): todos de dentro precisam topar.
  app.post('/api/casa/cabine/:id/esquentar', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const m = c?.membros.get(userId);
    if (!c || !m) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const quer = !!(req.body as any)?.quer;
    if (!quer) {
      c.topamEsquentar.delete(userId);
      if (c.quente) {
        c.quente = false;
        msgCabine(c, { tipo: 'sistema', texto: `🧊 ${m.nome} esfriou a cabine. Tudo bem, aqui o limite de cada um manda.` });
      } else if (c.topamEsquentar.size > 0) {
        // Recusou o convite pra transar: avisa com delicadeza quem chamou.
        msgCabine(c, { tipo: 'sistema', texto: `🧊 ${m.nome} prefere ir com calma por enquanto. Continuem no clima 😉` });
      }
      avisarCabine(c);
      res.json({ ok: true, quente: false });
      return;
    }
    c.topamEsquentar.add(userId);
    const todos = c.membros.size >= 2 && [...c.membros.keys()].every((id) => c.topamEsquentar.has(id));
    if (todos && !c.quente) {
      c.quente = true;
      c.quenteDesde = Date.now();
      msgCabine(c, { tipo: 'lola', texto: '🔥 Todos toparam: a cabine esquentou! Eu vou provocando vocês, e o nível sobe com o tempo… Qualquer um pode tocar em "Esfriar" quando quiser. Começando 😈' });
      provocar(c);
    } else if (!todos) {
      const n = [...c.membros.keys()].filter((id) => c.topamEsquentar.has(id)).length;
      msgCabine(c, { tipo: 'sistema', texto: `🔥 ${m.nome} quer esquentar a cabine (${n}/${c.membros.size})` });
      // Quem ainda não topou recebe o convite na hora (dentro da cabine abre o painel; fora, aviso).
      for (const id of c.membros.keys()) {
        if (!c.topamEsquentar.has(id)) emitirPara(id, 'casa.cabine.esquentar', { cabineId: c.id, nome: m.nome });
      }
    }
    avisarCabine(c);
    res.json({ ok: true, quente: c.quente });
  });

  // Ações da cabine: como numa casa de swing de verdade, do beijo à transa.
  // Etapa 0 sempre; preliminares só com a cabine esquentada (todos toparam);
  // transa quando o tesão da cabine passa de 40.
  const ACOES_CABINE: Record<string, { etapa: 0 | 1 | 2; calor: number; texto: string }> = {
    beijo: { etapa: 0, calor: 6, texto: '💋 {eu} puxou {alvo} e deu um beijo molhado, demorado' },
    pescoco: { etapa: 0, calor: 6, texto: '😮‍💨 {eu} mordeu o pescoço de {alvo} e sussurrou uma safadeza no ouvido' },
    mao: { etapa: 0, calor: 7, texto: '🤚 {eu} passou a mão no corpo inteiro de {alvo}, sem pressa' },
    roupa: { etapa: 0, calor: 9, texto: '👙 {eu} tirou a roupa de {alvo} peça por peça' },
    colo: { etapa: 1, calor: 10, texto: '🍑 {eu} sentou no colo de {alvo} e rebolou devagar' },
    tocar: { etapa: 1, calor: 11, texto: '🤤 {eu} tocou {alvo} bem onde mais gosta, até arrepiar' },
    chupar: { etapa: 1, calor: 13, texto: '👅 {eu} caiu de boca em {alvo} e não parou mais' },
    chupar_buceta: { etapa: 1, calor: 14, texto: '👅 {eu} chupou a buceta de {alvo} devagar, até as pernas tremerem' },
    chupar_pica: { etapa: 1, calor: 14, texto: '🍆 {eu} chupou a pica de {alvo} bem gostoso, olhando nos olhos' },
    cavalgar: { etapa: 2, calor: 15, texto: '🔥 {eu} subiu em {alvo} e cavalgou gostoso' },
    quatro: { etapa: 2, calor: 15, texto: '🍑 {eu} e {alvo} foram de quatro, com força' },
    papai: { etapa: 2, calor: 14, texto: '🛏️ {eu} deitou {alvo} na cama e foram no papai e mamãe, olho no olho' },
    gozar: { etapa: 2, calor: 20, texto: '💦 {eu} gozou gostoso com {alvo}' },
  };
  // Cenas de casa de swing, conforme quem está na cabine (um perfil de casal é o casal todo).
  // quem = categoria de quem age; alvo = categoria do outro; efeito = animação.
  type Cena = { etapa: 0 | 1 | 2; calor: number; quem: Categoria; alvo: Categoria; efeito: string; texto: string };
  const CENAS: Record<string, Cena> = {
    // Casal com casal: as esposas começam, depois os maridos, depois a troca.
    cc_esposas_beijo: { etapa: 0, calor: 8, quem: 'casal', alvo: 'casal', efeito: 'beijo', texto: '💋 A esposa de {eu} e a esposa de {alvo} começaram a se beijar, devagar, com os maridos olhando' },
    cc_esposas_peitos: { etapa: 1, calor: 11, quem: 'casal', alvo: 'casal', efeito: 'mao', texto: '🍒 As esposas de {eu} e {alvo} estão se pegando: mão nos peitos uma da outra, beijo de língua' },
    cc_marido_pega: { etapa: 1, calor: 12, quem: 'casal', alvo: 'casal', efeito: 'mao', texto: '🔥 O marido de {eu} puxou a esposa de {alvo} pela cintura e já está com a mão nela' },
    cc_troca: { etapa: 2, calor: 16, quem: 'casal', alvo: 'casal', efeito: 'champanhe', texto: '🔄 TROCA! {eu} e {alvo} trocaram de casal: cada esposa nos braços do marido da outra 😈' },
    cc_esposa_da: { etapa: 2, calor: 16, quem: 'casal', alvo: 'casal', efeito: 'quatro', texto: '💦 A esposa de {eu} está dando gostoso pro marido de {alvo}, olhando pro próprio marido' },
    cc_lado_a_lado: { etapa: 2, calor: 15, quem: 'casal', alvo: 'casal', efeito: 'papai', texto: '🛏️ {eu} e {alvo} transando lado a lado, um olhando o outro' },
    // Casal com solteiro: o marido libera, o single chega, os dois comem a esposa.
    ch_marido_libera: { etapa: 0, calor: 8, quem: 'casal', alvo: 'homem', efeito: 'pescoco', texto: '😈 O marido de {eu} chamou {alvo} pra perto e liberou a esposa pra ele' },
    hc_toca_esposa: { etapa: 0, calor: 8, quem: 'homem', alvo: 'casal', efeito: 'mao', texto: '🤚 {eu} chegou devagar e começou a tocar a esposa de {alvo}, e o marido deixando 😏' },
    ch_esposa_chupa: { etapa: 1, calor: 13, quem: 'casal', alvo: 'homem', efeito: 'chupar_pica', texto: '🍆 A esposa de {eu} colocou o pau de {alvo} pra fora e caiu de boca, olhando pro marido' },
    hc_esposa_chupa: { etapa: 1, calor: 13, quem: 'homem', alvo: 'casal', efeito: 'chupar_pica', texto: '🍆 {eu} colocou pra fora e a esposa de {alvo} caiu de boca, com o marido incentivando' },
    ch_dupla: { etapa: 2, calor: 17, quem: 'casal', alvo: 'homem', efeito: 'gozar', texto: '🔥 O marido de {eu} e {alvo} estão comendo a esposa juntos' },
    hc_come_esposa: { etapa: 2, calor: 16, quem: 'homem', alvo: 'casal', efeito: 'quatro', texto: '💦 {eu} está comendo a esposa de {alvo} enquanto o marido olha e incentiva' },
    ch_esposa_provoca: { etapa: 2, calor: 16, quem: 'casal', alvo: 'homem', efeito: 'cavalgar', texto: '😈 A esposa de {eu} está dando pra {alvo} e provocando o marido: "olha, amor…"' },
    // Casal com solteira: as mulheres se beijam, beijo triplo, oral entre elas, ela com o marido.
    mc_beija_esposa: { etapa: 0, calor: 8, quem: 'mulher', alvo: 'casal', efeito: 'beijo', texto: '💋 {eu} foi direto na esposa de {alvo} e as duas se beijaram' },
    cm_beija_solteira: { etapa: 0, calor: 8, quem: 'casal', alvo: 'mulher', efeito: 'beijo', texto: '💋 A esposa de {eu} puxou {alvo} e as duas se beijaram' },
    mc_beijo_triplo: { etapa: 0, calor: 9, quem: 'mulher', alvo: 'casal', efeito: 'beijo', texto: '💋💋 {eu} puxou o marido também: beijo triplo com {alvo}' },
    cm_beijo_triplo: { etapa: 0, calor: 9, quem: 'casal', alvo: 'mulher', efeito: 'beijo', texto: '💋💋 Beijo triplo: {eu} e {alvo}, os três juntos' },
    mc_chupa_esposa: { etapa: 1, calor: 13, quem: 'mulher', alvo: 'casal', efeito: 'chupar_buceta', texto: '👅 {eu} está chupando a esposa de {alvo}, com o marido assistindo' },
    cm_esposa_chupa: { etapa: 1, calor: 13, quem: 'casal', alvo: 'mulher', efeito: 'chupar_buceta', texto: '👅 A esposa de {eu} está chupando {alvo}' },
    mc_da_pro_marido: { etapa: 2, calor: 16, quem: 'mulher', alvo: 'casal', efeito: 'cavalgar', texto: '🔥 {eu} está dando pro marido de {alvo} e beijando a esposa' },
    cm_marido_come: { etapa: 2, calor: 16, quem: 'casal', alvo: 'mulher', efeito: 'quatro', texto: '🔥 O marido de {eu} está comendo {alvo} enquanto ela beija a esposa' },
    cm_vice_versa: { etapa: 2, calor: 16, quem: 'casal', alvo: 'mulher', efeito: 'chupar_buceta', texto: '🔄 Agora é a esposa de {eu} por cima de {alvo}, e o marido assistindo 😈' },
  };
  app.post('/api/casa/cabine/:id/acao', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const eu = c?.membros.get(userId);
    if (!c || !eu) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const id = String((req.body as any)?.acao || '');
    const cena = Object.prototype.hasOwnProperty.call(CENAS, id) ? CENAS[id] : undefined;
    const acao = cena ?? (Object.prototype.hasOwnProperty.call(ACOES_CABINE, id) ? ACOES_CABINE[id] : undefined);
    if (!acao) { res.status(400).json({ error: 'acao' }); return; }
    const outros = [...c.membros.values()].filter((m) => m.id !== userId);
    const alvo = outros.find((m) => m.idPublico === String((req.body as any)?.alvo || '')) ?? (outros.length === 1 ? outros[0] : undefined);
    if (!alvo) { res.status(400).json({ error: 'alvo', message: 'Escolha com quem.' }); return; }
    if (cena && (cena.quem !== eu.cat || cena.alvo !== alvo.cat)) { res.status(400).json({ error: 'cena', message: 'Essa cena não combina com quem está na cabine.' }); return; }
    // Preliminares e transa: liberam quando todos de dentro toparam (sem esperar a barra de tesão).
    if (acao.etapa >= 1 && !c.quente) { res.status(409).json({ error: 'fria', message: 'Para liberar, todos aqui dentro tocam em "Liberar" 🔥' }); return; }
    if (Date.now() - (c.ultimaAcao.get(userId) ?? 0) < 2500) { res.status(429).json({ error: 'devagar' }); return; }
    c.ultimaAcao.set(userId, Date.now());
    c.calor = Math.min(100, c.calor + acao.calor);
    msgCabine(c, {
      tipo: 'acao', efeito: cena ? cena.efeito : id,
      autor: { id: eu.idPublico, nome: eu.nome, avatar: eu.avatar, cat: eu.cat },
      texto: acao.texto.replace('{eu}', eu.nome).replace('{alvo}', alvo.nome),
    });
    if (!c.liberouTransa && c.calor >= 40) {
      c.liberouTransa = true;
      msgCabine(c, {
        tipo: 'lola',
        texto: c.quente
          ? '🔥 Essa cabine já está pegando fogo… agora é pra transar de verdade 😈'
          : '🔥 Tá pegando fogo aqui! Pra liberar as preliminares e a transa, todos tocam em "Liberar" no painel 🔥',
      });
    }
    if (id === 'gozar' && c.calor >= 100) {
      c.calor = 55;
      msgCabine(c, { tipo: 'lola', texto: '💦 Que cabine! Respira, bebe uma água… e se quiserem, tem segundo round 😏' });
    }
    avisarCabine(c);
    res.json({ ok: true, calor: c.calor });
  });

  app.post('/api/casa/cabine/:id/provocacao', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c || !c.membros.has(userId)) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    if (!c.quente) { res.status(409).json({ error: 'fria', message: 'Esquentem a cabine primeiro (todos precisam topar).' }); return; }
    if (Date.now() - c.ultimaProvocacao < 15_000) { res.status(429).json({ error: 'devagar', message: 'Calma… cumpram essa primeiro 😏' }); return; }
    const quem = c.membros.get(userId)!;
    const escrita = String((req.body as any)?.texto || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const escolha = String((req.body as any)?.escolha || '');
    if (escrita) {
      if (/https?:\/\/|www\.|wa\.me|t\.me/i.test(escrita)) { res.status(400).json({ error: 'link', message: 'Sem links na cabine.' }); return; }
      const barrada = await bloqueioRapido(userId, quem.nome, escrita, 'cabine');
      if (barrada) { res.status(400).json({ error: 'moderacao', message: barrada }); return; }
      c.ultimaProvocacao = Date.now();
      msgCabine(c, { tipo: 'lola', texto: `😈 Provocação de ${quem.nome}: ${escrita}` });
    } else if (/^[123]-\d+$/.test(escolha)) {
      const [nivel, i] = escolha.split('-').map(Number) as [1 | 2 | 3, number];
      const texto = PROVOCACOES_CABINE[nivel]?.[i];
      if (!texto) { res.status(400).json({ error: 'escolha' }); return; }
      c.ultimaProvocacao = Date.now();
      c.usadas.add(escolha);
      msgCabine(c, { tipo: 'lola', texto: `${'🔥'.repeat(nivel)} ${quem.nome} escolheu: ${texto}` });
    } else {
      provocar(c, (req.body as any)?.dado === true);
    }
    avisarCabine(c);
    res.json({ ok: true });
  });

  // Lista de provocações para escolher (todas as de nível 1 a 3).
  app.get('/api/casa/cabine/:id/provocacoes', deps.requireAuth, (req, res) => {
    const c = cabineDe(req);
    if (!c || !c.membros.has(userDe(req))) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    res.json({ niveis: ([1, 2, 3] as const).map((n) => ({ nivel: n, itens: PROVOCACOES_CABINE[n].map((t, i) => ({ id: `${n}-${i}`, texto: t, usada: c.usadas.has(`${n}-${i}`) })) })) });
  });

  // Quem espia pede para participar: todos de dentro precisam aprovar.
  app.post('/api/casa/cabine/:id/pedir', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const sala = c ? salas.get(c.salaId) : null;
    const p = sala?.presentes.get(userId);
    if (!c || !p || c.membros.has(userId)) { res.status(404).json({ error: 'fora' }); return; }
    for (const id of c.membros.keys()) if (await bloqueados(userId, id)) { res.status(404).json({ error: 'fora' }); return; }
    if (c.membros.size >= MAX_NA_CABINE) { res.status(409).json({ error: 'lotada', message: 'A cabine está cheia.' }); return; }
    if (!c.entradas.has(userId)) {
      c.entradas.set(userId, { tipo: 'pedido', pessoa: membroDe(p), aprovados: new Set(), convidadoAceitou: true, criadoEm: Date.now() });
      msgCabine(c, { tipo: 'sistema', texto: c.aberta ? `🙋 ${p.nome} pediu para participar` : `🚪 ${p.nome} bateu na porta e quer entrar` });
      for (const id of c.membros.keys()) {
        emitirPara(id, 'casa.cabine.pedido', { cabineId: c.id, nome: p.nome });
        emitirPara(id, 'casa.cabine.decidir', { cabineId: c.id, tipo: 'pedido', nome: p.nome, alvoNome: p.nome, alvoPublico: membroDe(p).idPublico });
      }
      avisarCabine(c);
    }
    res.json({ ok: true });
  });

  // Quem está dentro convida alguém da sala: os outros de dentro aprovam e o convidado aceita.
  app.post('/api/casa/cabine/:id/convidar', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const sala = c ? salas.get(c.salaId) : null;
    const m = c?.membros.get(userId);
    const alvo = sala ? acharPublico(sala, String((req.body as any)?.para || '')) : undefined;
    if (!c || !m || !alvo || c.membros.has(alvo.id)) { res.status(404).json({ error: 'fora', message: 'Essa pessoa não está na sala.' }); return; }
    if (!alvo.podeFalar) { res.status(409).json({ error: 'nao_pode', message: 'Essa pessoa está só espiando a Casa.' }); return; }
    if (c.membros.size >= MAX_NA_CABINE) { res.status(409).json({ error: 'lotada', message: 'A cabine está cheia.' }); return; }
    for (const id of c.membros.keys()) if (await bloqueados(alvo.id, id)) { res.status(404).json({ error: 'fora' }); return; }
    const existente = c.entradas.get(alvo.id);
    const e: Entrada = existente ?? { tipo: 'convite', pessoa: membroDe(alvo), aprovados: new Set(), convidadoAceitou: false, criadoEm: Date.now() };
    e.aprovados.add(userId);
    c.entradas.set(alvo.id, e);
    msgCabine(c, { tipo: 'sistema', texto: `${m.nome} quer convidar ${alvo.nome} (${e.aprovados.size}/${c.membros.size} aprovaram)` });
    for (const id of c.membros.keys()) {
      if (!e.aprovados.has(id)) emitirPara(id, 'casa.cabine.decidir', { cabineId: c.id, tipo: 'convite', nome: m.nome, alvoNome: alvo.nome, alvoPublico: e.pessoa.idPublico });
    }
    if ([...c.membros.keys()].every((id) => e.aprovados.has(id)) && !e.convidadoAceitou) {
      emitirPara(alvo.id, 'casa.cabine.convite', { cabineId: c.id, membros: [...c.membros.values()].map((x) => x.nome) });
      avisarSeFora(alvo.id, '🚪 Te chamaram pra uma cabine na Casa!', `${[...c.membros.values()].map((x) => x.nome).join(', ')} querem você lá dentro 😈`);
    }
    tentarEntrar(c, alvo.id);
    avisarCabine(c);
    res.json({ ok: true });
  });

  // Quem está dentro aprova (ou recusa) uma entrada.
  app.post('/api/casa/cabine/:id/entrada/:pessoa', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c || !c.membros.has(userId)) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const alvoId = [...c.entradas.entries()].find(([, e]) => e.pessoa.idPublico === String(req.params.pessoa))?.[0];
    const e = alvoId ? c.entradas.get(alvoId) : undefined;
    if (!alvoId || !e) { res.status(410).json({ error: 'expirou' }); return; }
    if (!(req.body as any)?.aprovar) {
      c.entradas.delete(alvoId);
      emitirPara(alvoId, 'casa.cabine.recusado', { cabineId: c.id });
      msgCabine(c, { tipo: 'sistema', texto: `A entrada de ${e.pessoa.nome} não foi aprovada` });
      avisarCabine(c);
      res.json({ ok: true });
      return;
    }
    e.aprovados.add(userId);
    if (e.tipo === 'convite' && [...c.membros.keys()].every((id) => e.aprovados.has(id)) && !e.convidadoAceitou) {
      emitirPara(alvoId, 'casa.cabine.convite', { cabineId: c.id, membros: [...c.membros.values()].map((x) => x.nome) });
    }
    tentarEntrar(c, alvoId);
    avisarCabine(c);
    res.json({ ok: true });
  });

  // Convidado responde ao convite de entrar na cabine.
  app.post('/api/casa/cabine/:id/convite/responder', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    const e = c?.entradas.get(userId);
    if (!c || !e) { res.status(410).json({ error: 'expirou', message: 'Esse convite expirou.' }); return; }
    if (!(req.body as any)?.aceitar) {
      c.entradas.delete(userId);
      msgCabine(c, { tipo: 'sistema', texto: `${e.pessoa.nome} não pôde entrar agora` });
      avisarCabine(c);
      res.json({ ok: true });
      return;
    }
    e.convidadoAceitou = true;
    tentarEntrar(c, userId);
    avisarCabine(c);
    res.json({ ok: true, cabine: c.membros.has(userId) ? cabinePublica(c, userId) : null });
  });

  app.post('/api/casa/cabine/:id/sair', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c) { res.json({ ok: true }); return; }
    if (c.espectadores.delete(userId)) { avisarCabine(c); res.json({ ok: true }); return; }
    const m = c.membros.get(userId);
    if (!m) { res.json({ ok: true }); return; }
    tirarDaCabine(c, userId, `${m.nome} saiu da cabine`);
    res.json({ ok: true });
  });

  // Continuar no chat depois que a Casa fechar (cabine a dois).
  app.post('/api/casa/cabine/:id/conversa', deps.requireAuth, async (req, res) => {
    const c = cabineDe(req);
    const userId = userDe(req);
    if (!c || !c.membros.has(userId)) { res.status(403).json({ error: 'so_quem_esta_dentro' }); return; }
    const outros = [...c.membros.keys()].filter((id) => id !== userId);
    if (outros.length !== 1) { res.status(409).json({ error: 'grupo', message: 'Para continuar no chat, a cabine precisa ser a dois.' }); return; }
    const conversa = await abrirCabine(userId, outros[0]);
    if (!conversa) { res.status(409).json({ error: 'indisponivel' }); return; }
    res.json({ ok: true, conversationId: conversa });
  });
}
