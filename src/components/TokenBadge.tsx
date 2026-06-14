import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Coins } from 'lucide-react';
import { tokenService } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { cn } from '@/lib/utils';

/** Saldo de tokens em destaque no header (celular + desktop). Clicável → /tokens. */
export default function TokenBadge({ className }: { className?: string }) {
  const [points, setPoints] = useState<number | null>(null);
  const { on, off } = useSocket();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      tokenService.me().then((s) => { if (!cancelled) setPoints(s.points); }).catch(() => {});
    };
    load();

    // Atualização via evento local (outras abas, chamadas manuais)
    window.addEventListener('nosigilo:tokens-updated', load);

    // Atualização em tempo real via socket (backend emite após cada ação pontuada)
    const handleSocket = (data: { points: number }) => {
      if (!cancelled) setPoints(data.points);
    };
    on('tokens.updated', handleSocket);

    return () => {
      cancelled = true;
      window.removeEventListener('nosigilo:tokens-updated', load);
      off('tokens.updated', handleSocket);
    };
  }, [on, off]);

  if (points === null) return null;

  return (
    <NavLink
      to="/tokens"
      title="Seus tokens"
      aria-label={`${points} tokens`}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-400/20',
        className
      )}
    >
      <Coins className="h-3.5 w-3.5" />
      {points}
    </NavLink>
  );
}
