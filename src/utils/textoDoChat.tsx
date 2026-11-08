import { Fragment, type ReactNode } from 'react';
import { separarLinksDoTexto } from '@/utils/linksNoTexto';
import { LinkExterno } from '@/components/TextoComLinks';

// Dicas da conta oficial trazem atalhos no formato [[Texto|/rota]]: viram botões
// que abrem a função. Só rotas internas desta lista, para ninguém usar isso
// para mandar link para fora.
const ROTAS_DE_ATALHO = new Set(['/profile', '/match', '/search', '/stories', '/feed', '/radar', '/events', '/settings', '/tokens', '/subscriptions']);

// Endereço do NoSigilo vira link (o convite da Lola para a Casa, por exemplo). Abre
// aqui dentro, para a pessoa continuar logada e o app instalado não pular para o navegador.
// Link de outro site só vira link com `externos` (conversa aceita), e passa pelo aviso de saída.
function comLinks(texto: string, navigate: (rota: string) => void, chave: string, externos: boolean): ReactNode {
  const partes = separarLinksDoTexto(texto);
  if (!partes.some((p) => p.href && (p.interno || externos))) return texto;
  return partes.map((parte, i) => {
    if (!parte.href || (!parte.interno && !externos)) return <Fragment key={`${chave}-${i}`}>{parte.texto}</Fragment>;
    if (!parte.interno) return <LinkExterno key={`${chave}-${i}`} href={parte.href}>{parte.texto}</LinkExterno>;
    const destino = new URL(parte.href);
    return (
      <a
        key={`${chave}-${i}`}
        href={parte.href}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`${destino.pathname}${destino.search}${destino.hash}`); }}
        className="break-all font-semibold underline underline-offset-2"
      >
        {parte.texto}
      </a>
    );
  });
}

export function textoComAtalhos(texto: string, navigate: (rota: string) => void, opcoes?: { externos?: boolean }): ReactNode {
  const externos = !!opcoes?.externos;
  if (!texto.includes('[[')) return comLinks(texto, navigate, 't', externos);
  const partes = texto.split(/(\[\[[^\]|]{1,40}\|\/[a-z/-]{1,30}\]\])/g);
  return partes.map((parte, i) => {
    const m = /^\[\[([^\]|]+)\|(\/[a-z/-]+)\]\]$/.exec(parte);
    if (!m || !ROTAS_DE_ATALHO.has(m[2])) return <Fragment key={i}>{comLinks(parte, navigate, String(i), externos)}</Fragment>;
    return (
      <button
        key={i}
        type="button"
        onClick={() => navigate(m[2])}
        className="mx-0.5 my-1 inline-flex items-center rounded-full bg-brand-pink px-3 py-1 text-sm font-semibold text-white active:scale-95"
      >
        {m[1]}
      </button>
    );
  });
}
