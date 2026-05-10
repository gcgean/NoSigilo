import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin, Users, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { eventsService } from '@/services/api';

type EventSummary = {
  id: string;
  title: string;
  date: string;
  location: string;
  attendees: number;
  maxAttendees: number;
  eventType: string;
  createdBy?: string;
};

const EVENT_TYPE_ICON: Record<string, string> = {
  party: '🎉', meetup: '👋', travel: '✈️', dinner: '🍷',
  club: '🪩', beach: '🏖️', private: '🔒',
};

const DISMISSED_KEY = 'nosigilo:event-promo-dismissed';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function EventPromoCard({ userId }: { userId: string }) {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const key = `${DISMISSED_KEY}:${userId}`;
    if (sessionStorage.getItem(key) === '1') {
      setDismissed(true);
      return;
    }

    eventsService.getEvents({ myEvents: true, upcoming: true })
      .then((data: any[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcoming = data
          .filter((e) => e?.date && new Date(e.date) >= today)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (upcoming[0]) setEvent(upcoming[0] as EventSummary);
      })
      .catch(() => {/* noop */});
  }, [userId]);

  if (!event || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(`${DISMISSED_KEY}:${userId}`, '1');
    setDismissed(true);
  }

  const icon = EVENT_TYPE_ICON[event.eventType] ?? '📅';
  const spotsLeft = event.maxAttendees - event.attendees;

  return (
    <div className="mb-4 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 via-rose-500/6 to-orange-400/6 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
            Seu evento
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h3 className="font-semibold text-sm truncate">{event.title}</h3>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar size={11} /> {formatDate(event.date)}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {event.location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users size={11} /> {event.attendees} confirmados
              {spotsLeft > 0 && ` · ${spotsLeft} vagas`}
            </span>
          </div>
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          aria-label="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="bg-gradient-primary hover:opacity-90 text-white text-xs h-8 px-4">
          <Link to="/events">
            Ver evento <ChevronRight size={13} className="ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
