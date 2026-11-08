import { useEffect, useState } from 'react';
import { textoDistancia } from '@/utils/distancia';
import { useNavigate } from 'react-router-dom';
import { Radio, Calendar, MapPin, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { nearbyActivityService, type NearbyRadar, type NearbyEvent } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';

function formatEventDate(date: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Foto de quem ativou o radar (ou um ícone, se o radar for discreto) com o selo do radar. */
function BolhaDoRadar({ radar, onAbrir }: { radar: NearbyRadar; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-[76px] shrink-0 flex-col items-center gap-1 text-center"
      aria-label={`${radar.senderName || 'Um perfil discreto'} está procurando alguém como você. Toque para ver a mensagem.`}
    >
      <span className="relative">
        <span className="block rounded-full bg-gradient-to-tr from-primary via-fuchsia-500 to-amber-400 p-[2.5px]">
          <span className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted">
            {radar.senderAvatar ? (
              <img src={resolveServerUrl(radar.senderAvatar)} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <User className="h-7 w-7 text-muted-foreground" />
            )}
          </span>
        </span>
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
        </span>
      </span>
      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground/80">Procura alguém como você</span>
    </button>
  );
}

/**
 * Faixa "Perto de você" no topo do feed. Radar aparece só como a foto de quem
 * ativou + selo do radar ("procura alguém como você"); a mensagem abre ao tocar.
 * Eventos continuam como cartões.
 */
export default function NearbyActivityStrip() {
  const navigate = useNavigate();
  const [radars, setRadars] = useState<NearbyRadar[]>([]);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [aberto, setAberto] = useState<NearbyRadar | null>(null);

  useEffect(() => {
    let cancelled = false;
    nearbyActivityService.get()
      .then((d) => { if (!cancelled) { setRadars(d.radars || []); setEvents(d.events || []); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  if (!loaded || (radars.length === 0 && events.length === 0)) return null;

  const nomeDoAberto = aberto ? aberto.senderName || 'Um perfil discreto' : '';
  const distanciaDoAberto = aberto ? textoDistancia(aberto.distanceKm) : null;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 px-1">
        <MapPin className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold">Perto de você</h2>
      </div>
      <div className="flex items-start gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {radars.map((r) => (
          <BolhaDoRadar key={`r-${r.id}`} radar={r} onAbrir={() => setAberto(r)} />
        ))}

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

      <Dialog open={!!aberto} onOpenChange={(v) => { if (!v) setAberto(null); }}>
        <DialogContent className="max-w-[92vw] sm:max-w-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {aberto?.senderAvatar ? (
                <img src={resolveServerUrl(aberto.senderAvatar)} alt="" className="h-full w-full object-cover" />
              ) : (
                <User className="h-6 w-6 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">{nomeDoAberto}</DialogTitle>
              <DialogDescription className="flex items-center gap-1 text-xs">
                <Radio className="h-3.5 w-3.5 text-primary" /> Ativou o radar procurando alguém como você
                {distanciaDoAberto ? ` · ${distanciaDoAberto}` : ''}
              </DialogDescription>
            </div>
          </div>
          <p className="whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-3 text-sm leading-6">{aberto?.message}</p>
          <Button className="h-11 w-full" onClick={() => { setAberto(null); navigate('/radar'); }}>
            Ver no Radar e responder
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
