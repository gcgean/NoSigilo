// Para onde levar a pessoa logo depois de criar a conta (ou entrar pelo Google).
// A página pública d'A Casa guarda "/casa" aqui; o padrão continua o Feed.
// Só destinos desta lista, para ninguém usar isso para mandar a pessoa para fora.
const CHAVE = 'nosigilo:destino-pos-cadastro';
const PERMITIDOS = new Set(['/casa']);

export function guardarDestinoPosCadastro(destino: string) {
  try { if (PERMITIDOS.has(destino)) sessionStorage.setItem(CHAVE, destino); } catch { /* sem storage */ }
}

export function consumirDestinoPosCadastro(padrao: string): string {
  try {
    const d = sessionStorage.getItem(CHAVE);
    sessionStorage.removeItem(CHAVE);
    return d && PERMITIDOS.has(d) ? d : padrao;
  } catch {
    return padrao;
  }
}
