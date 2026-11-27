// Preferência das animações d'A Casa (drinks, brindes, ações da cabine), guardada no
// aparelho. Quem marcou "reduzir movimento" no celular recebe a versão calma
// (sem tremer nem clarão) mesmo com as animações ligadas.
const CHAVE = 'nosigilo:casa-efeitos';
const ouvintes = new Set<(v: boolean) => void>();

export function efeitosLigados(): boolean {
  try { return localStorage.getItem(CHAVE) !== '0'; } catch { return true; }
}

export function ligarEfeitos(v: boolean) {
  try { localStorage.setItem(CHAVE, v ? '1' : '0'); } catch { /* sem storage: vale só agora */ }
  ouvintes.forEach((f) => f(v));
}

export function aoMudarEfeitos(f: (v: boolean) => void) {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

export function movimentoReduzido(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
}
