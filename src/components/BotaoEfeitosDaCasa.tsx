import { useEffect, useState } from 'react';
import { aoMudarEfeitos, efeitosLigados, ligarEfeitos } from '@/utils/efeitosDaCasa';
import { cn } from '@/lib/utils';

/** Liga/desliga as animações dos drinks, brindes e ações (a escolha fica no aparelho). */
export default function BotaoEfeitosDaCasa({ className }: { className?: string }) {
  const [ligado, setLigado] = useState(efeitosLigados);
  useEffect(() => aoMudarEfeitos(setLigado), []);
  return (
    <button
      type="button"
      onClick={() => ligarEfeitos(!ligado)}
      className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] hover:bg-white/10', ligado ? 'text-white/70' : 'text-white/45', className)}
      aria-label={ligado ? 'Desligar animações' : 'Ligar animações'}
      aria-pressed={ligado}
      title={ligado ? 'Animações ligadas' : 'Animações desligadas'}
      data-testid="botao-efeitos-casa"
    >
      {ligado ? '🎆' : '🎆🚫'}
    </button>
  );
}
