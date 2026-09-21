import { useEffect } from 'react';

/**
 * Tira o caminho fácil de salvar a mídia dos outros: menu do botão direito,
 * arrastar a imagem para fora e o toque longo do celular (este último já vem
 * do CSS em index.css).
 *
 * Não é proteção de verdade — print de tela continua existindo em qualquer
 * site, e não há como impedir. Quem publica é avisado disso; a proteção que
 * funciona é a marca d'água gravada no arquivo.
 */
export default function ProtecaoDeMidia() {
  useEffect(() => {
    const ehMidia = (alvo: EventTarget | null) => {
      const el = alvo as HTMLElement | null;
      return !!el && (el.tagName === 'IMG' || el.tagName === 'VIDEO');
    };
    const bloquear = (e: Event) => { if (ehMidia(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', bloquear);
    document.addEventListener('dragstart', bloquear);
    return () => {
      document.removeEventListener('contextmenu', bloquear);
      document.removeEventListener('dragstart', bloquear);
    };
  }, []);

  return null;
}
