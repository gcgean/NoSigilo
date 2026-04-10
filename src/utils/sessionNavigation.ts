export const LAST_AUTH_ROUTE_KEY = 'nosigilo_last_route';

export function saveLastAuthRoute(path: string) {
  if (!path) return;
  localStorage.setItem(LAST_AUTH_ROUTE_KEY, path);
}

export function getLastAuthRoute(defaultPath = '/feed') {
  const saved = localStorage.getItem(LAST_AUTH_ROUTE_KEY);
  if (!saved || saved === '/' || saved === '/login' || saved === '/register') {
    return defaultPath;
  }
  return saved;
}
