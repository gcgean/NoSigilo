// Token de "aparelho de confiança" da verificação em duas etapas.
//
// Guardado por e-mail, porque no login ainda não sabemos o id da conta — e duas
// contas no mesmo aparelho não podem se misturar. O servidor guarda só o hash;
// perder este valor (limpar os dados do navegador) só faz o código ser pedido
// de novo.

const chave = (email: string) => `nosigilo:aparelho-confiavel:${email.trim().toLowerCase()}`;

export function lerTokenDoAparelho(email?: string | null): string | undefined {
  if (!email) return undefined;
  try {
    return localStorage.getItem(chave(email)) || undefined;
  } catch {
    return undefined;
  }
}

export function guardarTokenDoAparelho(email: string, token: string) {
  try {
    localStorage.setItem(chave(email), token);
  } catch {
    /* sem armazenamento: o código volta a ser pedido, nada quebra */
  }
}

export function esquecerTokenDoAparelho(email?: string | null) {
  if (!email) return;
  try {
    localStorage.removeItem(chave(email));
  } catch {
    /* ignora */
  }
}
