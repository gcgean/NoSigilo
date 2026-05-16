/**
 * ActivityTrackerContext
 *
 * Provides `registerActivity(action)` throughout the app.
 * Call it whenever a qualifying action happens (like, comment, post, etc.).
 *
 * Psychology:
 * - One API call per session maximum (cached in sessionStorage)
 * - Toast appears immediately after the first qualifying action of the day
 * - Subsequent calls in the same session are instant no-ops (no API cost)
 *
 * Qualifying actions (any ONE per day):
 *   like | comment | message | post | radar | match_view | reel | chat_start | event_confirm | invite
 */
import React, { createContext, useCallback, useContext, useRef } from 'react';
import { feedService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

export type ActivityAction =
  | 'like'
  | 'comment'
  | 'message'
  | 'post'
  | 'radar'
  | 'match_view'
  | 'reel'
  | 'chat_start'
  | 'event_confirm'
  | 'invite';

interface ActivityTrackerContextType {
  registerActivity: (action: ActivityAction) => void;
  getStreak: () => number;
}

const ActivityTrackerContext = createContext<ActivityTrackerContextType>({
  registerActivity: () => {},
  getStreak: () => 0,
});

const SESSION_KEY = 'nosigilo:activity-registered';
const STREAK_KEY  = 'nosigilo:streak-session';

interface CachedStreak {
  streak: number;
  maxStreak: number;
  loaded: boolean;
  streakBroken: boolean;
  isNewDay: boolean;
}

function readStreakCache(): CachedStreak | null {
  try {
    const raw = sessionStorage.getItem(STREAK_KEY);
    return raw ? (JSON.parse(raw) as CachedStreak) : null;
  } catch { return null; }
}

function writeStreakCache(data: CachedStreak) {
  try { sessionStorage.setItem(STREAK_KEY, JSON.stringify(data)); } catch {}
}

function flameLabel(streak: number): string {
  if (streak >= 30) return '🔥🔥🔥';
  if (streak >= 7)  return '🔥🔥';
  return '🔥';
}

export function ActivityTrackerProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const inflightRef = useRef(false);
  const streakRef = useRef<number>(readStreakCache()?.streak ?? 0);

  const registerActivity = useCallback((action: ActivityAction) => {
    // Already registered this session — instant no-op
    if (sessionStorage.getItem(SESSION_KEY) === '1') return;
    if (inflightRef.current) return;
    inflightRef.current = true;

    feedService.registerActivity(action)
      .then((data) => {
        if (data.alreadyDoneToday) {
          // Mark session as done even if today was already registered
          sessionStorage.setItem(SESSION_KEY, '1');
          streakRef.current = data.streak;
          return;
        }

        sessionStorage.setItem(SESSION_KEY, '1');
        streakRef.current = data.streak;

        // Update streak cache so StreakBadge shows correct value
        const cache = readStreakCache();
        writeStreakCache({
          streak: data.streak,
          maxStreak: data.maxStreak,
          loaded: true,
          streakBroken: data.streakBroken,
          isNewDay: data.streakRegistered,
        });

        if (data.streakRegistered) {
          const flame = flameLabel(data.streak);
          if (data.streakBroken) {
            toast({
              title: 'Sequência reiniciada',
              description: `Mas você voltou! Nova sequência: ${flame} 1 dia`,
            });
          } else {
            toast({
              title: `✅ Presença de hoje registrada!`,
              description: `Sequência: ${flame} ${data.streak} ${data.streak === 1 ? 'dia' : 'dias seguidos'}`,
            });
          }
        }

        // Sync streak badge by dispatching a custom event
        window.dispatchEvent(new CustomEvent('nosigilo:streak-updated', { detail: { streak: data.streak } }));
      })
      .catch(() => {})
      .finally(() => { inflightRef.current = false; });
  }, [toast]);

  const getStreak = useCallback(() => streakRef.current, []);

  return (
    <ActivityTrackerContext.Provider value={{ registerActivity, getStreak }}>
      {children}
    </ActivityTrackerContext.Provider>
  );
}

export function useActivityTracker() {
  return useContext(ActivityTrackerContext);
}
