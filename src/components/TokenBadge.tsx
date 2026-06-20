import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { tokenService } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type TokensUpdated = { points: number; gained?: number; action?: string; freeDaysGranted?: number };

/** Saldo de tokens em destaque no header (celular + desktop). Clicável → /tokens.
 *  Anima discretamente cada token ganho e celebra a cada dia grátis (100 tokens). */
export default function TokenBadge({ className }: { className?: string }) {
  const [points, setPoints] = useState<number | null>(null);
  const [floatItem, setFloatItem] = useState<{ key: number; amount: number } | null>(null);
  const [pulse, setPulse] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const floatKeyRef = useRef(0);
  const { on, off } = useSocket();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      tokenService.me().then((s) => { if (!cancelled) setPoints(s.points); }).catch(() => {});
    };
    load();

    // Atualização via evento local (outras abas, chamadas manuais) — sem animação
    window.addEventListener('nosigilo:tokens-updated', load);

    // Tempo real via socket: saldo + ganho (delta) + dias grátis concedidos
    const handleSocket = (data: TokensUpdated) => {
      if (cancelled) return;
      setPoints(data.points);

      const gained = Number(data?.gained || 0);
      if (gained > 0) {
        floatKeyRef.current += 1;
        const key = floatKeyRef.current;
        setFloatItem({ key, amount: gained });
        setPulse(true);
        window.setTimeout(() => setPulse(false), 420);
        window.setTimeout(() => setFloatItem((f) => (f && f.key === key ? null : f)), 1100);
      }

      if (Number(data?.freeDaysGranted || 0) > 0) {
        setCelebrate(true);
        window.setTimeout(() => setCelebrate(false), 1700);
        toast({
          title: '🎉 +1 dia grátis desbloqueado!',
          description: 'Você acumulou 100 tokens e ganhou 1 dia de acesso. Continue interagindo para ganhar mais!',
        });
      }
    };
    on('tokens.updated', handleSocket);

    return () => {
      cancelled = true;
      window.removeEventListener('nosigilo:tokens-updated', load);
      off('tokens.updated', handleSocket);
    };
  }, [on, off, toast]);

  if (points === null) return null;

  return (
    <div className={cn('relative shrink-0', className)}>
      <NavLink
        to="/tokens"
        title="Seus tokens"
        aria-label={`${points} tokens`}
        className={cn(
          'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-all',
          celebrate
            ? 'border-amber-300 bg-amber-400/25 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.75)] ring-2 ring-amber-300/70'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20'
        )}
        style={pulse || celebrate ? { animation: 'token-pop 0.42s ease-out' } : undefined}
      >
        <Coins className="h-3.5 w-3.5" />
        {points}
      </NavLink>

      {/* "+N" discreto subindo a cada token ganho */}
      {floatItem && (
        <span
          key={floatItem.key}
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[11px] font-extrabold text-amber-300 drop-shadow"
          style={{ animation: 'token-float 1s ease-out forwards' }}
        >
          +{floatItem.amount}
        </span>
      )}

      {/* Brilho extra na celebração dos 100 tokens */}
      {celebrate && (
        <span
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-amber-300/80"
          style={{ animation: 'token-burst 1.6s ease-out forwards' }}
        />
      )}
    </div>
  );
}
