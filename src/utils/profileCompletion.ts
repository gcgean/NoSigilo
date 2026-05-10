type ProfileFields = {
  avatar?: string | null;
  bio?: string | null;
  city?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  lookingFor?: string | null;
  maritalStatus?: string | null;
};

export type MissingField = { label: string; weight: number };

const FIELD_WEIGHTS: Array<{ key: keyof ProfileFields; label: string; weight: number }> = [
  { key: 'avatar',        label: 'Foto principal',      weight: 20 },
  { key: 'bio',           label: 'Apresentação',         weight: 15 },
  { key: 'city',          label: 'Cidade',               weight: 15 },
  { key: 'birthDate',     label: 'Data de nascimento',   weight: 15 },
  { key: 'gender',        label: 'Gênero',               weight: 15 },
  { key: 'lookingFor',    label: 'O que procura',        weight: 10 },
  { key: 'maritalStatus', label: 'Estado civil',         weight: 10 },
];

export function calcProfileCompletion(profile: ProfileFields): {
  percent: number;
  missing: MissingField[];
} {
  let earned = 0;
  const missing: MissingField[] = [];

  for (const { key, label, weight } of FIELD_WEIGHTS) {
    const val = profile[key];
    if (val && String(val).trim()) {
      earned += weight;
    } else {
      missing.push({ label, weight });
    }
  }

  return { percent: earned, missing };
}
