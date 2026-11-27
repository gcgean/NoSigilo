import { cn } from '@/lib/utils';

/**
 * Navegação dentro d'A Casa (27/11/2026).
 * - BarraDasSalas: as salas com quantas pessoas há em cada, troca em 1 toque. Antes
 *   trocar exigia achar o 🎮; em 21/11, 40% ficaram numa sala só a noite toda.
 * - ResumoDasCabines: "🚪 3 cabines rolando agora · 1 de porta aberta 👀" — quem está
 *   no chat fica sabendo que tem cabine acontecendo.
 */
export type SalaNaBarra = {
  id: string; nome: string; emoji: string; total: number;
  bloqueadaParaMim?: boolean; lotadaParaMim?: boolean; trancada?: boolean; faltamParaAbrir?: number;
  cabines?: { id: string; aberta: boolean }[];
};

export function BarraDasSalas({ salas, atual, entrando, onEntrar }: {
  salas: SalaNaBarra[]; atual: string; entrando?: string | null; onEntrar: (id: string) => void;
}) {
  // Sala bloqueada para o meu tipo de perfil não aparece (não dá para entrar mesmo).
  const visiveis = salas.filter((s) => !s.bloqueadaParaMim);
  if (visiveis.length < 2) return null;
  return (
    <nav className="flex gap-1.5 overflow-x-auto border-b border-white/10 px-3 py-1.5 [scrollbar-width:none]" aria-label="Salas d'A Casa" data-testid="barra-das-salas">
      {visiveis.map((s) => {
        const aqui = s.id === atual;
        const trancada = !!s.trancada;
        return (
          <button
            key={s.id}
            type="button"
            disabled={aqui || trancada || entrando === s.id}
            aria-current={aqui ? 'page' : undefined}
            onClick={() => onEntrar(s.id)}
            title={trancada ? `Abre quando a Casa encher${s.faltamParaAbrir ? ` (faltam ${s.faltamParaAbrir})` : ''}` : s.lotadaParaMim ? 'Cota de homens cheia: toque para entrar na fila' : aqui ? 'Você está aqui' : `Ir para ${s.nome}`}
            className={cn(
              'flex min-h-[32px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs transition',
              aqui ? 'bg-white font-bold text-zinc-900' : 'border border-white/20 bg-black/30 text-white/85 hover:bg-white/10',
              trancada && 'opacity-50',
            )}
          >
            <span>{trancada ? '🔒' : s.emoji}</span>
            <span>{s.nome}</span>
            {!trancada && <span className={cn('tabular-nums', aqui ? 'text-zinc-600' : 'text-white/60')}>{s.total}</span>}
            {s.lotadaParaMim && !aqui && <span className="text-[10px] text-amber-300">fila</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** Conta as cabines rolando na Casa toda (sem contar as minhas). */
export function contarCabines(salas: SalaNaBarra[], fechadas: { id: string }[], minhas: string[]) {
  const abertas = salas.flatMap((s) => (s.cabines ?? []).filter((c) => c.aberta && !minhas.includes(c.id)));
  // Fechadas: só as com conversa rolando (a lista que o servidor já manda filtrada).
  const fechadasRolando = new Set(fechadas.map((c) => c.id).filter((id) => !minhas.includes(id)));
  return { total: abertas.length + fechadasRolando.size, abertas: abertas.length };
}

export function ResumoDasCabines({ total, abertas, onAbrir }: { total: number; abertas: number; onAbrir: () => void }) {
  if (total === 0) return null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-2 border-b border-white/10 bg-rose-950/40 px-3 py-1.5 text-left text-xs text-white/90 hover:bg-rose-900/40"
      data-testid="resumo-das-cabines"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
      </span>
      <span className="min-w-0 flex-1 truncate">
        🚪 <b>{total === 1 ? '1 cabine rolando agora' : `${total} cabines rolando agora`}</b>
        {abertas > 0 && <> · {abertas === 1 ? '1 de porta aberta' : `${abertas} de porta aberta`} 👀</>}
      </span>
      <span className="shrink-0 font-semibold text-rose-300">Ver</span>
    </button>
  );
}
