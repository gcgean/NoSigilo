type ProfileIdentityInput = {
  gender?: string | null;
  city?: string | null;
  state?: string | null;
};

function compact(value?: string | null) {
  return String(value || '').trim();
}

export function formatProfileIdentityLine(profile?: ProfileIdentityInput | null) {
  if (!profile) return '';
  const gender = compact(profile.gender);
  const city = compact(profile.city);
  const state = compact(profile.state);
  const location = [city, state].filter(Boolean).join(', ');
  return [gender, location].filter(Boolean).join(' - ');
}
