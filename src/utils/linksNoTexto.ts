// Acha endereços num texto do usuário (post, story, mensagem, bio) para virar link.
// Só http/https; e-mail (contato@site.com) e @menção não contam. Endereço do
// NoSigilo é "interno" (abre aqui dentro); o resto é "externo" e passa por um
// aviso de saída antes de abrir (proteção contra golpe e spam).
export type ParteComLink = { texto: string; href?: string; interno?: boolean };

const TLDS = 'com|net|org|br|pt|me|io|app|gg|ly|ee|to|fm|ai|link|tv|co|info|site|online|store|bio|page|art|club|xyz';
const ACHAR = new RegExp(
  `(^|[^@\\w./-])((?:https?:\\/\\/[^\\s<>"']+)|(?:www\\.[^\\s<>"']+)|(?:(?:[a-z0-9-]+\\.)+(?:${TLDS})(?:\\.br)?(?![\\w-])(?:\\/[^\\s<>"']*)?))`,
  'gi'
);

function montarHref(endereco: string): string | null {
  const comProtocolo = /^https?:\/\//i.test(endereco) ? endereco : `https://${endereco}`;
  try {
    const u = new URL(comProtocolo);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function ehLinkInterno(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === 'nosigilo.net' || host.endsWith('.nosigilo.net');
  } catch {
    return false;
  }
}

export function separarLinksDoTexto(texto: string): ParteComLink[] {
  const partes: ParteComLink[] = [];
  let ate = 0;
  ACHAR.lastIndex = 0;
  let achado: RegExpExecArray | null;
  while ((achado = ACHAR.exec(texto))) {
    const inicio = achado.index + achado[1].length;
    // Pontuação colada no fim da frase (e parêntese sem par) não faz parte do endereço.
    let endereco = achado[2].replace(/[.,;:!?…]+$/, '');
    if (endereco.endsWith(')') && !endereco.includes('(')) endereco = endereco.slice(0, -1);
    const href = montarHref(endereco);
    if (!href) continue;
    if (inicio > ate) partes.push({ texto: texto.slice(ate, inicio) });
    partes.push({ texto: endereco, href, interno: ehLinkInterno(href) });
    ate = inicio + endereco.length;
    ACHAR.lastIndex = ate;
  }
  if (ate < texto.length) partes.push({ texto: texto.slice(ate) });
  return partes;
}

/** Primeiro link do texto (para o botão de link do story). */
export function primeiroLink(texto: string): ParteComLink | null {
  return separarLinksDoTexto(texto).find((p) => p.href) ?? null;
}

/** "https://www.instagram.com/x" → "instagram.com" (o que a pessoa lê no aviso). */
export function dominioDoLink(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return href;
  }
}
