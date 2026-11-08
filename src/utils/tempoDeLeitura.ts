/** Tempo de leitura de um conto (≈200 palavras por minuto, mínimo 1). */
export function minutosDeLeitura(texto: string | null | undefined): number {
  const palavras = String(texto ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(palavras / 200));
}
