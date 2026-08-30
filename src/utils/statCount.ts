/**
 * Abrevia contadores de perfil (visualizações, seguidores...) para caberem
 * lado a lado em telas estreitas: 1.234 vira "1,2 mil" e 107.000 vira
 * "107 mil". Abaixo de mil mostra o número cheio, que é o caso da maioria
 * dos perfis.
 */
export function formatStatCount(valor: number | null | undefined): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return '0';

  if (n < 1000) return String(Math.floor(n));

  if (n < 1_000_000) {
    const milhares = n / 1000;
    // Uma casa decimal só enquanto ela informa algo (1,2 mil); a partir de
    // 10 mil o decimal vira ruído e o número fica longo demais.
    return milhares < 10
      ? `${milhares.toFixed(1).replace('.', ',').replace(',0', '')} mil`
      : `${Math.floor(milhares)} mil`;
  }

  const milhoes = n / 1_000_000;
  return milhoes < 10
    ? `${milhoes.toFixed(1).replace('.', ',').replace(',0', '')} mi`
    : `${Math.floor(milhoes)} mi`;
}

export default formatStatCount;
