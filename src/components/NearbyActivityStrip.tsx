import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import { nearbyActivityService, type NearbyEvent } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';

function formatEventDate(date: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/**
 * Faixa "Perto de você" no topo do feed: eventos compatíveis.
 * Radares saíram daqui (pedido do dono): quem recebe um radar já tem a
 * mensagem no chat e a página /radar.
 */
export default function NearbyActivityStrip() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    nearbyActivityService.get()
      .then((d) => { if (!cancelled) setEvents(d.events || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || events.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Perto de você</h2>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {events.map((e) => (
          <button
            key={`e-${e.id}`}
            type="button"
            onClick={() => navigate(`/events?evento=${encodeURIComponent(e.id)}`)}
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
