// Ordem da fila de stories pelo interesse de quem assiste (11/11/2026).
//
// Nos últimos 30 dias, homens postaram 46% dos stories e tiveram em média 0,8
// curtida por story; mulheres 18 e casais 12. Um casal tinha que passar por
// vários stories de homens até chegar no que queria ver. Agora, dentro de cada
// grupo (fixados, não vistos, destaque pago, curtidos), vem primeiro quem é do
// MESMO ESTADO (a região parece mais cheia) e, dentro do estado, primeiro os
// tipos de perfil que a pessoa busca: mulheres e casais antes, homens por
// último, a não ser que quem assiste busque homens.
//
// É só ordenação: ninguém some da fila. O resto do desempate (cidade,
// distância, mais recente) continua vindo da ordem da consulta.

export type LinhaDeStory = {
  is_pinned?: number | string | null;
  is_showcase_autor?: number | string | null;
  is_viewed?: number | string | null;
  destaque_ate?: string | null;
  state?: string | null;
  gender?: string | null;
  user_id: string;
};

const homem = (g: string) => g === 'homem' || g.startsWith('homem ');
const mulherOuCasal = (g: string) => g === 'mulher' || g.startsWith('mulher ') || g.startsWith('casal');

/** 0 = o que a pessoa busca (ou mulher/casal), 1 = outros perfis, 2 = homem que ela não busca. */
export function faixaDeInteresse(generoDoAutor: string | null | undefined, euBusco: string[]): number {
  const g = String(generoDoAutor || '').trim().toLowerCase();
  const buscados = euBusco.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  const buscoEsse = buscados.some((b) => (b.startsWith('casal') ? g.startsWith('casal') : b === g));
  if (homem(g)) return buscoEsse ? 0 : 2;
  if (buscados.length > 0) return buscoEsse ? 0 : 1;
  return mulherOuCasal(g) ? 0 : 1;
}

export function ordenarStories<T extends LinhaDeStory>(
  linhas: T[],
  eu: { estado: string; busco: string[]; curti: Set<string>; agoraIso: string },
): T[] {
  const estado = eu.estado.trim().toUpperCase();
  const n = (v: unknown) => Number(v || 0);
  const chave = (r: T, i: number) => {
    const mesmoEstado = !!estado && String(r.state || '').trim().toUpperCase() === estado;
    const destaqueAqui = !!r.destaque_ate && String(r.destaque_ate) > eu.agoraIso && (!estado || mesmoEstado);
    return [
      n(r.is_pinned) === 1 ? 0 : 1,
      n(r.is_showcase_autor) === 1 ? 1 : 0,
      n(r.is_viewed) === 1 ? 1 : 0,
      destaqueAqui ? 0 : 1,
      eu.curti.has(String(r.user_id)) ? 0 : 1,
      mesmoEstado ? 0 : 1,
      faixaDeInteresse(r.gender, eu.busco),
      i,
    ];
  };
  return linhas
    .map((r, i) => ({ r, k: chave(r, i) }))
    .sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return 0;
    })
    .map((x) => x.r);
}
