/**
 * Lembretes do Chat guardados no aparelho:
 * - o cartão "Novos contatos" aparece uma vez por dia (a aba Pedidos mantém o número);
 * - a aba "Na região" mostra quantos perfis novos a pessoa ainda não viu.
 *
 * Tudo em try/catch: sem armazenamento (aba anônima), o app segue funcionando.
 */
const chaveCartao = (userId: string) => `nosigilo:chat:cartao-contatos:${userId}`;
const chaveRegiao = (userId: string) => `nosigilo:chat:regiao-vistos:${userId}`;

function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/** true se o cartão ainda não apareceu hoje neste aparelho. */
export function cartaoContatosLiberadoHoje(userId: string, agora = new Date()): boolean {
  try {
    return localStorage.getItem(chaveCartao(userId)) !== hojeLocal(agora);
  } catch {
    return true;
  }
}

export function registrarCartaoContatosHoje(userId: string, agora = new Date()): void {
  try {
    localStorage.setItem(chaveCartao(userId), hojeLocal(agora));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

function lerVistos(userId: string): Set<string> {
  try {
    const bruto = JSON.parse(localStorage.getItem(chaveRegiao(userId)) || '[]');
    return new Set(Array.isArray(bruto) ? bruto.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Quantos dos perfis da região a pessoa ainda não viu na aba. */
export function contarNovosNaRegiao(userId: string, ids: string[]): number {
  const vistos = lerVistos(userId);
  return ids.filter((id) => !vistos.has(id)).length;
}

/** Marca como vistos os perfis atuais (guarda só os de agora: a lista é dos últimos 7 dias). */
export function marcarRegiaoVista(userId: string, ids: string[]): void {
  try {
    localStorage.setItem(chaveRegiao(userId), JSON.stringify(ids.slice(0, 500)));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
