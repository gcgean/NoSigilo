import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'nosigilo:avail-shown-date';

const OPTIONS = [
  { value: 'now',         emoji: '⚡', label: 'Disponível hoje',     hint: 'Expira em 24h',     color: 'border-emerald-500 bg-emerald-500/10 text-emerald-400' },
  { value: 'week',        emoji: '📅', label: 'Esta semana',         hint: 'Expira em 7 dias',  color: 'border-orange-500 bg-orange-500/10 text-orange-400' },
  { value: 'month',       emoji: '🗓️', label: 'Este mês',            hint: 'Expira em 30 dias', color: 'border-violet-500 bg-violet-500/10 text-violet-400' },
  { value: 'online_only', emoji: '💬', label: 'Só online',           hint: 'Sem encontros',     color: 'border-sky-500 bg-sky-500/10 text-sky-400' },
  { value: 'not_looking', emoji: '🔒', label: 'Não estou buscando',  hint: 'Oculto nos filtros',color: 'border-zinc-500 bg-zinc-500/10 text-zinc-400' },
] as const;

function todayStr() {
  return new Date().toDateString();
}

function shouldShow(user: any): boolean {
  if (!user || !user.avatar || user.isAdmin) return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== todayStr();
  } catch {
    return false;
  }
}

export default function DailyAvailabilityModal() {
  const { user, updateUser } = useAuth();
  const [visible, setVisible] = useState(() => shouldShow(user));
  const [saving, setSaving] = useState(false);

  // Limpa travas de scroll/pointer-events deixadas por Radix Dialog após navegação SPA
  useEffect(() => {
    if (!visible) return;
    const cleanup = () => {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
      document.documentElement.style.overflow = '';
      document.body.removeAttribute('data-scroll-locked');
    };
    cleanup();
    const t = setTimeout(cleanup, 100);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, todayStr()); } catch {}
    setVisible(false);
  };

  const handleSelect = async (value: string) => {
    setSaving(true);
    try {
      await updateUser({ availabilityStatus: value as any });
    } finally {
      setSaving(false);
      dismiss();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/80"
      style={{ WebkitOverflowScrolling: 'auto' }}
    >
      <div className="w-full max-w-sm rounded-3xl border border-primary/20 bg-background shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-violet-500 to-rose-500" />

        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 className="text-lg font-bold">Qual sua disponibilidade hoje?</h2>
            <p className="text-xs text-muted-foreground">
              Aparece como badge nos cards da busca. Outros usuários vão saber na hora.
            </p>
          </div>

          <div className="space-y-2">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => void handleSelect(opt.value)}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 ${opt.color}`}
              >
                <span className="text-xl leading-none">{opt.emoji}</span>
                <div>
                  <p className="text-sm font-semibold">{opt.label}</p>
                  <p className="text-[11px] opacity-70">{opt.hint}</p>
                </div>
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={dismiss}
            disabled={saving}
          >
            {user?.availabilityStatus ? 'Manter status atual' : 'Pular por hoje'}
          </Button>
        </div>
      </div>
    </div>
  );
}
