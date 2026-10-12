// Texto da distância entre você e outro perfil, igual em todas as telas.
//
// O backend manda km inteiros. 0 significa "mesma cidade, sem distância real"
// (um dos dois está marcado no centro da cidade do cadastro), então mostramos a
// cidade em vez de "0 km". Perto de verdade vira "menos de 2 km": número exato
// de quem está a poucas quadras ajudaria a descobrir onde a pessoa mora.
export function textoDistancia(
  km: unknown,
  opcoes: { cidade?: string | null; deVoce?: boolean } = {}
): string | null {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  if (km === 0) {
    const cidade = String(opcoes.cidade || '').trim();
    return cidade ? `Em ${cidade}` : 'Na sua cidade';
  }
  const sufixo = opcoes.deVoce ? ' de você' : '';
  if (km < 2) return `menos de 2 km${sufixo}`;
  return `${Math.round(km).toLocaleString('pt-BR')} km${sufixo}`;
}
