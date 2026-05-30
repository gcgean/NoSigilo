import { useEffect, useState, useCallback } from 'react';
import { Trophy, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { missionsService } from '@/services/api';
import { cn } from '@/lib/utils';

type Mission = {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  completed: boolean;
  reward: string;
  rewardIcon: string;
};

type MissionsData = {
  missions: Mission[];
  completedCount: number;
  totalCount: number;
};

export default function DailyMissions() {
  const [data, setData] = useState<MissionsData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [newlyCompleted, setNewlyCompleted] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const result = await missionsService.getToday();
      setData((prev) => {
        if (prev) {
          // Detect newly completed missions to animate them
          const justDone = result.missions
            .filter((m) => m.completed && !prev.missions.find((pm) => pm.id === m.id)?.completed)
            .map((m) => m.id);
          if (justDone.length > 0) {
            setNewlyCompleted((s) => {
              const next = new Set(s);
              justDone.forEach((id) => next.add(id));
              return next;
            });
            // Clear animation after 2s
            setTimeout(() => {
              setNewlyCompleted((s) => {
                const next = new Set(s);
                justDone.forEach((id) => next.delete(id));
                return next;
              });
            }, 2000);
          }
        }
        return result;
      });
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh every 60s to pick up progress made on other tabs/actions
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  if (!data) return null;

  const { missions, completedCount, totalCount } = data;
  const allDone = completedCount === totalCount;
  const pct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/8 via-background to-rose-500/5 overflow-hidden glass">
      {/* Header — always visible */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-lg">
          {allDone ? '🏆' : '⚡'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Missões do dia</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold',
              allDone
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-primary/15 text-primary'
            )}>
              {completedCount}/{totalCount}
            </span>
          </div>
          {/* Mini progress bar */}
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/10">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-700',
                allDone ? 'bg-emerald-400' : 'bg-gradient-to-r from-primary to-rose-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded mission list */}
      {isOpen && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-2.5">
          {missions.map((m) => {
            const isNew = newlyCompleted.has(m.id);
            const barPct = m.target > 0 ? Math.round((m.progress / m.target) * 100) : 0;

            return (
              <div
                key={m.id}
                className={cn(
                  'rounded-xl border p-3 transition-all duration-300',
                  m.completed
                    ? 'border-emerald-500/30 bg-emerald-500/8'
                    : 'border-white/8 bg-white/3',
                  isNew && 'animate-pulse border-emerald-400/60 bg-emerald-500/15'
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'text-sm font-medium',
                        m.completed ? 'text-emerald-400' : 'text-foreground'
                      )}>
                        {m.title}
                      </span>
                      {m.completed && (
                        <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 rounded-full px-1.5 py-0.5">
                          ✓ Concluída
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-tight">{m.description}</p>

                    {/* Progress bar */}
                    {!m.completed && m.target > 1 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-rose-500 transition-all duration-500"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {m.progress}/{m.target}
                        </span>
                      </div>
                    )}

                    {/* Reward */}
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[10px]">{m.rewardIcon}</span>
                      <span className={cn(
                        'text-[10px] font-medium',
                        m.completed ? 'text-emerald-400' : 'text-muted-foreground'
                      )}>
                        {m.reward}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {allDone && (
            <div className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-3">
              <Trophy className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-400">
                Todas as missões concluídas! 🎉
              </span>
            </div>
          )}

          {!allDone && (
            <p className="text-center text-[11px] text-muted-foreground/60 pt-1">
              <Zap className="inline h-3 w-3 mr-0.5" />
              As missões reiniciam à meia-noite
            </p>
          )}
        </div>
      )}
    </div>
  );
}
