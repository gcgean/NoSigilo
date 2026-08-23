import { useEffect, useState } from 'react';

/**
 * TEMPORÁRIO — medidor de viewport para diagnosticar o corte no iOS.
 *
 * Só aparece com ?debugvp=1 na URL, então não afeta ninguém em uso normal.
 * Fica fixo no topo (onde nada corta) e mostra os valores ao vivo da tela que
 * está falhando de verdade — feed, stories, o que for.
 *
 * Remover quando o diagnóstico terminar.
 */
export default function ViewportDebug() {
  const [ativo] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugvp')
  );
  const [dados, setDados] = useState<Record<string, string | number>>({});

  useEffect(() => {
    if (!ativo) return;
    const medir = () => {
      const vv = window.visualViewport;
      const vvH = vv ? Math.round(vv.height) : -1;

      // Onde o fim de um `fixed; bottom:0` realmente cai nesta tela.
      const sonda = document.createElement('div');
      sonda.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;pointer-events:none';
      document.body.appendChild(sonda);
      const fimDoFixed = Math.round(sonda.getBoundingClientRect().bottom);
      document.body.removeChild(sonda);

      // Valor real das áreas seguras neste momento.
      const teste = document.createElement('div');
      teste.style.cssText = 'position:fixed;bottom:env(safe-area-inset-bottom,0px);left:-9999px';
      document.body.appendChild(teste);
      const safeBottom = getComputedStyle(teste).bottom;
      document.body.removeChild(teste);

      const ua = navigator.userAgent;
      const navegador = /CriOS/.test(ua) ? 'CHROME iOS'
        : /FxiOS/.test(ua) ? 'FIREFOX iOS'
        : /EdgiOS/.test(ua) ? 'EDGE iOS'
        : /iPhone|iPad/.test(ua) ? 'SAFARI iOS'
        : 'OUTRO';

      setDados({
        NAVEGADOR: navegador,
        innerHeight: window.innerHeight,
        visualViewport: vvH,
        diferenca: vvH < 0 ? 'n/d' : window.innerHeight - vvH,
        clientHeight: document.documentElement.clientHeight,
        'fixed bottom:0 cai em': fimDoFixed,
        'sobra ate o visivel': vvH < 0 ? 'n/d' : vvH - fimDoFixed,
        'safe-area-bottom': safeBottom,
        scrollY: Math.round(window.scrollY),
        'vv.offsetTop': vv ? Math.round(vv.offsetTop) : -1,
      });
    };
    medir();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', medir);
    vv?.addEventListener('scroll', medir);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir);
    const id = window.setInterval(medir, 400);
    return () => {
      vv?.removeEventListener('resize', medir);
      vv?.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir);
      window.clearInterval(id);
    };
  }, [ativo]);

  if (!ativo) return null;

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2147483647,
        background: 'rgba(0,0,0,0.92)', color: '#6f6', padding: '4px 8px',
        font: '10px/1.35 ui-monospace, monospace', pointerEvents: 'none',
        display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 8,
      }}
    >
      {Object.entries(dados).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#999' }}>{k}</span>
          <b>{String(v)}</b>
        </div>
      ))}
    </div>
  );
}
