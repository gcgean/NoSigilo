// Primeiro acesso de quem acabou de se cadastrar: uma tela com cidade, quem a pessoa
// curte e foto. No mesmo dia nenhuma outra janela abre por cima (idade, fetiches,
// tutorial, convite da Casa): elas ficam para quando a pessoa voltar.

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
  window.dispatchEvent(new CustomEvent('nosigilo:primeiros-passos-mudou'));
}

/** Enquanto for o dia do cadastro (ou os passos estiverem pendentes), as outras janelas esperam. */
export function outrasJanelasEsperam(userId: string | null | undefined) {
  if (!userId) return false;
  const r = ler(userId);
  return !!r && (r.ativo || r.dia === hoje());
}
