// ─── "Para você" da área de Vídeos ──────────────────────────────────────────
//
// Antes, a ordem padrão ("Aleatório") era ORDER BY random(): o vídeo que todo
// mundo assiste até o fim tinha a mesma chance de aparecer que o que todo mundo
// pula em 1 segundo. Agora, como no Instagram, o principal sinal é o TEMPO DE
// TELA: o player (Reels.tsx) manda quanto cada pessoa assistiu de cada vídeo,
// e isso vira a nota do vídeo.
//
// Nota = qualidade geral (quanto as pessoas assistem, quantas veem até o fim,
// curtidas e comentários) × afinidade de quem está vendo (autores e temas que
// ELE assiste mais) × novidade, com três cuidados:
//   • exploração: vídeo novo, com pouca gente medida, ganha um empurrão para
//     ter chance de provar que é bom (senão só os antigos subiriam);
//   • o que a pessoa já assistiu vai para depois de tudo que ela ainda não viu;
//   • um pouco de sorteio e no máximo um vídeo do mesmo autor a cada 4, para
//     a lista não ficar sempre igual nem virar o perfil de uma pessoa só.
//
// As médias usam "suavização": com poucos dados a nota fica perto da média
// geral e só se afasta conforme mais gente assiste. Um vídeo visto até o fim
// por 1 pessoa não passa na frente de um visto até o fim por 200.

import type { DbHandle } from './db.js';
import { queryAll } from './db.js';

/** Métricas de um vídeo somando todos que assistiram. */
export type EstatVideo = {
  pessoas: number;     // quantas pessoas tiveram tempo medido
  somaRazao: number;   // soma de (assistido / duração), cada pessoa limitada a 2 (rever conta)
  completos: number;   // quantas pessoas viram até o fim pelo menos uma vez
  curtidas: number;
  comentarios: number;
};

export type CandidatoVideo = {
  postId: string;
  autorId: string;
  criadoEm: string;
  temas: string[];
  tipo?: string;       // tipo de perfil do autor: casal, mulher, homem, trans...
};

/** O que sabemos do gosto de quem está vendo. */
export type GostoDoLeitor = {
  razaoPorPost: Map<string, number>;   // vídeos que ELE já assistiu (0..2)
  autores: Map<string, { soma: number; n: number }>;
  temas: Map<string, { soma: number; n: number }>;
  tipos: Map<string, { soma: number; n: number }>;  // tipo de perfil que ele assiste mais
  curtiuOuSegue: Set<string>;          // autores que ele segue ou de quem curtiu vídeo
};

/** Normaliza o gênero do autor para o tipo de perfil ("Casal (Ele/Ela)" → "casal"). */
export const tipoDePerfil = (genero: unknown) => {
  const g = String(genero || '').trim().toLowerCase();
  return g.startsWith('casal') ? 'casal' : g;
};

// Curtir um vídeo diz "gostei" tanto quanto assistir mais de uma vez.
const RAZAO_DA_CURTIDA = 1.2;

const MEDIA_RAZAO = 0.35;     // assistir ~35% é o "normal" de quem desliza
const MEDIA_COMPLETOS = 0.25;
const PESO_SUAVE = 5;         // equivale a 5 pessoas "médias" antes de qualquer dado
const MIN_PARA_PROVADO = 5;   // abaixo disso o vídeo ainda está em exploração

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Qualidade geral do vídeo, de 0 a ~1,3. */
export function qualidadeDoVideo(e: EstatVideo | undefined): number {
  const pessoas = e?.pessoas ?? 0;
  const razao = ((e?.somaRazao ?? 0) + MEDIA_RAZAO * PESO_SUAVE) / (pessoas + PESO_SUAVE);
  const completos = ((e?.completos ?? 0) + MEDIA_COMPLETOS * PESO_SUAVE) / (pessoas + PESO_SUAVE);
  // Curtida e comentário por pessoa medida. Vídeos antigos (de antes da medição)
  // têm curtidas e 0 pessoas: o denominador mínimo evita nota absurda.
  const interacoes = (e?.curtidas ?? 0) + 2 * (e?.comentarios ?? 0);
  const engaj = limitar(interacoes / (Math.max(pessoas, 3) + 10), 0, 1);
  const exploracao = pessoas < MIN_PARA_PROVADO ? 0.15 * (1 - pessoas / MIN_PARA_PROVADO) : 0;
  // Tempo médio assistido (quanto do vídeo + quantos até o fim) pesa 70%;
  // curtidas e comentários, 30%.
  return 0.45 * razao + 0.25 * completos + 0.3 * engaj + exploracao;
}

/** Afinidade (−0,3 a +0,6) a partir de uma média suavizada de razões assistidas. */
function afinidade(x: { soma: number; n: number } | undefined): number {
  if (!x || x.n === 0) return 0;
  const media = (x.soma + MEDIA_RAZAO * 2) / (x.n + 2);
  return limitar((media - MEDIA_RAZAO) * 1.5, -0.3, 0.6);
}

export function notaParaLeitor(
  c: CandidatoVideo,
  e: EstatVideo | undefined,
  gosto: GostoDoLeitor,
  agoraMs: number,
  sorteio: number,
): number {
  let nota = qualidadeDoVideo(e);
  nota *= 1 + afinidade(gosto.autores.get(c.autorId));
  if (gosto.curtiuOuSegue.has(c.autorId)) nota *= 1.25;
  if (c.temas.length) nota *= 1 + Math.max(...c.temas.map((t) => afinidade(gosto.temas.get(t)))) * 0.6;
  if (c.tipo) nota *= 1 + afinidade(gosto.tipos.get(c.tipo)) * 0.5;

  const idadeDias = Math.max(0, (agoraMs - Date.parse(c.criadoEm)) / 86_400_000) || 0;
  nota *= 1 + 0.6 * Math.exp(-idadeDias / 10);

  return nota * (0.8 + 0.4 * sorteio);
}

/** Ordena por nota sem repetir o mesmo autor dentro de uma janela de 4. */
export function ordenarParaLeitor(
  candidatos: CandidatoVideo[],
  estat: Map<string, EstatVideo>,
  gosto: GostoDoLeitor,
  agoraMs = Date.now(),
  aleatorio: () => number = Math.random,
): string[] {
  // O que a pessoa já assistiu vai inteiro para depois do que ainda é novo
  // para ela (continua aparecendo, só que no fim da fila).
  const comNota = candidatos
    .map((c) => ({ c, jaViu: gosto.razaoPorPost.has(c.postId), nota: notaParaLeitor(c, estat.get(c.postId), gosto, agoraMs, aleatorio()) }))
    .sort((a, b) => Number(a.jaViu) - Number(b.jaViu) || b.nota - a.nota);
  const JANELA = 4;
  const saida: CandidatoVideo[] = [];
  const espera: typeof comNota = [];
  const recentes = () => saida.slice(-JANELA + 1).map((x) => x.autorId);
  for (const item of comNota) {
    // Primeiro tenta encaixar quem ficou esperando por causa do autor repetido.
    for (let i = 0; i < espera.length; i++) {
      if (!recentes().includes(espera[i].c.autorId)) { saida.push(espera[i].c); espera.splice(i, 1); i = -1; }
    }
    if (recentes().includes(item.c.autorId)) espera.push(item);
    else saida.push(item.c);
  }
  for (const item of espera) saida.push(item.c);
  return saida.map((c) => c.postId);
}

// ─── Leitura do banco (com cache) ────────────────────────────────────────────

const RAZAO_MAX = 2;
let cacheEstat: { em: number; mapa: Map<string, EstatVideo> } | null = null;
let cachePostsComVideo: { em: number; ids: Set<string> } | null = null;
const DEZ_MIN = 10 * 60_000;

/** Ids dos posts que têm pelo menos um vídeo público (cache de 10 min). */
export async function postsComVideo(db: DbHandle): Promise<Set<string>> {
  if (cachePostsComVideo && Date.now() - cachePostsComVideo.em < DEZ_MIN) return cachePostsComVideo.ids;
  const videos = new Set(
    ((await queryAll(db, "SELECT id FROM media WHERE is_private = 0 AND mime_type LIKE 'video/%'", [])) as any[]).map((r) => String(r.id)),
  );
  const posts = (await queryAll(
    db,
    "SELECT id, media_ids_json FROM posts WHERE media_ids_json IS NOT NULL AND media_ids_json <> '[]' AND media_ids_json <> 'null'",
    [],
  )) as any[];
  const ids = new Set<string>();
  for (const p of posts) {
    let lista: unknown = null;
    try { lista = JSON.parse(String(p.media_ids_json)); } catch { /* ignora */ }
    if (Array.isArray(lista) && lista.some((m) => typeof m === 'string' && videos.has(m))) ids.add(String(p.id));
  }
  cachePostsComVideo = { em: Date.now(), ids };
  return ids;
}

/** Métricas de todos os vídeos (cache de 10 min). */
export async function estatisticasDosVideos(db: DbHandle, postIds: Set<string>): Promise<Map<string, EstatVideo>> {
  if (cacheEstat && Date.now() - cacheEstat.em < DEZ_MIN) return cacheEstat.mapa;
  const mapa = new Map<string, EstatVideo>();
  const pega = (id: string) => {
    let e = mapa.get(id);
    if (!e) { e = { pessoas: 0, somaRazao: 0, completos: 0, curtidas: 0, comentarios: 0 }; mapa.set(id, e); }
    return e;
  };
  const assistidos = (await queryAll(
    db,
    'SELECT post_id, assistido_ms, duracao_ms, completou FROM video_assistido WHERE duracao_ms > 0',
    [],
  )) as any[];
  for (const r of assistidos) {
    const e = pega(String(r.post_id));
    e.pessoas += 1;
    e.somaRazao += Math.min(RAZAO_MAX, Number(r.assistido_ms) / Number(r.duracao_ms));
    if (Number(r.completou) > 0) e.completos += 1;
  }
  const [curtidas, comentarios] = await Promise.all([
    queryAll(db, "SELECT target_id, COUNT(*) AS c FROM likes WHERE target_type = 'post' GROUP BY target_id", []) as Promise<any[]>,
    queryAll(db, "SELECT target_id, COUNT(*) AS c FROM comments WHERE target_type = 'post' GROUP BY target_id", []) as Promise<any[]>,
  ]);
  for (const r of curtidas) if (postIds.has(String(r.target_id))) pega(String(r.target_id)).curtidas = Number(r.c || 0);
  for (const r of comentarios) if (postIds.has(String(r.target_id))) pega(String(r.target_id)).comentarios = Number(r.c || 0);
  cacheEstat = { em: Date.now(), mapa };
  return mapa;
}

/** Gosto de quem está vendo: o que ele assistiu, de quem e de que tema. */
export async function gostoDoLeitor(
  db: DbHandle,
  userId: string,
  infoPost: Map<string, { autorId: string; temas: string[]; tipo?: string }>,
): Promise<GostoDoLeitor> {
  const gosto: GostoDoLeitor = { razaoPorPost: new Map(), autores: new Map(), temas: new Map(), tipos: new Map(), curtiuOuSegue: new Set() };
  const soma = (m: Map<string, { soma: number; n: number }>, k: string, v: number) => {
    const x = m.get(k) ?? { soma: 0, n: 0 };
    x.soma += v; x.n += 1; m.set(k, x);
  };
  const aprende = (info: { autorId: string; temas: string[]; tipo?: string }, razao: number) => {
    soma(gosto.autores, info.autorId, razao);
    for (const t of info.temas) soma(gosto.temas, t, razao);
    if (info.tipo) soma(gosto.tipos, info.tipo, razao);
  };

  const meus = (await queryAll(
    db,
    'SELECT post_id, assistido_ms, duracao_ms FROM video_assistido WHERE user_id = ? AND duracao_ms > 0',
    [userId],
  )) as any[];
  for (const r of meus) {
    const postId = String(r.post_id);
    const razao = Math.min(RAZAO_MAX, Number(r.assistido_ms) / Number(r.duracao_ms));
    gosto.razaoPorPost.set(postId, razao);
    const info = infoPost.get(postId);
    if (info) aprende(info, razao);
  }
  const curtidas = (await queryAll(
    db,
    "SELECT target_type, target_id FROM likes WHERE user_id = ? AND target_type IN ('user', 'post')",
    [userId],
  )) as any[];
  for (const r of curtidas) {
    if (r.target_type === 'user') gosto.curtiuOuSegue.add(String(r.target_id));
    else {
      const info = infoPost.get(String(r.target_id));
      if (!info) continue;
      gosto.curtiuOuSegue.add(info.autorId);
      aprende(info, RAZAO_DA_CURTIDA);
    }
  }
  return gosto;
}

/** Esquece o cache (testes). */
export function limparCacheParaVoce() {
  cacheEstat = null;
  cachePostsComVideo = null;
}
