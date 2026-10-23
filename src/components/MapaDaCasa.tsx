import { cn } from '@/lib/utils';

/**
 * Planta d'A Casa vista de cima: cada sala com as pessoas lá dentro (bolinhas
 * por tipo de perfil), o "calor" pela quantidade de gente e as cabines como
 * quartinhos (porta fechada = só o contorno; porta aberta = brilha e mostra
 * quantos estão dentro e espiando). Tocar numa sala entra; tocar numa cabine
 * aberta já vai espiar.
 */
type Cat = 'casal' | 'mulher' | 'homem' | 'outros';
export type CabineDoMapa = { id: string; aberta: boolean; pessoas: number; espiando: number; tipos: Cat[] };
export type SalaDoMapa = {
  id: string; nome: string; emoji: string; total: number; espiando: number;
  pessoas?: Cat[]; cabines?: CabineDoMapa[];
  bloqueadaParaMim?: boolean; lotadaParaMim?: boolean;
};

const EMOJI: Record<Cat, string> = { casal: '💑', mulher: '👩', homem: '👨', outros: '🧑' };
const ORDEM: Record<string, { area: string; fundo: string; brilho: string; borda: string }> = {
  salao: { area: '1 / 1 / 2 / 4', fundo: 'from-fuchsia-950 to-purple-950', brilho: 'rgba(217,70,239,', borda: 'border-fuchsia-500/50' },
  casais: { area: '2 / 1 / 3 / 2', fundo: 'from-rose-950 to-pink-950', brilho: 'rgba(244,63,94,', borda: 'border-rose-500/60' },
  quarto: { area: '2 / 2 / 3 / 3', fundo: 'from-red-950 to-black', brilho: 'rgba(220,38,38,', borda: 'border-red-600/70' },
  glory: { area: '2 / 3 / 3 / 4', fundo: 'from-black to-red-950', brilho: 'rgba(185,28,28,', borda: 'border-red-500/80' },
};

// Posição estável de cada bolinha (não pula a cada atualização).
const posicao = (salaId: string, i: number) => {
  let h = 0;
  for (const ch of `${salaId}:${i}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { x: 8 + (h % 84), y: 30 + ((h >>> 8) % 45), atraso: (h % 40) / 10 };
};

export default function MapaDaCasa({ salas, onEntrar, onEspiar }: {
  salas: SalaDoMapa[];
  onEntrar: (salaId: string) => void;
  onEspiar: (salaId: string, cabineId: string) => void;
}) {
  const maior = Math.max(1, ...salas.map((s) => s.total + (s.cabines ?? []).reduce((n, c) => n + c.pessoas, 0)));
  return (
    <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-3">
      <style>{`
        @keyframes nsAndar { 0%,100% { transform: translate(0,0); } 25% { transform: translate(6px,-4px); } 50% { transform: translate(-4px,3px); } 75% { transform: translate(3px,5px); } }
        @keyframes nsPulso { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
      `}</style>
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">🗺️ Mapa da Casa · toque para entrar</p>
      <div className="grid aspect-[4/3] w-full gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1.1fr 1fr' }}>
        {salas.map((s) => {
          const tema = ORDEM[s.id] ?? ORDEM.salao;
          const naCabine = (s.cabines ?? []).reduce((n, c) => n + c.pessoas, 0);
          const calor = (s.total + naCabine) / maior; // 0..1
          const travada = s.bloqueadaParaMim;
          const pessoas = (s.pessoas ?? []).slice(0, 18);
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => { if (!travada) onEntrar(s.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !travada) onEntrar(s.id); }}
              className={cn('relative cursor-pointer overflow-hidden rounded-2xl border-2 bg-gradient-to-br transition active:scale-[0.98]', tema.fundo, tema.borda, travada && 'cursor-not-allowed opacity-50')}
              style={{
                gridArea: tema.area,
                boxShadow: calor > 0 ? `0 0 ${10 + calor * 30}px ${tema.brilho}${0.25 + calor * 0.5})` : undefined,
                animation: calor > 0.6 ? 'nsPulso 2.4s ease-in-out infinite' : undefined,
              }}
            >
              <div className="absolute left-2 top-1.5 z-10 flex items-center gap-1 text-[11px] font-bold text-white drop-shadow">
                <span>{s.emoji}</span><span className="truncate">{s.nome}</span>
              </div>
              <div className="absolute right-2 top-1.5 z-10 rounded-full bg-black/50 px-1.5 text-[10px] text-white/80">
                {s.total}{s.espiando > 0 ? ` · 👀${s.espiando}` : ''}
              </div>

              {/* Pessoas andando pela sala */}
              {pessoas.map((cat, i) => {
                const pos = posicao(s.id, i);
                return (
                  <span
                    key={i}
                    className="absolute text-sm leading-none"
                    style={{ left: `${pos.x}%`, top: `${pos.y}%`, animation: `nsAndar ${6 + (i % 4)}s ease-in-out ${pos.atraso}s infinite` }}
                  >
                    {EMOJI[cat]}
                  </span>
                );
              })}
              {s.total === 0 && <p className="absolute inset-x-0 top-1/2 text-center text-[10px] text-white/40">vazia… seja o primeiro 😏</p>}

              {/* Cabines da sala */}
              {(s.cabines ?? []).length > 0 && (
                <div className="absolute inset-x-1.5 bottom-1.5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
                  {(s.cabines ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.aberta}
                      onClick={(e) => { e.stopPropagation(); if (c.aberta) onEspiar(s.id, c.id); }}
                      className={cn('flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px]',
                        c.aberta ? 'border-amber-300 bg-amber-500/25 text-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.6)]' : 'border-white/25 bg-black/50 text-white/50')}
                      title={c.aberta ? 'Porta aberta: toque para espiar' : 'Porta fechada'}
                    >
                      {c.aberta ? '🚪' : '🔒'}
                      {c.aberta ? c.tipos.map((t) => EMOJI[t]).join('') : `${c.pessoas}`}
                      {c.aberta && c.espiando > 0 && <span className="ml-0.5">👀{c.espiando}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[10px] text-white/50">Quanto mais brilha, mais gente. 🚪 = cabine de porta aberta (toque para espiar) · 🔒 = porta fechada</p>
    </div>
  );
}
