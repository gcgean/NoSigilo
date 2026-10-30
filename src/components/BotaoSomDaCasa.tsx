import { useEffect, useState } from 'react';
import { aoMudarSom, ligarSom, somLigado, tocarSomDaCasa } from '@/utils/somDaCasa';
import { cn } from '@/lib/utils';

/** Liga/desliga os sons dos efeitos da Casa (a escolha fica guardada no aparelho). */
export default function BotaoSomDaCasa({ className }: { className?: string }) {
  const [ligado, setLigado] = useState(somLigado);
  useEffect(() => aoMudarSom(setLigado), []);
  return (
    <button
      type="button"
      onClick={() => { const v = !ligado; ligarSom(v); if (v) void tocarSomDaCasa('chegou'); }}
      className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] hover:bg-white/10', ligado ? 'text-white/70' : 'text-white/45', className)}
      aria-label={ligado ? 'Desligar sons dos efeitos' : 'Ligar sons dos efeitos'}
      title={ligado ? 'Sons dos efeitos ligados' : 'Sons dos efeitos desligados'}
    >
      {ligado ? '✨🔈' : '✨🔇'}
    </button>
  );
}
