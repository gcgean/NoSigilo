// Primeiro contato da pessoa com o site: de onde ela veio na PRIMEIRA visita.
//
// Vai junto no cadastro (e-mail ou Google) e alimenta o card "Cadastros por
// origem" do admin. Antes, a origem era deduzida pelo IP, que no 4G é
// compartilhado e muda o tempo todo, e 99% dos cadastros não tinham origem.
//
// Guarda no localStorage por até 30 dias e NÃO sobrescreve: quem conheceu o
// site pelo Instagram e voltou dias depois pelo Google conta como Instagram
// (foi o Instagram que trouxe). Nada aqui pode quebrar a navegação ou o cadastro.

const CHAVE = 'nosigilo:primeiro-toque';
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

export type PrimeiroToque = {
  ref?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  app?: string;
  em?: string;
};

const DOMINIOS_PROPRIOS = /(^|\.)nosigilo|baselider|accounts\.google\.com|livepix/i;

function appDoNavegador(ua: string): string | undefined {
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'tiktok';
  return undefined;
}

export function capturaPrimeiroToque(): void {
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (guardado) {
      const antigo = JSON.parse(guardado) as PrimeiroToque;
      if (antigo?.em && Date.now() - new Date(antigo.em).getTime() < VALIDADE_MS) return;
    }
    const busca = new URLSearchParams(window.location.search);
    let ref: string | undefined;
    try {
      const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
      if (host && !DOMINIOS_PROPRIOS.test(host)) ref = host.replace(/^www\./, '');
    } catch { /* referrer inválido: segue sem */ }
    const toque: PrimeiroToque = {
      ref,
      utmSource: busca.get('utm_source') || undefined,
      utmMedium: busca.get('utm_medium') || undefined,
      // Página pública d'A Casa conta como campanha própria (canal "A Casa" no admin).
      utmCampaign: busca.get('utm_campaign') || (/^\/a-?casa/.test(window.location.pathname) ? 'a-casa' : undefined),
      app: appDoNavegador(navigator.userAgent || ''),
      em: new Date().toISOString(),
    };
    localStorage.setItem(CHAVE, JSON.stringify(toque));
  } catch {
    // Armazenamento bloqueado (anônimo estrito): sem origem, sem problema.
  }
}

export function lePrimeiroToque(): PrimeiroToque | undefined {
  try {
    const guardado = localStorage.getItem(CHAVE);
    return guardado ? (JSON.parse(guardado) as PrimeiroToque) : undefined;
  } catch {
    return undefined;
  }
}
