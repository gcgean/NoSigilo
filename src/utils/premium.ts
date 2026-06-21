export function isTrialExpired(trialEndsAt?: string | null) {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return false;
  return end <= Date.now();
}

type PremiumUser = {
  isPremium?: boolean;
  trialEndsAt?: string | null;
  hubLicenseEndAt?: string | null;
  subscriptionsEnabled?: boolean;
} | null;

function parseTime(v?: string | null) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function hasPremiumAccess(user?: PremiumUser) {
  if (user?.subscriptionsEnabled === false) return true;
  const now = Date.now();
  const lic = parseTime(user?.hubLicenseEndAt);
  const trial = parseTime(user?.trialEndsAt);
  // Pago/HUB: vale só se a licença NÃO venceu (lic null = vitalício/sem data → mantém).
  if (user?.isPremium && (lic === null || lic > now)) return true;
  // Trial / dias ganhos por token continuam valendo mesmo após a licença paga vencer.
  if (trial !== null && trial > now) return true;
  return false;
}

export function isPremiumBlocked(user?: PremiumUser) {
  return !hasPremiumAccess(user);
}
