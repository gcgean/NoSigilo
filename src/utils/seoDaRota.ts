/**
 * Ajustes de SEO por rota no app (o Google executa o JavaScript da página).
 * - Login, cadastro, assinaturas, termos e convites: "noindex" (não são páginas
 *   para aparecer na busca e tiravam espaço das páginas de cidade).
 * - /login?origem=...: canonical para /login (eram duplicatas).
 * - /acasa: título e descrição para "casa liberal online / boate liberal virtual".
 */
const NAO_INDEXAR = [/^\/login/, /^\/register/, /^\/subscriptions/, /^\/terms/, /^\/privacy/, /^\/invite\//];

function meta(nome: string, valor: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`);
  if (!el) { el = document.createElement('meta'); el.name = nome; document.head.appendChild(el); }
  el.content = valor;
}
function canonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) { el?.remove(); return; }
  if (!el) { el = document.createElement('link'); el.rel = 'canonical'; document.head.appendChild(el); }
  el.href = href;
}

export function aplicarSeoDaRota(pathname: string) {
  const origem = window.location.origin.includes('localhost') ? window.location.origin : 'https://nosigilo.net';
  meta('robots', NAO_INDEXAR.some((r) => r.test(pathname)) ? 'noindex, follow' : 'index, follow');
  if (pathname.startsWith('/login')) canonical(`${origem}/login`);
  else if (pathname === '/acasa' || pathname === '/a-casa') {
    canonical(`${origem}/acasa`);
    document.title = 'A Casa: casa liberal online e boate liberal virtual | NoSigilo';
    meta('description', 'A primeira casa liberal online do Brasil: boate virtual para casais liberais e singles, toda sexta e sábado às 22h, até 1h. Salas ao vivo, brincadeiras, cabines e discrição total.');
  }
}
