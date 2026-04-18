function normalizeUserId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') return null;
  return normalized;
}

export function getUserProfileHref(
  userId: unknown,
  currentUserId?: unknown,
  fallback = '/search'
): string {
  const targetUserId = normalizeUserId(userId);
  const viewerUserId = normalizeUserId(currentUserId);

  if (!targetUserId) return fallback;
  if (viewerUserId && targetUserId === viewerUserId) return '/profile';

  return `/users/${encodeURIComponent(targetUserId)}`;
}
