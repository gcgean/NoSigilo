/**
 * useDailyCheckin — runs once per session on mount.
 * Calls POST /api/users/daily-checkin, stores the result,
 * and returns streak info for display throughout the app.
 */
import { useEffect, useState } from 'react';
import { feedService } from '@/services/api';

export interface StreakState {
  streak: number;
  maxStreak: number;
  isNewDay: boolean;
  streakBroken: boolean;
  loaded: boolean;
}

const SESSION_KEY = 'nosigilo:streak-session';

function readCached(): StreakState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StreakState;
  } catch {
    return null;
  }
}

export function useDailyCheckin(enabled: boolean): StreakState {
  const [state, setState] = useState<StreakState>(() => {
    const cached = readCached();
    return cached ?? { streak: 0, maxStreak: 0, isNewDay: false, streakBroken: false, loaded: false };
  });

  useEffect(() => {
    if (!enabled) return;
    // Already done this session
    const cached = readCached();
    if (cached?.loaded) {
      setState(cached);
      return;
    }

    feedService.dailyCheckin()
      .then((data) => {
        const next: StreakState = { ...data, loaded: true };
        setState(next);
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
      })
      .catch(() => {
        setState((prev) => ({ ...prev, loaded: true }));
      });
  }, [enabled]);

  return state;
}
