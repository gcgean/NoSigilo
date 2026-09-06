// De qual página o visitante veio antes de se cadastrar.
//
// As páginas regionais de SEO (/swing/<estado>/ e /swing/<estado>/<cidade>/)
// são HTML estático servido fora do app React, e seus CTAs levam ao cadastro
// com ?origem=swing/ceara/fortaleza. É o que permite responder, no admin, se
// essas páginas trazem gente que se cadastra ou se só trazem visita.
//
// Guardar em sessionStorage e não só ler da URL resolve o caminho realista:
// quem chega pela página de Fortaleza costuma olhar /descobrir, voltar, ir ao
// login e só então criar a conta. Sem isso a origem se perderia na primeira
// navegação e o relatório mediria bem menos do que aconteceu.
//
// sessionStorage, e não localStorage, de propósito: a origem vale para esta
// visita. Se a pessoa voltar semanas depois pela home, ela veio da home — e
// atribuir o cadastro a uma página regional que ela viu num outro dia seria
// inflar o número que estamos justamente tentando medir.

const CHAVE = 'nosigilo:origem-cadastro';

/** O formato aceito é o mesmo que o backend valida antes de gravar. Aqui a
 *  checagem serve para não guardar lixo que alguém digite na barra de
 *  endereços — a validação que vale é a do servidor. */
const FORMATO = /^swing(\/[a-z0-9-]+){0,2}$/;

/** Chame uma vez quando o app sobe. Se a URL trouxer ?origem= válida, guarda. */
export function capturaOrigem(busca: string = window.location.search): void {
  try {
    const valor = new URLSearchParams(busca).get('origem')?.trim() || '';
    if (valor && FORMATO.test(valor)) {
      sessionStorage.setItem(CHAVE, valor);
    }
  } catch {
    // Navegação anônima com storage bloqueado, por exemplo. A origem se perde
    // e o cadastro conta como direto — o cadastro em si não pode quebrar por
    // causa de uma métrica.
  }
}

/** O que enviar no cadastro, ou undefined se a visita não veio de uma página
 *  regional. */
export function leOrigem(): string | undefined {
  try {
    const valor = sessionStorage.getItem(CHAVE)?.trim() || '';
    return valor && FORMATO.test(valor) ? valor : undefined;
  } catch {
    return undefined;
  }
}

/** Depois do cadastro concluído, para uma segunda conta criada no mesmo
 *  navegador não herdar a origem da primeira. */
export function limpaOrigem(): void {
  try { sessionStorage.removeItem(CHAVE); } catch { /* nada a fazer */ }
}
