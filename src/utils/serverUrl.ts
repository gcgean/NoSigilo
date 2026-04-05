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

function deriveServerOrigin() {
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
export const API_URL = import.meta.env.VITE_API_URL?.trim() || `${SERVER_ORIGIN}/api`;
export const SOCKET_URL = SERVER_ORIGIN;

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
