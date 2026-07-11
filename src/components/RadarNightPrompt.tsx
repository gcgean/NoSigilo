import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio } from 'lucide-react';
import { radarService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';

// Sexta (5) e sábado (6), das 19h às 23h: na 1ª vez que o usuário abre o app nesse
// intervalo, pergunta se quer ativar o Radar de Disponibilidade — só se ele ainda
// tiver radar disponível (limite diário/semanal não usado) e tiver acesso premium.
export default function RadarNightPrompt() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    if (!hasPremiumAccess(user)) return; // sem premium não usa radar → não pergunta

    const now = new Date();
    const day = now.getDay();   // 0=dom … 5=sex, 6=sáb
    const hour = now.getHours();
    if (day !== 5 && day !== 6) return;
    if (hour < 19 || hour >= 23) return;

    // Uma vez por noite (por data local).
    const key = `nosigilo:radar-night-prompt:${now.toISOString().slice(0, 10)}`;
    if (localStorage.getItem(key)) return;

    let cancelled = false;
    (async () => {
      try {
        const ov = await radarService.getOverview();
        if (cancelled) return;
        const dailyRemaining = Number((ov as any)?.dailyRemaining ?? 0);
        const weeklyRemaining = Number((ov as any)?.weeklyRemaining ?? 0);
        if (dailyRemaining > 0 && weeklyRemaining > 0) {
          localStorage.setItem(key, '1'); // marca ao exibir, para não repetir na noite
          setOpen(true);
        }
      } catch {
        /* silencioso — não atrapalha a navegação */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const isFriday = new Date().getDay() === 5;
  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-sm rounded-3xl border border-border bg-background p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Radio className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-bold">Noite boa pra se conectar 🔥</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          É {isFriday ? 'sexta' : 'sábado'} à noite! Quer ativar o Radar de Disponibilidade para encontrar pessoas próximas agora?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/radar'); }}
            className="w-full rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Ativar radar agora
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-secondary"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
