export function isTrialExpired(trialEndsAt?: string | null) {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return false;
  return end <= Date.now();
}

export function hasPremiumAccess(
  user?: { isPremium?: boolean; trialEndsAt?: string | null; subscriptionsEnabled?: boolean } | null
) {
  if (user?.subscriptionsEnabled === false) return true;
  if (user?.isPremium) return true;
  return !isTrialExpired(user?.trialEndsAt ?? null);
}

export function isPremiumBlocked(
  user?: { isPremium?: boolean; trialEndsAt?: string | null; subscriptionsEnabled?: boolean } | null
) {
  return !hasPremiumAccess(user);
}
