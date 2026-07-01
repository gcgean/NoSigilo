// Lista única de vídeos já vistos, compartilhada entre a Busca de Vídeos e o Reels.
// Por usuário (contas diferentes no mesmo aparelho não misturam), com teto de itens.

const MAX_SEEN = 500;

function storageKey(userId?: string | null) {
  return `nosigilo:video-seen:${userId || 'anon'}`;
}

export function readSeenVideoIds(userId?: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function addSeenVideoId(id: string, userId?: string | null) {
  if (!id) return;
  try {
    const set = readSeenVideoIds(userId);
    if (set.has(id)) return;
    set.add(id);
    const arr = Array.from(set).slice(-MAX_SEEN);
    localStorage.setItem(storageKey(userId), JSON.stringify(arr));
  } catch { /* storage indisponível — ignora */ }
}
