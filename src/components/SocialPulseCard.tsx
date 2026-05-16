/**
 * SocialPulseCard — variable reward "curiosity gap" card for the feed.
 *
 * Psychology:
 * - Shows counts (likesToday, visitorsToday) but hides identities for non-premium
 * - "Ver quem?" CTA creates anticipation and drives profile upgrades
 * - Pulsing dot signals live/real-time data ("happening now")
 * - Only renders when there's something meaningful to show (likesToday > 0 || visitorsToday > 0)
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { feedService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';

interface SocialPulse {
  likesToday: number;
  visitorsToday: number;
  mutualLikes: number;
  unreadNotifs: number;
  recentVisitors: Array<{ id: string; name: string; avatar: string | null }> | null;
  isPremium: boolean;
}

interface SocialPulseCardProps {
  /** Only renders when user is authenticated */
  enabled: boolean;
}

const PULSE_CACHE_TTL_MS = 3 * 60 * 1000; // refresh every 3 min
const PULSE_CACHE_KEY = 'nosigilo:social-pulse-cache';

function readPulseCache(): { data: SocialPulse; fetchedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(PULSE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || !parsed?.fetchedAt) return null;
    return parsed;
  } catch { return null; }
}

export default function SocialPulseCard({ enabled }: SocialPulseCardProps) {
  const [pulse, setPulse] = useState<SocialPulse | null>(() => {
    const cached = readPulseCache();
    if (!cached) return null;
    if (Date.now() - cached.fetchedAt > PULSE_CACHE_TTL_MS) return null;
    return cached.data;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const cached = readPulseCache();
    if (cached && Date.now() - cached.fetchedAt < PULSE_CACHE_TTL_MS) {
      setPulse(cached.data);
      return;
    }
    setLoading(true);
    feedService.getSocialPulse()
      .then((data) => {
        setPulse(data);
        try {
          sessionStorage.setItem(PULSE_CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
        } catch {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  if (!enabled || loading || !pulse) return null;

  const totalActivity = pulse.likesToday + pulse.visitorsToday;
  if (totalActivity === 0 && pulse.unreadNotifs === 0) return null;

  function buildMessage(): string {
    const parts: string[] = [];
    if (pulse!.likesToday > 0) {
      parts.push(
        pulse!.likesToday === 1
          ? '1 pessoa curtiu seu perfil'
          : `${pulse!.likesToday} pessoas curtiram seu perfil`
      );
    }
    if (pulse!.visitorsToday > 0) {
      parts.push(
        pulse!.visitorsToday === 1
          ? '1 pessoa visitou seu perfil'
          : `${pulse!.visitorsToday} pessoas visitaram seu perfil`
      );
    }
    return parts.join(' e ') + ' hoje';
  }

  return (
    <Card className="overflow-hidden glass border-primary/15 bg-gradient-to-r from-primary/8 via-background to-pink-500/6">
      <div className="flex items-center gap-3 p-3.5">
        {/* Pulsing live dot */}
        <div className="relative shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-lg">
            🔥
          </span>
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
        </div>

        <div className="min-w-0 flex-1">
          {totalActivity > 0 ? (
            <>
              <p className="text-sm font-semibold text-foreground leading-snug">
                {buildMessage()}
              </p>
              {/* Curiosity gap: show blurred avatars for non-premium */}
              {pulse.visitorsToday > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  {pulse.recentVisitors && pulse.recentVisitors.length > 0 ? (
                    /* Premium: show real avatars */
                    <div className="flex items-center gap-1">
                      {pulse.recentVisitors.map((v, i) => (
                        <img
                          key={v.id}
                          src={v.avatar ? resolveServerUrl(v.avatar) : '/placeholder.svg'}
                          alt={v.name}
                          className="h-6 w-6 rounded-full object-cover ring-2 ring-background"
                          style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }}
                        />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {pulse.visitorsToday > 3 ? `+${pulse.visitorsToday - 3} mais` : ''}
                      </span>
                    </div>
                  ) : (
                    /* Non-premium: blurred mystery avatars (curiosity gap) */
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(pulse.visitorsToday, 3) }).map((_, i) => (
                        <div
                          key={i}
                          className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/40 to-pink-400/40 ring-2 ring-background blur-[3px]"
                          style={{ marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }}
                        />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {pulse.visitorsToday > 3 ? `+${pulse.visitorsToday - 3} mais` : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-foreground">
              {pulse.unreadNotifs} {pulse.unreadNotifs === 1 ? 'nova notificação' : 'novas notificações'} para você
            </p>
          )}
        </div>

        {/* CTA */}
        <Link
          to={pulse.visitorsToday > 0 ? '/profile/visitors' : '/notifications'}
          className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {pulse.isPremium || pulse.visitorsToday === 0
            ? 'Ver →'
            : 'Ver quem? →'}
        </Link>
      </div>

      {/* Teaser for non-premium with visitors */}
      {!pulse.isPremium && pulse.visitorsToday > 0 && (
        <div className="border-t border-primary/10 bg-primary/4 px-3.5 py-2 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            🔒 Veja quem te visitou com o Premium
          </p>
          <Link
            to="/subscriptions"
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Desbloquear
          </Link>
        </div>
      )}
    </Card>
  );
}
