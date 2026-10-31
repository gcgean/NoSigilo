import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Botões flutuantes do chat d'A Casa: "@ te responderam" e "⬇ N novas" (ver useRolagemDoChat). */
export function BotoesDeNovas({ noFim, novas, mencao, onFim, onMencao }: {
  noFim: boolean; novas: number; mencao: string | null; onFim: () => void; onMencao: () => void;
}) {
  if (noFim && !mencao) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-2">
      {mencao && (
        <button type="button" onClick={onMencao}
          className="pointer-events-auto rounded-full bg-fuchsia-600 px-3 py-1.5 text-xs font-bold shadow-lg ring-1 ring-fuchsia-300/60">
          @ te responderam
        </button>
      )}
      {!noFim && (
        <button type="button" onClick={onFim} aria-label={novas > 0 ? `${novas} mensagens novas` : 'Ir para o fim'}
          className="pointer-events-auto relative flex h-10 items-center gap-1 rounded-full bg-zinc-900/95 px-3 text-xs font-semibold shadow-lg ring-1 ring-white/15">
          <ChevronDown className="h-4 w-4" />
          {novas > 0 && <span>{novas > 99 ? '99+' : novas} nova{novas === 1 ? '' : 's'}</span>}
        </button>
      )}
    </div>
  );
}

export function LinhaNaoLidas() {
  return (
    <div className="my-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-amber-300">
      <span className="h-px flex-1 bg-amber-300/40" />
      Mensagens não lidas
      <span className="h-px flex-1 bg-amber-300/40" />
    </div>
  );
}

/** Citação clicável: leva até a mensagem respondida. */
export function Citacao({ nome, trecho, onIr, className, nomeClassName }: {
  nome: string; trecho: string; onIr: () => void; className?: string; nomeClassName?: string;
}) {
  return (
    <button type="button" onClick={onIr} title="Ir para a mensagem"
      className={cn('mb-1 block w-full truncate rounded-lg border-l-2 px-2 py-1 text-left text-[11px] active:opacity-70', className)}>
      <b className={nomeClassName}>{nome}</b> · {trecho}
    </button>
  );
}

/**
 * Arrastar a mensagem para a direita responde (como no WhatsApp). Só no toque;
 * movimento mais vertical que horizontal é rolagem e não conta.
 */
export function ArrastaParaResponder({ ativo, onResponder, destacada, children, className, ...resto }: {
  ativo: boolean; onResponder: () => void; destacada?: boolean; children: ReactNode; className?: string;
  'data-msg-id'?: string;
}) {
  const inicio = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const [dx, setDx] = useState(0);
  const LIMITE = 56;
  return (
    <div
      {...resto}
      className={cn('relative rounded-2xl transition-all duration-500', destacada && 'bg-amber-300/30 ring-2 ring-amber-400', className)}
      onTouchStart={ativo ? (e) => { const t = e.touches[0]; inicio.current = { x: t.clientX, y: t.clientY, horizontal: null }; } : undefined}
      onTouchMove={ativo ? (e) => {
        const i = inicio.current;
        if (!i) return;
        const t = e.touches[0];
        const mx = t.clientX - i.x;
        const my = t.clientY - i.y;
        if (i.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) i.horizontal = Math.abs(mx) > Math.abs(my);
        if (i.horizontal) setDx(Math.max(0, Math.min(mx, LIMITE + 20)));
      } : undefined}
      onTouchEnd={ativo ? () => {
        if (dx >= LIMITE) { onResponder(); try { navigator.vibrate?.(15); } catch { /* sem vibração */ } }
        inicio.current = null;
        setDx(0);
      } : undefined}
    >
      {dx > 0 && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-lg" style={{ opacity: Math.min(1, dx / LIMITE) }}>↩️</span>
      )}
      <div style={dx ? { transform: `translateX(${dx}px)` } : undefined} className={cn(!dx && 'transition-transform')}>
        {children}
      </div>
    </div>
  );
}
