function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getBrowserOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin) return '';
  return trimTrailingSlash(window.location.origin);
}

function isLocalBrowserOrigin(origin: string) {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function isLegacyLocalAssetUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!(parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return false;
    return parsed.pathname.startsWith('/uploads/') || parsed.pathname.startsWith('/private-uploads/');
  } catch {
    return false;
  }
}

// Domínios servidos pelo mesmo nginx, que repassa /api, /uploads e /socket.io
// para o backend. Neles a API é chamada no próprio domínio da página.
//
// Antes o app em nosigilo.net chamava nosigilo.baselider.com.br: outro
// domínio obriga o navegador a mandar uma consulta de permissão (CORS) antes
// de cada chamada autenticada, e a abrir uma segunda conexão segura. O Feed
// faz ~20 chamadas ao abrir — em internet lenta isso dobrava a espera.
const DOMINIOS_COM_API_PROPRIA = ['nosigilo.net', 'www.nosigilo.net', 'nosigilo.baselider.com.br'];

function origemPropriaComApi(): string {
  const origem = getBrowserOrigin();
  if (!origem) return '';
  try {
    return DOMINIOS_COM_API_PROPRIA.includes(new URL(origem).hostname) ? origem : '';
  } catch {
    return '';
  }
}

function deriveServerOrigin() {
  const propria = origemPropriaComApi();
  if (propria) return propria;

  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredApiUrl) {
    return trimTrailingSlash(configuredApiUrl.replace(/\/api\/?$/, ''));
  }

  const browserOrigin = getBrowserOrigin();
  if (browserOrigin && !isLocalBrowserOrigin(browserOrigin)) {
    return browserOrigin;
  }

  return 'http://localhost:4001';
}

export const SERVER_ORIGIN = deriveServerOrigin();
export const API_URL = origemPropriaComApi()
  ? `${SERVER_ORIGIN}/api`
  : import.meta.env.VITE_API_URL?.trim() || `${SERVER_ORIGIN}/api`;
export const SOCKET_URL = SERVER_ORIGIN;

/**
 * Returns the canonical site URL used for share links (e.g. invite links).
 * Priority: VITE_SITE_URL env var → window.location.origin.
 * Set VITE_SITE_URL=https://nosigilo.net in production to ensure links
 * always point to the main domain regardless of which proxy/CDN the user
 * is currently accessing.
 */
export function getSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  return getBrowserOrigin();
}

export function resolveServerUrl(url: string | null | undefined) {
  if (!url) return '';
  const u = String(url).trim();
  if (!u) return '';
  if (u.startsWith('blob:') || u.startsWith('data:')) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) {
    if (isLegacyLocalAssetUrl(u) && !isLocalBrowserOrigin(getBrowserOrigin())) {
      try {
        const parsed = new URL(u);
        return `${SERVER_ORIGIN}${parsed.pathname}${parsed.search}`;
      } catch {
        return u;
      }
    }
    return u;
  }
  if (u.startsWith('/')) return `${SERVER_ORIGIN}${u}`;
  return `${SERVER_ORIGIN}/${u}`;
}
