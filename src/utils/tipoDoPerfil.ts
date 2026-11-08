/**
 * Perfil sem foto mostra a silhueta do tipo de perfil (casal, mulher, homem...)
 * em vez da inicial do nome: diz na hora quem é, sem parecer conta vazia.
 *
 * `forma`: f = feminina, m = masculina; casal combina duas.
 */
export type FormaDoTipo = 'f' | 'm' | 'fm' | 'ff' | 'mm';

const TIPOS: Array<{ teste: (g: string) => boolean; forma: FormaDoTipo; rotulo: string }> = [
  { teste: (g) => g === 'Casal (Ela/Ela)', forma: 'ff', rotulo: 'Casal' },
  { teste: (g) => g === 'Casal (Ele/Ele)', forma: 'mm', rotulo: 'Casal' },
  { teste: (g) => g.startsWith('Casal'), forma: 'fm', rotulo: 'Casal' },
  { teste: (g) => g === 'Mulher', forma: 'f', rotulo: 'Mulher' },
  { teste: (g) => g === 'Homem', forma: 'm', rotulo: 'Homem' },
  { teste: (g) => g === 'Travesti', forma: 'f', rotulo: 'Travesti' },
  { teste: (g) => g.startsWith('Trans'), forma: 'f', rotulo: 'Pessoa trans' },
  { teste: (g) => g.startsWith('Crossdresser'), forma: 'f', rotulo: 'Crossdresser' },
];

export function tipoDoPerfil(gender?: string | null): { forma: FormaDoTipo; rotulo: string } | null {
  const g = String(gender ?? '').trim();
  if (!g) return null;
  const t = TIPOS.find((x) => x.teste(g));
  return t ? { forma: t.forma, rotulo: t.rotulo } : null;
}

export function inicialDoNome(name?: string | null): string {
  return (String(name || 'U')[0] || 'U').toUpperCase();
}
