// Regras do chat da sala e das cabines d'A Casa, separadas da tela para ter teste.
import { mencionou } from '@/components/ChatDaCasaUi';

/**
 * Publica a mensagem e resolve sozinho as duas recusas passageiras do servidor:
 * o limite de 1 mensagem a cada 1,2 s (toque duplo) e a sala expirada (o celular
 * ficou sem avisar que continuava ali).
 */
export async function enviarComNovaTentativa<T>(
  postar: () => Promise<T>,
  reentrar: () => Promise<unknown>,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  try {
    return await postar();
  } catch (e) {
    const resposta = (e as { response?: { status?: number; data?: { error?: string } } })?.response;
    if (resposta?.status === 429) {
      await esperar(1300);
      return postar();
    }
    if (resposta?.status === 404 && resposta.data?.error === 'fora_da_sala') {
      await reentrar();
      return postar();
    }
    throw e;
  }
}

/** Alguém me marcou com @ ou respondeu uma mensagem minha? Devolve o que aconteceu, para o aviso. */
export function avisoDeMencao(
  msg: { tipo?: string; texto?: string; autor?: { id?: string } | null; resposta?: { nome?: string } | null },
  eu: { id?: string | null; nome?: string | null } | null | undefined,
): 'marcou' | 'respondeu' | null {
  if (!eu?.nome) return null;
  // A Lola chama pelo @ quando alguém está falando sozinho ou ao apresentar duas pessoas.
  if (msg.tipo === 'lola') return mencionou(msg.texto, eu.nome) ? 'marcou' : null;
  if (msg.tipo !== 'pessoa' || !msg.autor || msg.autor.id === eu.id) return null;
  if (mencionou(msg.texto, eu.nome)) return 'marcou';
  return msg.resposta?.nome === eu.nome ? 'respondeu' : null;
}

/** Mensagem que acende a bolinha do ícone das cabines: de outra pessoa, e não aviso do sistema ou da Lola. */
export function contaComoNovaNaCabine(msg: { tipo?: string; autor?: { id?: string } | null }, meuId: string | null | undefined) {
  if (msg.tipo !== 'pessoa' && msg.tipo !== 'midia' && msg.tipo !== 'acao') return false;
  return !meuId || msg.autor?.id !== meuId;
}
