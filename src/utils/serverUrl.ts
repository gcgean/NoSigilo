export const SERVER_ORIGIN = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4001';

export function resolveServerUrl(url: string | null | undefined) {
  if (!url) return '';
  const u = String(url);
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('/')) return `${SERVER_ORIGIN}${u}`;
  return `${SERVER_ORIGIN}/${u}`;
}

