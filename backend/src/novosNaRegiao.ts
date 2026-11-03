import type { DbHandle } from './db.js';

// ─── "Chegaram na sua região" ────────────────────────────────────────────────
// Perfis que entraram há pouco na cidade (ou num raio de 50 km) de quem já usa
// o app. Alimenta a aba do Chat, com o botão "Dar boas-vindas", e o aviso
// diário das 19h30. Decidido com o dono em 03/11/2026, com estas travas para
// não virar spam:
//   • aviso: 1 por dia no máximo e 4 por semana por pessoa, só para quem entrou
//     nos últimos 30 dias, e dá para desligar em Configurações › Notificações;
//   • só entram perfis com foto, ativos, que combinam com o que a pessoa
//     procura e sem bloqueio entre os dois;
//   • boas-vindas: 1 por perfil, 5 por dia para quem manda, e o perfil novo sai
//     da aba de todo mundo depois de receber 10 — senão uma mulher ou um casal
//     que acabou de entrar recebia dezenas de "oi" no primeiro dia.

export const DIAS_NA_ABA = 7;
export const RAIO_KM = 50;
export const MAX_BOAS_VINDAS_RECEBIDAS = 10;
export const MAX_BOAS_VINDAS_POR_DIA = 5;
export const MAX_AVISOS_POR_SEMANA = 4;

const DIA_MS = 24 * 60 * 60 * 1000;

export type PerfilNovo = {
  id: string;
  name: string;
  gender: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  createdAt: string;
  avatarFilename: string;
  boasVindasRecebidas: number;
};

export type Leitor = {
  id: string;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  lookingFor: string[];
};

function normalizar(v: unknown) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
}

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function lerLookingFor(json: unknown): string[] {
  try {
    const v = JSON.parse(String(json || '[]'));
    return Array.isArray(v) ? v.map((x) => String(x || '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Mesma regra de matchesLookingFor (app.ts): sem preferência, combina com todos. */
export function combinaComOQueProcura(lookingFor: string[], genero: string | null) {
  if (lookingFor.length === 0) return true;
  const g = String(genero || '').trim();
  if (!g) return true;
  return lookingFor.some((pref) => {
    const p = pref.trim();
    if (!p) return false;
    if (p.startsWith('Casal')) return g.startsWith('Casal');
    return p === g;
  });
}

export function leitorDaLinha(row: any): Leitor {
  return {
    id: String(row.id),
    city: row.city ?? null,
    state: row.state ?? null,
    lat: numero(row.lat),
    lon: numero(row.lon),
    lookingFor: lerLookingFor(row.looking_for_json),
  };
}

/** Está na região do leitor: mesma cidade/UF ou até RAIO_KM. */
export function naRegiao(leitor: Leitor, p: PerfilNovo): { mesmaCidade: boolean } | null {
  const mesmaCidade =
    !!leitor.city &&
    normalizar(leitor.city) === normalizar(p.city) &&
    (!leitor.state || !p.state || normalizar(leitor.state) === normalizar(p.state));
  if (mesmaCidade) return { mesmaCidade: true };
  if (leitor.lat != null && leitor.lon != null && p.lat != null && p.lon != null) {
    if (distanciaKm({ lat: leitor.lat, lon: leitor.lon }, { lat: p.lat, lon: p.lon }) <= RAIO_KM) return { mesmaCidade: false };
  }
  return null;
}

/** Perfis criados desde `desdeIso`, prontos para aparecer (com foto, ativos). */
export async function perfisNovosDesde(db: DbHandle, desdeIso: string): Promise<PerfilNovo[]> {
  const rows = (await db.queryAll(
    `SELECT u.id, u.name, u.gender, u.city, u.state, u.lat, u.lon, u.created_at,
            (SELECT m.filename FROM media m WHERE m.user_id = u.id AND m.is_main = 1 AND m.is_private = 0 ORDER BY m.created_at DESC LIMIT 1) AS avatar_filename,
            (SELECT COUNT(*) FROM boas_vindas b WHERE b.to_user_id = u.id) AS boas_vindas
       FROM users u
      WHERE u.created_at >= ?
        AND u.deleted_at IS NULL
        AND COALESCE(u.is_banned, 0) = 0
        AND COALESCE(u.is_deactivated, 0) = 0
        AND COALESCE(u.is_admin, 0) = 0
        AND COALESCE(u.is_showcase, 0) = 0
      ORDER BY u.created_at DESC
      LIMIT 3000`,
    [desdeIso]
  )) as any[];
  return rows
    .filter((r) => r.avatar_filename)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name || ''),
      gender: r.gender ?? null,
      city: r.city ?? null,
      state: r.state ?? null,
      lat: numero(r.lat),
      lon: numero(r.lon),
      createdAt: String(r.created_at),
      avatarFilename: String(r.avatar_filename),
      boasVindasRecebidas: Number(r.boas_vindas || 0),
    }));
}

/** Pares bloqueados (nos dois sentidos) que envolvem algum destes ids. */
export async function bloqueiosEntre(db: DbHandle, ids: string[]): Promise<Set<string>> {
  const pares = new Set<string>();
  if (ids.length === 0) return pares;
  for (let i = 0; i < ids.length; i += 500) {
    const lote = ids.slice(i, i + 500);
    const ph = lote.map(() => '?').join(',');
    const rows = (await db.queryAll(
      `SELECT blocker_user_id AS a, blocked_user_id AS b FROM blocks WHERE blocker_user_id IN (${ph}) OR blocked_user_id IN (${ph})`,
      [...lote, ...lote]
    )) as any[];
    for (const r of rows) {
      pares.add(`${r.a}|${r.b}`);
      pares.add(`${r.b}|${r.a}`);
    }
  }
  return pares;
}

/** O que o leitor deve ver: da região, combina com ele, sem bloqueio, sem lotar. */
export function novosParaLeitor(leitor: Leitor, perfis: PerfilNovo[], bloqueios: Set<string>) {
  const lista: Array<PerfilNovo & { mesmaCidade: boolean }> = [];
  for (const p of perfis) {
    if (p.id === leitor.id) continue;
    if (p.boasVindasRecebidas >= MAX_BOAS_VINDAS_RECEBIDAS) continue;
    if (bloqueios.has(`${leitor.id}|${p.id}`)) continue;
    if (!combinaComOQueProcura(leitor.lookingFor, p.gender)) continue;
    const r = naRegiao(leitor, p);
    if (!r) continue;
    lista.push({ ...p, mesmaCidade: r.mesmaCidade });
  }
  return lista;
}

/** null = pode; senão, o motivo para mostrar a quem tentou. */
export async function motivoSemBoasVindas(db: DbHandle, deId: string, paraId: string, agora = Date.now()): Promise<string | null> {
  const alvo = (await db.queryOne('SELECT created_at FROM users WHERE id = ? LIMIT 1', [paraId])) as any;
  // Um dia de folga: quem abriu a aba no 7º dia ainda consegue mandar.
  if (!alvo || Date.parse(String(alvo.created_at)) < agora - (DIAS_NA_ABA + 1) * DIA_MS) {
    return 'Esse perfil já não é mais novo por aqui. Mande uma mensagem normal pelo perfil dele.';
  }
  const ja = await db.queryOne('SELECT 1 AS x FROM boas_vindas WHERE from_user_id = ? AND to_user_id = ? LIMIT 1', [deId, paraId]);
  if (ja) return 'Você já deu boas-vindas a esse perfil.';
  const recebidas = (await db.queryOne('SELECT COUNT(*) AS c FROM boas_vindas WHERE to_user_id = ?', [paraId])) as any;
  if (Number(recebidas?.c || 0) >= MAX_BOAS_VINDAS_RECEBIDAS) {
    return 'Esse perfil já recebeu muitas boas-vindas. Que tal outro da lista?';
  }
  const hoje = (await db.queryOne('SELECT COUNT(*) AS c FROM boas_vindas WHERE from_user_id = ? AND created_at >= ?', [
    deId,
    new Date(agora - DIA_MS).toISOString(),
  ])) as any;
  if (Number(hoje?.c || 0) >= MAX_BOAS_VINDAS_POR_DIA) {
    return `Você já deu ${MAX_BOAS_VINDAS_POR_DIA} boas-vindas hoje. Amanhã libera mais.`;
  }
  return null;
}

export async function registrarBoasVindas(db: DbHandle, deId: string, paraId: string) {
  await db.run(
    db.mode === 'pg'
      ? 'INSERT INTO boas_vindas (from_user_id, to_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO boas_vindas (from_user_id, to_user_id, created_at) VALUES (?, ?, ?)',
    [deId, paraId, new Date().toISOString()]
  );
  await db.persist();
}

export async function boasVindasRestantesHoje(db: DbHandle, deId: string, agora = Date.now()) {
  const r = (await db.queryOne('SELECT COUNT(*) AS c FROM boas_vindas WHERE from_user_id = ? AND created_at >= ?', [
    deId,
    new Date(agora - DIA_MS).toISOString(),
  ])) as any;
  return Math.max(0, MAX_BOAS_VINDAS_POR_DIA - Number(r?.c || 0));
}

/** Texto do aviso: discreto na tela bloqueada (sem nome nem foto). */
export function textoDoAviso(n: number, cidade: string | null, todosDaCidade: boolean) {
  const onde = todosDaCidade && cidade ? `de ${cidade}` : 'perto de você';
  return n === 1
    ? `1 perfil novo ${onde} que combina com você. Quer ver?`
    : `${n} perfis novos ${onde} que combinam com você. Quer ver?`;
}
