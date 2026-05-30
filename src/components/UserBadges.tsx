import { cn } from '@/lib/utils';

export type BadgeType =
  | 'verified'
  | 'veteran'
  | 'photographer'
  | 'popular'
  | 'active'
  | 'connected'
  | 'quick_reply'
  | 'event_goer'
  | 'premium'
  | 'ambassador'
  | 'ambassador_gold'
  | 'ambassador_elite';

const BADGE_META: Record<BadgeType, { emoji: string; label: string; color: string }> = {
  verified:         { emoji: '✅', label: 'Perfil Verificado',    color: 'bg-sky-500/15 text-sky-400 ring-sky-500/30' },
  popular:          { emoji: '🔥', label: 'Top da Região',        color: 'bg-rose-500/15 text-rose-400 ring-rose-500/30' },
  active:           { emoji: '⚡', label: 'Perfil Ativo',         color: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' },
  quick_reply:      { emoji: '💬', label: 'Responde Rápido',      color: 'bg-violet-500/15 text-violet-400 ring-violet-500/30' },
  photographer:     { emoji: '📸', label: 'Fotógrafo(a)',         color: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
  veteran:          { emoji: '🏅', label: 'Veterano(a)',          color: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30' },
  connected:        { emoji: '🤝', label: 'Bem Conectado(a)',     color: 'bg-teal-500/15 text-teal-400 ring-teal-500/30' },
  event_goer:       { emoji: '🎉', label: 'Participante de Evento', color: 'bg-fuchsia-500/15 text-fuchsia-400 ring-fuchsia-500/30' },
  premium:          { emoji: '👑', label: 'Premium',              color: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30' },
  ambassador:       { emoji: '🌟', label: 'Embaixador(a)',        color: 'bg-primary/15 text-primary ring-primary/30' },
  ambassador_gold:  { emoji: '⭐', label: 'Embaixador(a) Gold',  color: 'bg-yellow-500/15 text-yellow-400 ring-yellow-500/30' },
  ambassador_elite: { emoji: '💎', label: 'Embaixador(a) Elite', color: 'bg-cyan-500/15 text-cyan-400 ring-cyan-500/30' },
};

// Priority order — most impressive first
const BADGE_ORDER: BadgeType[] = [
  'verified', 'popular', 'active', 'premium', 'ambassador_elite',
  'ambassador_gold', 'ambassador', 'quick_reply', 'connected',
  'event_goer', 'photographer', 'veteran',
];

interface UserBadgesProps {
  badges?: string[] | null;
  ambassadorBadges?: string[] | null;
  /** Max number of badges to show before collapsing. Default: all */
  max?: number;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Show full label (md) or just emoji (sm) */
}

export default function UserBadges({
  badges,
  ambassadorBadges,
  max,
  size = 'sm',
}: UserBadgesProps) {
  const all = new Set<string>([
    ...(badges ?? []),
    ...(ambassadorBadges ?? []),
  ]);

  if (all.size === 0) return null;

  // Sort by priority
  const sorted = BADGE_ORDER.filter((b) => all.has(b));
  // Include any unknown badge types at the end
  for (const b of all) {
    if (!sorted.includes(b as BadgeType)) sorted.push(b as BadgeType);
  }

  const shown = max ? sorted.slice(0, max) : sorted;
  const hidden = max ? sorted.length - shown.length : 0;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((badge) => {
        const meta = BADGE_META[badge as BadgeType];
        if (!meta) return null;

        if (size === 'sm') {
          return (
            <span
              key={badge}
              title={meta.label}
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                meta.color
              )}
            >
              {meta.emoji}
            </span>
          );
        }

        return (
          <span
            key={badge}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
              meta.color
            )}
          >
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </span>
        );
      })}

      {hidden > 0 && (
        <span className="text-[10px] text-muted-foreground">+{hidden}</span>
      )}
    </div>
  );
}
