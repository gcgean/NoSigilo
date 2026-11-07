import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { resolveServerUrl } from '@/utils/serverUrl';
import type { CabineDoMapa, SalaDoMapa } from '@/components/MapaDaCasa';

/**
 * A Casa em 3D (só CSS, nada para baixar). As cabines vêm do servidor: quando uma
 * abre, o quartinho sobe do chão na sala; quando fecha, some na atualização seguinte.
 * Arrastar para os lados gira a casa; arrastar na vertical continua rolando a página.
 */
// Planta em pé, para ocupar a tela do celular. As paredes altas ficam só no fundo e à
// esquerda da casa; as de dentro são baixas para não esconder a sala de trás.
const LARGURA = 360;
const ALTURA = 490;
const PAREDE_ALTA = 44;
const PAREDE_BAIXA = 12;

type Planta = { x: number; y: number; w: number; d: number; cor: string; chao: string; paredeA: string; paredeB: string; pessoa: string; movel: 'bar' | 'sofa' | 'cama' | 'palco' | 'parede' };
const PLANTA: Record<string, Planta> = {
  salao: { x: 10, y: 10, w: 340, d: 170, cor: '#d946ef', chao: '#2a1140', paredeA: '#3a1a58', paredeB: '#301449', pessoa: '#e9d5ff', movel: 'bar' },
  casais: { x: 10, y: 190, w: 165, d: 130, cor: '#f43f5e', chao: '#3a0d1c', paredeA: '#4e1226', paredeB: '#430f20', pessoa: '#fecdd3', movel: 'sofa' },
  quarto: { x: 185, y: 190, w: 165, d: 130, cor: '#dc2626', chao: '#1c0707', paredeA: '#2a0a0a', paredeB: '#220808', pessoa: '#fecaca', movel: 'cama' },
  glory: { x: 10, y: 330, w: 150, d: 150, cor: '#ef4444', chao: '#26060a', paredeA: '#3a0a0f', paredeB: '#30080c', pessoa: '#fecaca', movel: 'parede' },
  cuckold: { x: 170, y: 330, w: 180, d: 150, cor: '#f59e0b', chao: '#2b1704', paredeA: '#3d2006', paredeB: '#331b05', pessoa: '#fde68a', movel: 'palco' },
};
const COR_DO_PERFIL = { casal: '#f472b6', mulher: '#fb7185', homem: '#60a5fa', outros: '#a78bfa' } as const;
export const VAGAS_DE_CABINE = 6;
const CABINE_W = 34;
const CABINE_D = 30;

const hash = (t: string) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Cada cabine fica sempre na mesma vaga enquanto existir (não pula quando outra fecha). */
export function vagasDasCabines(cabines: CabineDoMapa[], vagas = VAGAS_DE_CABINE) {
  const ocupadas = new Map<number, CabineDoMapa>();
  const fora: CabineDoMapa[] = [];
  for (const c of [...cabines].sort((a, b) => a.id.localeCompare(b.id))) {
    let v = hash(c.id) % vagas;
    let tentativas = 0;
    while (ocupadas.has(v) && tentativas < vagas) { v = (v + 1) % vagas; tentativas += 1; }
    if (ocupadas.has(v)) fora.push(c); else ocupadas.set(v, c);
  }
  return { ocupadas, fora };
}

function Caixa({ x, y, w, d, h, topo, frente, lado, children, className, style }: { x: number; y: number; w: number; d: number; h: number; topo: string; frente: string; lado: string; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn('absolute [transform-style:preserve-3d]', className)} style={{ left: x, top: y, width: w, height: d, ...style }}>
      <div className="absolute left-0 w-full" style={{ bottom: 0, height: h, background: frente, transformOrigin: 'bottom', transform: 'rotateX(-90deg)' }} />
      <div className="absolute top-0 h-full" style={{ right: 0, width: h, background: lado, transformOrigin: 'right', transform: 'rotateY(90deg)' }} />
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: topo, transform: `translateZ(${h}px)` }}>{children}</div>
    </div>
  );
}

function Moveis({ p }: { p: Planta }) {
  if (p.movel === 'bar') {
    const pista = Array.from({ length: 32 });
    return (
      <>
        <div className="absolute grid" style={{ left: 16, top: 52, width: 150, height: 76, gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}>
          {pista.map((_, k) => <span key={k} style={{ background: (k + Math.floor(k / 8)) % 2 ? '#7e22ce' : '#3b0764' }} />)}
        </div>
        <Caixa x={14} y={10} w={120} d={22} h={18} topo="#6b3a1e" frente="#4a2712" lado="#3a1e0e" />
      </>
    );
  }
  if (p.movel === 'sofa') return <Caixa x={8} y={8} w={46} d={18} h={10} topo="#9f1239" frente="#6b0f28" lado="#550c20" />;
  if (p.movel === 'cama') return <Caixa x={8} y={8} w={46} d={38} h={10} topo="#450a0a" frente="#3a0808" lado="#2c0606" />;
  if (p.movel === 'palco') return <Caixa x={8} y={8} w={60} d={34} h={12} topo="#92400e" frente="#633806" lado="#4f2c05" />;
  // Glory: divisórias com os buracos na parede.
  return (
    <>
      <Caixa x={22} y={0} w={5} d={44} h={22} topo="#3f0d10" frente="#2a080b" lado="#330a0d" />
      <Caixa x={50} y={0} w={5} d={44} h={22} topo="#3f0d10" frente="#2a080b" lado="#330a0d" />
    </>
  );
}

function Cabine3D({ c, x, y, cor, onEspiar }: { c: CabineDoMapa; x: number; y: number; cor: string; onEspiar: (id: string) => void }) {
  const titulo = c.aberta ? `Cabine de porta aberta com ${c.pessoas} pessoa(s): toque para espiar` : `Cabine de porta fechada com ${c.pessoas} pessoa(s)`;
  return (
    <button
      type="button"
      data-cabine={c.id}
      aria-label={titulo}
      title={titulo}
      onClick={(e) => { e.stopPropagation(); if (c.aberta) onEspiar(c.id); }}
      className={cn('absolute [transform-style:preserve-3d]', c.aberta ? 'cursor-pointer' : 'cursor-default')}
      style={{ left: x, top: y, width: CABINE_W, height: CABINE_D, animation: 'nsCabineSobe .55s ease-out both' }}
    >
      <Caixa
        x={0} y={0} w={CABINE_W} d={CABINE_D} h={26}
        topo={c.aberta ? '#92400e' : '#1a0d14'} frente={c.aberta ? '#d97706' : cor} lado={c.aberta ? '#78350f' : '#1a0a12'}
      >
        <span className="text-[13px] font-bold leading-none text-white">{c.aberta ? '👀' : '🔒'}{c.pessoas}</span>
      </Caixa>
    </button>
  );
}

function Sala3D({ s, calor, onEntrar, onEspiar }: { s: SalaDoMapa; calor: number; onEntrar: (id: string) => void; onEspiar: (salaId: string, cabineId: string) => void }) {
  const p = PLANTA[s.id];
  if (!p) return null;
  const travada = !!(s.bloqueadaParaMim || s.trancada);
  const { ocupadas, fora } = vagasDasCabines(s.cabines ?? []);
  const pessoas = (s.pessoas ?? []).slice(0, 14);
  // Vagas das cabines: no lado direito da sala, em duas fileiras.
  const vaga = (i: number) => ({ x: p.w - (CABINE_W + 5) * (Math.floor(i / 2) + 1), y: 6 + (i % 2) * (CABINE_D + 5) });
  const paredeFundo = p.y <= 10 ? PAREDE_ALTA : PAREDE_BAIXA;
  const paredeLado = p.x <= 10 ? PAREDE_ALTA : PAREDE_BAIXA;
  return (
    <div
      role="button"
      tabIndex={travada ? -1 : 0}
      aria-label={`${s.nome}: ${s.total} pessoas, ${(s.cabines ?? []).length} cabines${travada ? ', fechada para você' : ''}`}
      data-sala={s.id}
      onClick={() => { if (!travada) onEntrar(s.id); }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !travada) onEntrar(s.id); }}
      className={cn('absolute [transform-style:preserve-3d]', travada ? 'cursor-not-allowed' : 'cursor-pointer')}
      style={{ left: p.x, top: p.y, width: p.w, height: p.d }}
    >
      <div className="absolute inset-0 overflow-hidden" style={{ background: p.chao, border: `2px solid ${p.cor}`, boxShadow: calor > 0 ? `0 0 ${8 + calor * 26}px ${p.cor}` : undefined, opacity: travada ? 0.5 : 1 }}>
        {s.fundo && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${resolveServerUrl(s.fundo.url)}")`, opacity: s.fundo.intensidade, filter: 'grayscale(1) blur(1px)' }} />}
        <span className="absolute bottom-1 left-2 right-9 truncate text-[13px] font-bold text-white">{s.nome}</span>
        <span className="absolute bottom-1 right-1.5 rounded-full bg-black/55 px-1.5 text-[13px] text-white">
          {s.trancada ? `🔒 faltam ${s.faltamParaAbrir ?? 0}` : `${s.total}${s.espiando > 0 ? ` · 👀${s.espiando}` : ''}`}
        </span>
      </div>
      <div className="absolute left-0 top-0 w-full" style={{ height: paredeFundo, background: p.paredeA, border: `1px solid ${p.cor}`, transformOrigin: 'top', transform: 'rotateX(90deg)' }} />
      <div className="absolute left-0 top-0 h-full" style={{ width: paredeLado, background: p.paredeB, border: `1px solid ${p.cor}`, transformOrigin: 'left', transform: 'rotateY(-90deg)' }} />
      <Moveis p={p} />
      {pessoas.map((cat, i) => {
        const h = hash(`${s.id}:${i}`);
        return (
          <span
            key={i}
            className="absolute h-3 w-3 rounded-full border border-white/90"
            style={{ left: 10 + (h % Math.max(20, p.w - 40)), top: 74 + ((h >>> 8) % Math.max(10, p.d - 104)), background: COR_DO_PERFIL[cat], transform: 'translateZ(8px)' }}
          />
        );
      })}
      {[...ocupadas.entries()].map(([i, c]) => {
        const { x, y } = vaga(i);
        return <Cabine3D key={c.id} c={c} x={x} y={y} cor={p.cor} onEspiar={(id) => onEspiar(s.id, id)} />;
      })}
      {fora.length > 0 && <span className="absolute right-2.5 top-1 rounded-full bg-black/60 px-2 text-[12px] text-white" style={{ transform: 'translateZ(30px)' }}>+{fora.length} cabines</span>}
    </div>
  );
}

export default function MapaDaCasa3D({ salas, onEntrar, onEspiar }: {
  salas: SalaDoMapa[];
  onEntrar: (salaId: string) => void;
  onEspiar: (salaId: string, cabineId: string) => void;
}) {
  const palco = useRef<HTMLDivElement>(null);
  const [angulo, setAngulo] = useState(-14);
  const [escala, setEscala] = useState(0.8);
  const arrasto = useRef<{ x: number; angulo: number } | null>(null);
  const moveu = useRef(false);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1.15, (el.clientWidth || 340) / 490));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const girar = useCallback((d: number) => setAngulo((a) => a + d), []);
  const total = (s: SalaDoMapa) => s.total + (s.cabines ?? []).reduce((n, c) => n + c.pessoas, 0);
  const maior = Math.max(1, ...salas.map(total));
  const cabinesAtivas = salas.reduce((n, s) => n + (s.cabines ?? []).length, 0);
  // Altura do palco acompanha a largura, para a casa caber inteira no celular.
  const altura = Math.round(ALTURA * 0.82 * escala + 44);

  return (
    <div>
      <style>{`
        @keyframes nsCabineSobe { from { transform: translateZ(-40px) scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { [data-cabine] { animation: none !important; } }
      `}</style>
      <div
        ref={palco}
        className="relative overflow-hidden rounded-2xl bg-[#0b0610] select-none"
        style={{ height: altura, perspective: 1300, touchAction: 'pan-y' }}
        onPointerDown={(e) => { arrasto.current = { x: e.clientX, angulo }; moveu.current = false; }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (!a) return;
          const dx = e.clientX - a.x;
          if (Math.abs(dx) > 6) moveu.current = true;
          if (moveu.current) setAngulo(a.angulo + dx * 0.35);
        }}
        onPointerUp={() => { arrasto.current = null; }}
        onPointerCancel={() => { arrasto.current = null; }}
        onPointerLeave={() => { arrasto.current = null; }}
        // Quem arrastou para girar não queria entrar na sala ao soltar.
        onClickCapture={(e) => { if (moveu.current) { moveu.current = false; e.preventDefault(); e.stopPropagation(); } }}
      >
        <div
          className="absolute left-1/2 top-1/2 [transform-style:preserve-3d]"
          style={{ width: LARGURA, height: ALTURA, marginLeft: -LARGURA / 2, marginTop: -ALTURA / 2, transform: `scale(${escala}) rotateX(46deg) rotateZ(${angulo}deg)` }}
        >
          {salas.map((s) => <Sala3D key={s.id} s={s} calor={total(s) / maior} onEntrar={onEntrar} onEspiar={onEspiar} />)}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/60">
        <button type="button" onClick={() => girar(-45)} className="rounded-full border border-white/20 px-2.5 py-1" aria-label="Girar para a esquerda">↺</button>
        <span className="text-center">
          {cabinesAtivas > 0 ? `${cabinesAtivas} ${cabinesAtivas === 1 ? 'cabine montada' : 'cabines montadas'} agora · ` : ''}
          👀 porta aberta, toque para espiar · 🔒 fechada
        </span>
        <button type="button" onClick={() => girar(45)} className="rounded-full border border-white/20 px-2.5 py-1" aria-label="Girar para a direita">↻</button>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] text-white/60">
        {([['casal', 'Casal'], ['mulher', 'Mulher'], ['homem', 'Homem'], ['outros', 'Outros']] as const).map(([cat, rotulo]) => (
          <span key={cat} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: COR_DO_PERFIL[cat] }} />{rotulo}</span>
        ))}
      </div>
    </div>
  );
}
