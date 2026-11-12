// "O que procuro" em 4 grupos simples, para o seletor da Busca e do Match
// (12/11/2026). Por baixo continua a lista de tipos do perfil (looking_for):
// "Casal" liga/desliga os três tipos de casal, "Trans" liga trans, travesti e CD.

export type GrupoQueProcuro = 'mulher' | 'casal' | 'homem' | 'trans';

export const GRUPOS_QUE_PROCURO: Array<{ id: GrupoQueProcuro; rotulo: string; plural: string; emoji: string; tipos: string[] }> = [
  { id: 'mulher', rotulo: 'Mulher', plural: 'Mulheres', emoji: '👩', tipos: ['Mulher'] },
  { id: 'casal', rotulo: 'Casal', plural: 'Casais', emoji: '💑', tipos: ['Casal (Ele/Ela)', 'Casal (Ele/Ele)', 'Casal (Ela/Ela)'] },
  { id: 'homem', rotulo: 'Homem', plural: 'Homens', emoji: '👨', tipos: ['Homem'] },
  { id: 'trans', rotulo: 'Trans / CD', plural: 'Trans e CD', emoji: '🏳️‍⚧️', tipos: ['Transexual', 'Travesti', 'Crossdresser (CD)'] },
];

/** Grupos ligados a partir da lista do perfil. */
export function gruposDoPerfil(lookingFor: string[] | null | undefined): Set<GrupoQueProcuro> {
  const lista = (lookingFor || []).map((x) => String(x || '').trim());
  const ligados = new Set<GrupoQueProcuro>();
  for (const g of GRUPOS_QUE_PROCURO) {
    if (lista.some((t) => g.tipos.includes(t) || (g.id === 'casal' && t.startsWith('Casal')))) ligados.add(g.id);
  }
  return ligados;
}

/**
 * Nova lista do perfil a partir dos grupos escolhidos. Mantém o que a pessoa já
 * tinha marcado dentro de um grupo que continua ligado (ex.: só "Casal (Ele/Ela)").
 */
export function listaDosGrupos(grupos: Set<GrupoQueProcuro>, anterior: string[] | null | undefined): string[] {
  const antes = (anterior || []).map((x) => String(x || '').trim()).filter(Boolean);
  const saida: string[] = [];
  for (const g of GRUPOS_QUE_PROCURO) {
    if (!grupos.has(g.id)) continue;
    const jaTinha = antes.filter((t) => g.tipos.includes(t));
    saida.push(...(jaTinha.length > 0 ? jaTinha : g.id === 'casal' ? ['Casal (Ele/Ela)'] : g.tipos));
  }
  return Array.from(new Set(saida));
}

/** "Mulheres e Casais" / "Todos os perfis". */
export function resumoDoQueProcuro(lookingFor: string[] | null | undefined): string {
  const ligados = GRUPOS_QUE_PROCURO.filter((g) => gruposDoPerfil(lookingFor).has(g.id)).map((g) => g.plural);
  if (ligados.length === 0 || ligados.length === GRUPOS_QUE_PROCURO.length) return 'Todos os perfis';
  if (ligados.length === 1) return ligados[0];
  return `${ligados.slice(0, -1).join(', ')} e ${ligados[ligados.length - 1]}`;
}
