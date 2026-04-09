import { calculateAge } from '@/utils/age';

function isCoupleProfile(gender?: string | null) {
  return String(gender || '').trim().startsWith('Casal');
}

function getCoupleLabels(gender?: string | null) {
  const value = String(gender || '').trim();
  if (value === 'Casal (Ele/Ela)') return ['Ele', 'Ela'];
  if (value === 'Casal (Ele/Ele)') return ['Ele 1', 'Ele 2'];
  if (value === 'Casal (Ela/Ela)') return ['Ela 1', 'Ela 2'];
  return ['Pessoa 1', 'Pessoa 2'];
}

export function buildProfileAgeLabel(profile?: {
  birthDate?: string | null;
  partnerBirthDate?: string | null;
  gender?: string | null;
} | null) {
  if (!profile) return null;

  const primaryAge = calculateAge(profile.birthDate);
  const partnerAge = calculateAge(profile.partnerBirthDate);

  if (!isCoupleProfile(profile.gender)) {
    return primaryAge !== null ? String(primaryAge) : null;
  }

  const labels = getCoupleLabels(profile.gender);
  const parts = [
    primaryAge !== null ? `${labels[0]}: ${primaryAge}` : null,
    partnerAge !== null ? `${labels[1]}: ${partnerAge}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' • ') : null;
}
