import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Calendar, MapPin } from 'lucide-react';
import { nearbyActivityService, type NearbyRadar, type NearbyEvent } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';

function formatDistance(d: number | null): string | null {
  if (d === null || !Number.isFinite(d) || d < 0) return null;
  if (d < 1) return '< 1 km';
  return `${d.toLocaleString('pt-BR', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;
}

function formatEventDate(date: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Faixa "Perto de você" no topo do feed: radares ativos e eventos compatíveis. */
export default function NearbyActivityStrip() {
  const navigate = useNavigate();
  const [radars, setRadars] = useState<NearbyRadar[]>([]);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    nearbyActivityService.get()
      .then((d) => { if (!cancelled) { setRadars(d.radars || []); setEvents(d.events || []); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || (radars.length === 0 && events.length === 0)) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Perto de você</h2>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {radars.map((r) => (
          <button
            key={`r-${r.id}`}
            type="button"
            onClick={() => navigate('/radar')}
            className="flex w-44 shrink-0 flex-col gap-1.5 rounded-xl border border-primary/25 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                <Radio className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Radar ativo</span>
            </div>
            <p className="line-clamp-2 text-xs text-foreground/90">{r.message}</p>
            <div className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">{r.senderName}</span>
              {formatDistance(r.distanceKm) && <span>· {formatDistance(r.distanceKm)}</span>}
            </div>
          </button>
        ))}

        {events.map((e) => (
          <button
            key={`e-${e.id}`}
            type="button"
            onClick={() => navigate('/events')}
            className="flex w-44 shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-left transition-colors hover:bg-amber-400/10"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/20 text-amber-500">
                <Calendar className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-500">Evento</span>
              {e.date && <span className="ml-auto text-[11px] font-medium text-amber-500">{formatEventDate(e.date)}</span>}
            </div>
            {e.coverImage ? (
              <img
                src={resolveServerUrl(e.coverImage)}
                alt=""
                className="h-16 w-full rounded-lg object-cover"
                loading="lazy"
              />
            ) : null}
            <p className="line-clamp-1 text-xs font-semibold text-foreground/90">{e.title}</p>
            <div className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{e.location}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
