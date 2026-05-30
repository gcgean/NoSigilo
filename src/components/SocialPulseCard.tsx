/**
 * SocialPulseCard — variable reward "curiosity gap" card for the feed.
 *
 * Psychology:
 * - Shows counts (likesToday, visitorsToday) but hides identities for non-premium
 * - Blurred avatars create the "I know someone is there" tension
 * - "Ver quem?" CTA creates anticipation and drives profile upgrades
 * - Pulsing dot signals live/real-time data ("happening now")
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { feedService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

interface SocialPulse {
  likesToday: number;
  visitorsToday: number;
  mutualLikes: number;
  unreadNotifs: number;
  recentVisitors: Array<{ id: string; name: string; avatar: string | null }> | null;
  recentLikers: Array<{ id: string; name: string; avatar: string | null }> | null;
  isPremium: boolean;
}

interface SocialPulseCardProps {
  enabled: boolean;
}

const PULSE_CACHE_TTL_MS = 3 * 60 * 1000;
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

function BlurredAvatarStack({ count, avatars, premium }: {
  count: number;
  avatars: Array<{ id: string; avatar: string | null; name: string }> | null;
  premium: boolean;
}) {
  const shown = Math.min(count, 3);
  const extra = count - 3;

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: shown }).map((_, i) => {
        const user = avatars?.[i];
        return (
          <div
            key={i}
            className="relative h-7 w-7 rounded-full ring-2 ring-background overflow-hidden"
            style={{ marginLeft: i > 0 ? -10 : 0, zIndex: shown - i }}
          >
            {premium && user ? (
              <img
                src={user.avatar ? resolveServerUrl(user.avatar) : '/placeholder.svg'}
                alt={user.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                {/* Background gradient to suggest a real photo */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/50 via-pink-400/40 to-rose-500/50" />
                {/* Blur overlay */}
                <div className="absolute inset-0 backdrop-blur-sm bg-black/10" />
                {/* Lock icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[8px] text-white/80">🔒</span>
                </div>
              </>
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground">+{extra}</span>
      )}
    </div>
  );
}

export default function SocialPulseCard({ enabled }: SocialPulseCardProps) {
  const [pulse, setPulse] = useState<SocialPulse | null>(() => {
    const cached = readPulseCache();
    if (!cached || Date.now() - cached.fetchedAt > PULSE_CACHE_TTL_MS) return null;
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

  const hasLikes = pulse.likesToday > 0;
  const hasVisitors = pulse.visitorsToday > 0;

  return (
    <Card className="overflow-hidden glass border-primary/15 bg-gradient-to-r from-primary/8 via-background to-pink-500/6">
      <div className="p-3.5 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="relative shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/12 text-lg">🔥</span>
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-snug">
              Atividade no seu perfil hoje
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                hasLikes && `${pulse.likesToday} curtida${pulse.likesToday > 1 ? 's' : ''}`,
                hasVisitors && `${pulse.visitorsToday} visita${pulse.visitorsToday > 1 ? 's' : ''}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {/* Likes section */}
        {hasLikes && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">❤️</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {pulse.likesToday === 1
                      ? '1 pessoa curtiu você'
                      : `${pulse.likesToday} pessoas curtiram você`}
                  </p>
                  {!pulse.isPremium && (
                    <p className="text-[10px] text-muted-foreground">
                      🔒 Assine para ver quem
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BlurredAvatarStack
                  count={pulse.likesToday}
                  avatars={pulse.recentLikers}
                  premium={pulse.isPremium}
                />
                <Link
                  to="/profile/visitors"
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-opacity hover:opacity-80',
                    pulse.isPremium
                      ? 'bg-rose-500 text-white'
                      : 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30'
                  )}
                >
                  {pulse.isPremium ? 'Ver →' : 'Desbloquear'}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Visitors section */}
        {hasVisitors && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-base shrink-0">👁️</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {pulse.visitorsToday === 1
                      ? '1 pessoa visitou seu perfil'
                      : `${pulse.visitorsToday} visitaram seu perfil`}
                  </p>
                  {!pulse.isPremium && (
                    <p className="text-[10px] text-muted-foreground">
                      🔒 Assine para ver quem
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <BlurredAvatarStack
                  count={pulse.visitorsToday}
                  avatars={pulse.recentVisitors}
                  premium={pulse.isPremium}
                />
                <Link
                  to="/profile/visitors"
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-opacity hover:opacity-80',
                    pulse.isPremium
                      ? 'bg-primary text-white'
                      : 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  )}
                >
                  {pulse.isPremium ? 'Ver →' : 'Desbloquear'}
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Upgrade nudge for non-premium */}
        {!pulse.isPremium && (hasLikes || hasVisitors) && (
          <Link
            to="/subscriptions"
            className="flex items-center justify-between rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 hover:bg-amber-500/12 transition-colors"
          >
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              ✨ Assine o Premium e veja quem te curtiu e visitou
            </p>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0 ml-2">Ver planos →</span>
          </Link>
        )}
      </div>
    </Card>
  );
}
