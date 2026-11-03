import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Posição de rolagem por entrada do histórico (location.key), só em memória.
const posicoes = new Map<string, number>();
const TENTAR_POR_MS = 3000;

/**
 * Ao VOLTAR (botão voltar do celular/navegador), devolve a página para onde a
 * pessoa estava. Sem isso, toda volta caía no topo: as páginas recarregam os
 * dados ao montar e, quando o navegador tentava restaurar, a página ainda era
 * curta demais. Aqui tentamos por até 3 s, enquanto o conteúdo chega, e
 * paramos assim que a pessoa mexe na tela.
 */
export function useRestaurarRolagem() {
  const location = useLocation();
  const tipo = useNavigationType();

  useEffect(() => {
    try { window.history.scrollRestoration = 'manual'; } catch { /* ok */ }
  }, []);

  useEffect(() => {
    const chave = location.key;
    let parar = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pararDeTentar = () => { parar = true; };

    const alvo = tipo === 'POP' ? posicoes.get(chave) ?? 0 : 0;
    if (alvo > 0) {
      const inicio = Date.now();
      const tentar = () => {
        if (parar) return;
        window.scrollTo(0, alvo);
        if (Math.abs(window.scrollY - alvo) > 4 && Date.now() - inicio < TENTAR_POR_MS) {
          timer = setTimeout(tentar, 100);
        }
      };
      tentar();
      window.addEventListener('wheel', pararDeTentar, { passive: true });
      window.addEventListener('touchstart', pararDeTentar, { passive: true });
      window.addEventListener('keydown', pararDeTentar);
    }

    const aoRolar = () => posicoes.set(chave, window.scrollY);
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => {
      parar = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('scroll', aoRolar);
      window.removeEventListener('wheel', pararDeTentar);
      window.removeEventListener('touchstart', pararDeTentar);
      window.removeEventListener('keydown', pararDeTentar);
    };
  }, [location.key, tipo]);
}
