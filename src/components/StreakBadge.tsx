/**
 * StreakBadge — displays the user's daily action streak.
 *
 * Color tiers (per spec):
 *   1–6   → small flame, gray/pink
 *   7–29  → medium flame, orange
 *   30+   → large flame, gold pulsating
 *
 * Listens to 'nosigilo:streak-updated' events from ActivityTrackerContext
 * so the badge updates live when a qualifying action is performed.
 */
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { StreakState } from '@/hooks/useDailyCheckin';
import { cn } from '@/lib/utils';

interface StreakBadgeProps {
  streak: StreakState;
  /** compact: just the fire + number, no extra text */
  compact?: boolean;
  className?: string;
}

function getTier(n: number): 'small' | 'medium' | 'large' {
  if (n >= 30) return 'large';
  if (n >= 7)  return 'medium';
  return 'small';
}

function getFlame(n: number): string {
  if (n >= 30) return '🔥🔥🔥';
  if (n >= 7)  return '🔥🔥';
  return '🔥';
}

const TIER_CLASSES: Record<'small' | 'medium' | 'large', string> = {
  small:  'bg-primary/10 text-primary',
  medium: 'bg-orange-500/12 text-orange-500',
  large:  'bg-yellow-500/15 text-yellow-500 animate-pulse-slow',
};

const MILESTONE_TOASTS: Record<number, string> = {
  3:  '3 dias seguidos! Está pegando o ritmo 🔥',
  7:  'Uma semana de sequência! Você está dominando 🔥🔥',
  14: '14 dias! Você é um frequentador VIP 🏆',
  30: 'Um mês inteiro! Incrível 🏅',
  60: '60 dias de sequência — você é lendário 👑',
};

export default function StreakBadge({ streak, compact = false, className }: StreakBadgeProps) {
  const { toast } = useToast();
  const celebratedRef = useRef(false);
  const [liveStreak, setLiveStreak] = useState(streak.streak);

  // Listen for live updates from ActivityTrackerContext
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ streak: number }>).detail;
      if (detail?.streak) setLiveStreak(detail.streak);
    };
    window.addEventListener('nosigilo:streak-updated', handler);
    return () => window.removeEventListener('nosigilo:streak-updated', handler);
  }, []);

  // Sync from prop when it changes (initial load)
  useEffect(() => {
    if (streak.streak > 0) setLiveStreak(streak.streak);
  }, [streak.streak]);

  // Milestone celebration toast (only once per session)
  useEffect(() => {
    if (!streak.loaded || celebratedRef.current) return;
    if (!streak.isNewDay) return;
    const msg = MILESTONE_TOASTS[streak.streak];
    if (msg) {
      celebratedRef.current = true;
      setTimeout(() => toast({ title: '🔥 Nova sequência!', description: msg }), 1200);
    }
  }, [streak.loaded, streak.isNewDay, streak.streak, toast]);

  if (!streak.loaded || liveStreak < 1) return null;

  const tier = getTier(liveStreak);
  const flame = getFlame(liveStreak);

  if (compact) {
    return (
      <span
        title={`${liveStreak} dias seguidos`}
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
          TIER_CLASSES[tier],
          className
        )}
      >
        {flame} {liveStreak}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold select-none',
        TIER_CLASSES[tier],
        className
      )}
    >
      <span className={cn('text-base', tier === 'large' && 'animate-pulse-slow')}>{flame}</span>
      <span>{liveStreak} {liveStreak === 1 ? 'dia' : 'dias'}</span>
      {liveStreak >= 7 && (
        <span className="text-[10px] font-semibold opacity-60 uppercase tracking-wide">seguidos</span>
      )}
    </div>
  );
}
