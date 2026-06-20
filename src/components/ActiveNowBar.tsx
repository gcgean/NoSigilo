import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { radarService, type ActiveNowProfile } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

const REASON_LABEL: Record<ActiveNowProfile['reason'], string> = {
  posted: 'postou',
  radar: 'no radar',
  online: 'online',
};

/**
 * Fila horizontal "Ativos agora": perfis que postaram, usaram o Radar ou
 * estiveram online nas últimas 2h, perto de você. Cada avatar leva ao perfil.
 */
export default function ActiveNowBar({ maxDistanceKm }: { maxDistanceKm?: number | null }) {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ActiveNowProfile[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await radarService.getActiveNow(
        maxDistanceKm != null ? { maxDistanceKm } : undefined,
      );
      setProfiles(res.profiles);
    } catch {
      setProfiles([]);
    } finally {
      setLoaded(true);
    }
  }, [maxDistanceKm]);

  useEffect(() => { void load(); }, [load]);

  // Não ocupa espaço enquanto carrega nem quando não há ninguém ativo
  if (!loaded || profiles.length === 0) return null;

  return (
    <div className="mb-3 sm:mb-4">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ativos agora</span>
        <span className="text-xs text-muted-foreground/60">· últimas 2h</span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => navigate(`/users/${p.id}`)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
            title={`${p.name}${p.distanceKm != null ? ` · ${p.distanceKm < 1 ? '< 1' : p.distanceKm} km` : ''}`}
          >
            <div className="relative">
              <div className={cn(
                'h-16 w-16 rounded-full p-[2px]',
                p.isOnline ? 'bg-gradient-to-tr from-emerald-400 to-teal-500' : 'bg-muted',
              )}>
                <div className="h-full w-full rounded-full bg-background p-[2px]">
                  {p.avatar ? (
                    <img src={resolveServerUrl(p.avatar)} alt={p.name} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-secondary text-sm font-bold">
                      {p.name[0]}
                    </div>
                  )}
                </div>
              </div>
              {p.isOnline && (
                <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-emerald-500" />
              )}
            </div>
            <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-foreground">{p.name}</span>
            <span className="w-full truncate text-center text-[9px] leading-none text-muted-foreground">
              {p.distanceKm != null ? `${p.distanceKm < 1 ? '< 1' : p.distanceKm} km` : REASON_LABEL[p.reason]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
