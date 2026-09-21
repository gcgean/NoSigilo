/**
 * App instalado x navegador.
 *
 * `standalone` é como o navegador informa que a página abriu fora da aba
 * (Android e desktop); no iPhone o sinal é `navigator.standalone`. Serve para
 * medir quem usa o quê e para não convidar a instalar quem já instalou.
 */
export function ehAppInstalado(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const porMedia = window.matchMedia?.('(display-mode: standalone)')?.matches === true;
    const noIos = (window.navigator as unknown as { standalone?: boolean })?.standalone === true;
    return porMedia || noIos;
  } catch {
    return false;
  }
}

export function modoDeUso(): 'app' | 'navegador' {
  return ehAppInstalado() ? 'app' : 'navegador';
}

export function ehIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

const CHAVE_VISITAS = 'nosigilo:visitas-do-dia';

/**
 * Conta as aberturas de hoje neste aparelho. O convite de instalar espera a
 * segunda visita do dia — no primeiro acesso a pessoa ainda não sabe se gosta
 * da plataforma e o convite só atrapalha.
 */
export function registrarVisitaDoDia(): number {
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    const bruto = localStorage.getItem(CHAVE_VISITAS);
    const salvo = bruto ? JSON.parse(bruto) : null;
    const total = salvo?.dia === hoje ? Number(salvo.total || 0) + 1 : 1;
    localStorage.setItem(CHAVE_VISITAS, JSON.stringify({ dia: hoje, total }));
    return total;
  } catch {
    return 1;
  }
}

export function visitasDeHoje(): number {
  const hoje = new Date().toISOString().slice(0, 10);
  try {
    const bruto = localStorage.getItem(CHAVE_VISITAS);
    const salvo = bruto ? JSON.parse(bruto) : null;
    return salvo?.dia === hoje ? Number(salvo.total || 0) : 0;
  } catch {
    return 0;
  }
}

const CHAVE_ENGAJOU = 'nosigilo:engajou-em';

/** Curtiu, comentou ou mandou mensagem: é a hora de convidar a instalar. */
export function marcarEngajamento() {
  try { localStorage.setItem(CHAVE_ENGAJOU, new Date().toISOString()); } catch { /* ok */ }
}

export function jaEngajou(): boolean {
  try { return !!localStorage.getItem(CHAVE_ENGAJOU); } catch { return false; }
}
