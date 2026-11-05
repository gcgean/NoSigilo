// Para onde levar a pessoa logo depois de criar a conta (ou entrar pelo Google).
// A página pública d'A Casa guarda "/casa" aqui; o padrão continua o Feed.
// Só destinos desta lista, para ninguém usar isso para mandar a pessoa para fora.
const CHAVE = 'nosigilo:destino-pos-cadastro';
const PERMITIDOS = new Set(['/casa', '/casa?reservar=1']);
// Avisa a Casa de que a pessoa acabou de se cadastrar com ela fechada, para
// mostrar a mensagem "enquanto não abre, aproveite a comunidade".
const CHAVE_BOAS_VINDAS = 'nosigilo:boas-vindas-casa';

export function guardarDestinoPosCadastro(destino: string) {
  try { if (PERMITIDOS.has(destino)) sessionStorage.setItem(CHAVE, destino); } catch { /* sem storage */ }
}

export function consumirDestinoPosCadastro(padrao: string): string {
  try {
    const d = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    if (d === '/casa?reservar=1') sessionStorage.setItem(CHAVE_BOAS_VINDAS, '1');
    return d && PERMITIDOS.has(d) ? d : padrao;
  } catch {
    return padrao;
  }
}

/** A pessoa está se cadastrando a caminho d'A Casa? (só olha, não consome) */
export function vaiParaACasa(): boolean {
  try { return PERMITIDOS.has(sessionStorage.getItem(CHAVE) || ''); } catch { return false; }
}

/** Devolve true uma vez só, logo depois do cadastro com A Casa fechada. */
export function consumirBoasVindasDaCasa(): boolean {
  try {
    const tem = sessionStorage.getItem(CHAVE_BOAS_VINDAS) === '1';
    sessionStorage.removeItem(CHAVE_BOAS_VINDAS);
    return tem;
  } catch {
    return false;
  }
}
