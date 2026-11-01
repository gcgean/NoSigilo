/**
 * Cabines fechadas com conversa rolando, na entrada d'A Casa. Só os tipos de
 * perfil aparecem (nada de nome nem foto de quem está dentro): dá para saber que
 * tem gente conversando e pedir para entrar, sem expor ninguém.
 */
export type CabineFechada = { id: string; sala: string; salaNome: string; salaEmoji: string; tipos: string[]; desde: string; pedi: boolean };

const EMOJI_DO_TIPO: Record<string, string> = { casal: '👫', mulher: '👩', homem: '👨' };
const NOME_DO_TIPO: Record<string, [string, string]> = { casal: ['casal', 'casais'], mulher: ['mulher', 'mulheres'], homem: ['homem', 'homens'] };

/** "casal + 2 mulheres" */
export function quemEstaDentro(tipos: string[]) {
  const n = new Map<string, number>();
  for (const t of tipos) n.set(t, (n.get(t) ?? 0) + 1);
  return [...n.entries()].map(([t, q]) => {
    const [um, varios] = NOME_DO_TIPO[t] ?? ['pessoa', 'pessoas'];
    return `${EMOJI_DO_TIPO[t] ?? '🧑'} ${q === 1 ? um : `${q} ${varios}`}`;
  }).join(' + ');
}

const haQuanto = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
};

export default function CabinesFechadas({ cabines, pedindo, onPedir }: {
  cabines: CabineFechada[];
  pedindo: string | null;
  onPedir: (c: CabineFechada) => void;
}) {
  if (cabines.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">🚪 Cabines fechadas rolando agora</p>
      <p className="-mt-1 text-xs text-white/55">Ninguém vê quem pediu além de quem está dentro. Se toparem, você entra na hora.</p>
      {cabines.map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{quemEstaDentro(c.tipos)}</p>
            <p className="truncate text-xs text-white/55">{c.salaEmoji} {c.salaNome} · conversando há {haQuanto(c.desde)}</p>
          </div>
          <button type="button" disabled={c.pedi || pedindo === c.id} onClick={() => onPedir(c)}
            className="shrink-0 rounded-full bg-gradient-to-r from-rose-600 to-fuchsia-600 px-3 py-2 text-xs font-bold disabled:from-white/10 disabled:to-white/10 disabled:text-white/60">
            {c.pedi ? 'Pedido enviado' : pedindo === c.id ? 'Pedindo…' : '🙋 Pedir para entrar'}
          </button>
        </div>
      ))}
    </div>
  );
}
