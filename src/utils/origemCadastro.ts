// De qual página o visitante veio antes de se cadastrar.
//
// As páginas regionais de SEO (/swing/<estado>/ e /swing/<estado>/<cidade>/)
// são HTML estático servido fora do app React, e seus links levam ao cadastro
// e ao login com ?origem=swing/ceara/fortaleza. É o que permite responder, no
// admin, se essas páginas trazem gente que se cadastra ou só trazem visita.
//
// São duas fontes, nesta ordem de confiança:
//
//   1. A URL atual. É o dado bruto, sempre presente enquanto a pessoa estiver
//      na página para onde o link a mandou.
//   2. O sessionStorage. Serve para a origem atravessar a navegação: quem chega
//      por Fortaleza costuma ver /descobrir, voltar, ir ao login e só então
//      criar a conta — e nesse trajeto a URL já perdeu o parâmetro.
//
// A primeira versão usava só o sessionStorage, e um cadastro real feito pela
// página de Fortaleza foi gravado como direto. A cadeia toda estava correta no
// bundle publicado, o que deixou como explicação o armazenamento ter voltado
// vazio na hora do envio. Isso acontece em pelo menos três situações, e nenhuma
// delas é rara:
//
//   • Navegação interna sem recarregar. capturaOrigem() roda uma vez, na carga
//     do módulo. Se a pessoa volta ao /register pelo roteador, a URL continua
//     mostrando ?origem= mas nada é lido de novo.
//   • Segundo cadastro na mesma aba. limpaOrigem() apaga depois do primeiro, e
//     o seguinte perdia a origem mesmo com a URL dizendo o contrário.
//   • Janela anônima com proteção estrita. O setItem lança, o catch engole e a
//     origem some sem deixar rastro.
//
// Ler a URL primeiro cobre as três, porque não depende de nada ter sido
// guardado antes.

const CHAVE = 'nosigilo:origem-cadastro';

/** O formato aceito é o mesmo que o backend valida antes de gravar. Aqui a
 *  checagem serve para não guardar lixo que alguém digite na barra de
 *  endereços — a validação que vale é a do servidor. */
const FORMATO = /^swing(\/[a-z0-9-]+){0,2}$/;

function daUrl(busca: string = window.location.search): string | undefined {
  try {
    const valor = new URLSearchParams(busca).get('origem')?.trim() || '';
    return valor && FORMATO.test(valor) ? valor : undefined;
  } catch {
    return undefined;
  }
}

/** Chame quando o app sobe. Se a URL trouxer ?origem= válida, guarda para
 *  sobreviver à navegação seguinte. */
export function capturaOrigem(busca: string = window.location.search): void {
  const valor = daUrl(busca);
  if (!valor) return;
  try {
    sessionStorage.setItem(CHAVE, valor);
  } catch {
    // Armazenamento bloqueado. Não é fatal: a URL continua respondendo por esta
    // página, e o cadastro nunca pode falhar por causa de uma métrica.
  }
}

/** O que enviar no cadastro, ou undefined se a visita não veio de uma página
 *  regional. */
export function leOrigem(): string | undefined {
  const agora = daUrl();
  if (agora) return agora;
  try {
    const valor = sessionStorage.getItem(CHAVE)?.trim() || '';
    return valor && FORMATO.test(valor) ? valor : undefined;
  } catch {
    return undefined;
  }
}

/** Depois do cadastro concluído, para uma segunda conta criada no mesmo
 *  navegador não herdar a origem guardada da primeira. A URL segue valendo: se
 *  a pessoa ainda está numa página que veio de Fortaleza, ela veio de
 *  Fortaleza, e isso é verdade sobre esta visita — não resíduo da anterior. */
export function limpaOrigem(): void {
  try { sessionStorage.removeItem(CHAVE); } catch { /* nada a fazer */ }
}
