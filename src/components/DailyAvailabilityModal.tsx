import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'nosigilo:avail-shown-date';

// As cores tinham só a versão do tema escuro (texto 400 sobre 10% de cor).
// No tema claro isso vira texto claro sobre fundo quase branco e some. Cada
// opção agora traz o par: tom escuro por padrão, o original em `dark:`.
const OPTIONS = [
  { value: 'now',         emoji: '⚡', label: 'Disponível hoje',     hint: 'Expira em 24h',     color: 'border-emerald-600/70 bg-emerald-500/20 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400' },
  { value: 'week',        emoji: '📅', label: 'Esta semana',         hint: 'Expira em 7 dias',  color: 'border-orange-600/70 bg-orange-500/20 text-orange-800 dark:border-orange-500 dark:bg-orange-500/10 dark:text-orange-400' },
  { value: 'month',       emoji: '🗓️', label: 'Este mês',            hint: 'Expira em 30 dias', color: 'border-violet-600/70 bg-violet-500/20 text-violet-800 dark:border-violet-500 dark:bg-violet-500/10 dark:text-violet-400' },
  { value: 'online_only', emoji: '💬', label: 'Só online',           hint: 'Sem encontros',     color: 'border-sky-600/70 bg-sky-500/20 text-sky-800 dark:border-sky-500 dark:bg-sky-500/10 dark:text-sky-400' },
  { value: 'not_looking', emoji: '🔒', label: 'Não estou buscando',  hint: 'Oculto nos filtros',color: 'border-zinc-600/70 bg-zinc-500/20 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-500/10 dark:text-zinc-400' },
] as const;

function todayStr() {
  return new Date().toDateString();
}

function shouldShow(user: any): boolean {
  if (!user || !user.avatar || user.isAdmin) return false;
  // Quem já tem um status válido não é perguntado de novo. O backend zera
  // `availabilityStatus` quando o prazo do status vence, então a pergunta
  // volta sozinha na expiração em vez de a cada visita ao feed.
  if (user.availabilityStatus) return false;
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
  const painelRef = useRef<HTMLDivElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, todayStr()); } catch {
      // localStorage indisponível: fecha assim mesmo, só volta a perguntar depois.
    }
    setVisible(false);
  }, []);

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

  // Escape fecha e o foco fica preso dentro do modal enquanto ele está aberto.
  useEffect(() => {
    if (!visible) return;
    const painel = painelRef.current;
    const focavel = () =>
      Array.from(
        painel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    const anterior = document.activeElement as HTMLElement | null;
    fecharRef.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const itens = focavel();
      if (itens.length === 0) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || !painel?.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus?.();
    };
  }, [visible, dismiss]);

  if (!visible) return null;

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
      // Tocar no fundo fecha. `onMouseDown` (e não onClick) evita fechar quando
      // o gesto começa dentro do painel e termina fora.
      onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-disponibilidade"
        className="relative w-full max-w-sm rounded-3xl border border-primary/20 bg-background shadow-2xl overflow-hidden"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-primary via-violet-500 to-rose-500" />

        <button
          ref={fecharRef}
          type="button"
          onClick={dismiss}
          aria-label="Fechar sem responder"
          className="absolute right-1 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Zap className="h-6 w-6 text-primary" />
              </div>
            </div>
            <h2 id="titulo-disponibilidade" className="text-lg font-bold">Qual sua disponibilidade hoje?</h2>
            <p className="text-sm text-muted-foreground">
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
                  <p className="text-[11px] opacity-80 dark:opacity-70">{opt.hint}</p>
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
