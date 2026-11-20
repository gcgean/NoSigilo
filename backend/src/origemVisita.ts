/**
 * De qual rede social veio a visita (20/11/2026, o dono começou a postar e a
 * anunciar no Facebook). Regras puras, sem banco, para teste direto.
 *
 * Ordem: UTM (intenção explícita do link) > site que mandou a pessoa >
 * navegador de dentro do app (o app do Facebook às vezes não manda referência,
 * e a visita caía como "direto").
 */

export type AppDoNavegador = 'facebook' | 'instagram' | 'tiktok' | null;

/** App cujo navegador interno abriu o site, pelo User-Agent. */
export function appPeloUserAgent(ua: string | null | undefined): AppDoNavegador {
  const s = String(ua || '');
  // Instagram primeiro: o UA do Instagram às vezes também traz marcas do Facebook.
  if (/Instagram/i.test(s)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FB4A|FBIOS/.test(s)) return 'facebook';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(s)) return 'tiktok';
  return null;
}

const MEDIO_PAGO = /(^|[^a-z])(paid|cpc|ppc|ads?|anuncio|anuncios|patrocinado|paidsocial|paid_social)([^a-z]|$)/;

function redePeloTexto(t: string): string | null {
  if (!t) return null;
  if (/(^|[^a-z])(fb|facebook|meta)([^a-z]|$)|facebook\.com$|^fb\.|\.fb\.|messenger/.test(t)) return 'Facebook';
  if (/(^|[^a-z])(ig|insta|instagram)([^a-z]|$)|instagram\.com$/.test(t)) return 'Instagram';
  if (/tiktok/.test(t)) return 'TikTok';
  if (/whatsapp|wa\.me|(^|[^a-z])wa([^a-z]|$)/.test(t)) return 'WhatsApp';
  if (/telegram|^t\.me$/.test(t)) return 'Telegram';
  if (/(^|\.)x\.com$|twitter|^t\.co$/.test(t)) return 'X / Twitter';
  if (/youtube|youtu\.be/.test(t)) return 'YouTube';
  if (/kwai/.test(t)) return 'Kwai';
  if (/linkedin/.test(t)) return 'LinkedIn';
  return null;
}

/**
 * Rede social da visita ("Facebook", "Instagram"...), ou null se não veio de
 * rede social. `pago` é true quando o link marca anúncio (utm_medium=cpc/paid/ads).
 */
export function redeSocialDaVisita(v: {
  dominio?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  userAgent?: string | null;
  app?: AppDoNavegador;
}): { rede: string; pago: boolean } | null {
  const utm = String(v.utmSource || '').trim().toLowerCase();
  const dominio = String(v.dominio || '').trim().toLowerCase();
  const medio = String(v.utmMedium || '').trim().toLowerCase();
  const app = v.app !== undefined ? v.app : appPeloUserAgent(v.userAgent);
  let rede = redePeloTexto(utm) ?? redePeloTexto(dominio);
  if (!rede && !utm && !dominio && app) {
    rede = app === 'facebook' ? 'Facebook' : app === 'instagram' ? 'Instagram' : 'TikTok';
  }
  if (!rede) return null;
  return { rede, pago: MEDIO_PAGO.test(medio) };
}

/** Rótulo para o painel: "Facebook" ou "Facebook (anúncio)". */
export function rotuloDaRede(r: { rede: string; pago: boolean }): string {
  return r.pago ? `${r.rede} (anúncio)` : r.rede;
}
