import apiClient from '@/utils/apiClient';

/**
 * Situação pública d'A Casa, compartilhada entre o banner, o convite e os
 * atalhos. Cada um consultava por conta própria: eram 2 a 3 chamadas iguais a
 * cada tela aberta. Agora quem pedir dentro de 15 s reaproveita a mesma resposta.
 */
const VALIDADE_MS = 15_000;
let ultima: { em: number; pedido: Promise<any> } | null = null;

export function buscarCasaPublico(): Promise<any> {
  const agora = Date.now();
  if (ultima && agora - ultima.em < VALIDADE_MS) return ultima.pedido;
  const pedido = apiClient.get('/casa/publico').then((r) => r.data);
  ultima = { em: agora, pedido };
  // Falha não fica guardada: a próxima consulta tenta de novo.
  pedido.catch(() => { if (ultima?.pedido === pedido) ultima = null; });
  return pedido;
}

/** Só para testes: esquece a resposta guardada. */
export function esquecerCasaPublico() {
  ultima = null;
}
