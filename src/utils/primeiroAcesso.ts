// Primeiro acesso de quem acabou de se cadastrar: uma tela com cidade, quem a pessoa
// curte e foto. No mesmo dia as outras janelas (idade, fetiches, tutorial) ficam para
// quando a pessoa voltar. O convite da Casa é a exceção: abre assim que a tela termina.

import { useSyncExternalStore } from 'react';

const MUDOU = 'nosigilo:primeiros-passos-mudou';

const chave = (userId: string) => `nosigilo:primeiros-passos:${userId}`;
type Registro = { dia: string; ativo: boolean };

const hoje = () => new Date().toDateString();

function ler(userId: string): Registro | null {
  try {
    const bruto = localStorage.getItem(chave(userId));
    return bruto ? (JSON.parse(bruto) as Registro) : null;
  } catch {
    return null;
  }
}

function gravar(userId: string, registro: Registro) {
  try { localStorage.setItem(chave(userId), JSON.stringify(registro)); } catch { /* modo restrito */ }
}

export function marcarNovoCadastro(userId: string) {
  gravar(userId, { dia: hoje(), ativo: true });
}

/** A tela dos três passos ainda está pendente. */
export function primeirosPassosAtivos(userId: string | null | undefined) {
  return !!userId && ler(userId)?.ativo === true;
}

export function concluirPrimeirosPassos(userId: string) {
  const r = ler(userId);
  gravar(userId, { dia: r?.dia ?? hoje(), ativo: false });
  window.dispatchEvent(new CustomEvent(MUDOU));
}

/** Igual a primeirosPassosAtivos, mas atualiza a tela quando a pessoa conclui os passos. */
export function usePrimeirosPassosAtivos(userId: string | null | undefined) {
  return useSyncExternalStore(
    (avisar) => {
      window.addEventListener(MUDOU, avisar);
      return () => window.removeEventListener(MUDOU, avisar);
    },
    () => primeirosPassosAtivos(userId),
  );
}

/** Enquanto for o dia do cadastro (ou os passos estiverem pendentes), as outras janelas esperam. */
export function outrasJanelasEsperam(userId: string | null | undefined) {
  if (!userId) return false;
  const r = ler(userId);
  return !!r && (r.ativo || r.dia === hoje());
}
