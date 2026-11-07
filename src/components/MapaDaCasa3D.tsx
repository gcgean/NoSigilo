import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { resolveServerUrl } from '@/utils/serverUrl';
import { quemEstaDentro } from '@/components/CabinesFechadas';
import type { CabineDoMapa, CabineFechadaDoMapa, PessoaDoMapa, SalaDoMapa } from '@/components/MapaDaCasa';

/**
 * A Casa em 3D (só CSS, nada para baixar). As cabines vêm do servidor: quando uma
 * abre, o quartinho sobe do chão na sala; quando fecha, some na atualização seguinte.
 * Tocar numa cabine mostra quem está lá (por tipo de perfil) e o que dá para fazer.
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
  quarto: { x: 185, y: 190, w: 165, d: 130, cor: '#dc2626', chao: '#2e0c0c', paredeA: '#3a0f0f', paredeB: '#300c0c', pessoa: '#fecaca', movel: 'cama' },
  glory: { x: 10, y: 330, w: 150, d: 150, cor: '#ef4444', chao: '#26060a', paredeA: '#3a0a0f', paredeB: '#30080c', pessoa: '#fecaca', movel: 'parede' },
  cuckold: { x: 170, y: 330, w: 180, d: 150, cor: '#f59e0b', chao: '#2b1704', paredeA: '#3d2006', paredeB: '#331b05', pessoa: '#fde68a', movel: 'palco' },
};
const COR_DO_PERFIL = { casal: '#f472b6', mulher: '#fb7185', homem: '#60a5fa', outros: '#a78bfa' } as const;
export const VAGAS_DE_CABINE = 6;
const CABINE_W = 42;
const CABINE_D = 36;
const INCLINACAO = 38;
const MAX_NA_SALA = 9;

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

function Pessoa3D({ p, salaId, indice, w, d, angulo }: { p: { cat: PessoaDoMapa['cat']; avatar?: string | null; nome?: string; destaque?: boolean }; salaId: string; indice: number; w: number; d: number; angulo: number }) {
  const semente = hash(salaId) % 100;
  const h = (indice + 1) * 7 + semente;
  const anda = `nsAnda${indice % 3}`;
  // Sequência áurea: cada pessoa cai longe das outras e não troca de lugar entre atualizações.
  const px = (indice * 0.618 + semente / 100) % 1;
  const py = (indice * 0.754 + semente / 37) % 1;
  // Foto que não carrega não pode sumir com a pessoa do mapa: fica a bolinha do perfil.
  const [fotoFalhou, setFotoFalhou] = useState(false);
  return (
    <div
      className="pointer-events-none absolute [transform-style:preserve-3d]"
      style={{ left: 12 + px * Math.max(20, w - 66), top: 40 + py * Math.max(10, d - 84), animation: `${anda} ${9 + (h % 6)}s ease-in-out ${(h % 40) / 10}s infinite` }}
    >
      {/* De pé, sempre virada para quem olha, mesmo girando a casa. */}
      <div className="absolute [transform-style:preserve-3d]" style={{ transform: `translateZ(4px) rotateZ(${-angulo}deg) rotateX(${-INCLINACAO}deg)`, transformOrigin: 'bottom' }}>
        {p.avatar && !fotoFalhou ? (
          <img src={resolveServerUrl(p.avatar)} alt="" loading="lazy" draggable={false} onError={() => setFotoFalhou(true)}
            className={cn('h-7 w-7 max-w-none rounded-full object-cover', p.destaque ? 'ring-2 ring-amber-300' : 'ring-1 ring-white/90')}
            style={{ outline: `2px solid ${COR_DO_PERFIL[p.cat]}`, outlineOffset: 1 }} />
        ) : (
          <span className="block h-3.5 w-3.5 rounded-full border border-white/90" style={{ background: COR_DO_PERFIL[p.cat] }} />
        )}
        {p.destaque && <span className="absolute -right-2 -top-2 text-sm leading-none">🔥</span>}
      </div>
    </div>
  );
}

function Cabine3D({ c, x, y, cor, marcada, onTocar }: { c: CabineDoMapa; x: number; y: number; cor: string; marcada: boolean; onTocar: (id: string) => void }) {
  const titulo = c.aberta ? `Cabine de porta aberta com ${c.pessoas} pessoa(s)` : `Cabine de porta fechada com ${c.pessoas} pessoa(s)`;
  const nivel = c.nivel ?? 0;
  return (
    <button
      type="button"
      data-cabine={c.id}
      aria-label={titulo}
      title={titulo}
      onClick={(e) => { e.stopPropagation(); onTocar(c.id); }}
      className="absolute cursor-pointer [transform-style:preserve-3d]"
      style={{ left: x, top: y, width: CABINE_W, height: CABINE_D, animation: nivel > 0 ? 'nsCabineSobe .55s ease-out, nsCabineTreme 1.4s ease-in-out .6s infinite' : 'nsCabineSobe .55s ease-out both' }}
    >
      <Caixa
        x={0} y={0} w={CABINE_W} d={CABINE_D} h={26}
        topo={marcada ? '#fde68a' : c.aberta ? '#92400e' : nivel > 0 ? '#7f1d1d' : '#1a0d14'} frente={c.aberta ? '#d97706' : cor} lado={c.aberta ? '#78350f' : '#1a0a12'}
      >
        <span className={cn('text-[13px] font-bold leading-none', marcada ? 'text-black' : 'text-white')}>{nivel > 0 ? '🔥'.repeat(nivel) : c.aberta ? '👀' : '🔒'}{c.pessoas}</span>
      </Caixa>
    </button>
  );
}

function Sala3D({ s, calor, angulo, escolhida, onEntrar, onTocarCabine }: { s: SalaDoMapa; calor: number; angulo: number; escolhida: string | null; onEntrar: (id: string) => void; onTocarCabine: (id: string) => void }) {
  const p = PLANTA[s.id];
  if (!p) return null;
  const travada = !!(s.bloqueadaParaMim || s.trancada);
  const { ocupadas, fora } = vagasDasCabines(s.cabines ?? []);
  // Com foto quando o servidor manda; senão, a bolinha da cor do perfil.
  const lista: { cat: PessoaDoMapa['cat']; avatar?: string | null; nome?: string; destaque?: boolean }[] = s.presentes ?? (s.pessoas ?? []).map((cat) => ({ cat }));
  const pessoas = lista.slice(0, MAX_NA_SALA);
  // Vagas das cabines: no lado direito da sala, em duas fileiras.
  const vaga = (i: number) => ({ x: p.w - (CABINE_W + 4) * (Math.floor(i / 2) + 1), y: 5 + (i % 2) * (CABINE_D + 4) });
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
        <span className="absolute bottom-1 left-2 right-9 truncate text-[14px] font-bold text-white">{s.nome}</span>
        <span className="absolute bottom-1 right-1.5 rounded-full bg-black/55 px-1.5 text-[13px] text-white">
          {s.trancada ? `🔒 faltam ${s.faltamParaAbrir ?? 0}` : `${s.total}${s.espiando > 0 ? ` · 👀${s.espiando}` : ''}`}
        </span>
      </div>
      <div className="absolute left-0 top-0 w-full" style={{ height: paredeFundo, background: p.paredeA, border: `1px solid ${p.cor}`, transformOrigin: 'top', transform: 'rotateX(90deg)' }} />
      <div className="absolute left-0 top-0 h-full" style={{ width: paredeLado, background: p.paredeB, border: `1px solid ${p.cor}`, transformOrigin: 'left', transform: 'rotateY(-90deg)' }} />
      <Moveis p={p} />
      {pessoas.map((pessoa, i) => <Pessoa3D key={i} p={pessoa} salaId={s.id} indice={i} w={p.w} d={p.d} angulo={angulo} />)}
      {[...ocupadas.entries()].map(([i, c]) => {
        const { x, y } = vaga(i);
        return <Cabine3D key={c.id} c={c} x={x} y={y} cor={p.cor} marcada={escolhida === c.id} onTocar={onTocarCabine} />;
      })}
      {fora.length > 0 && <span className="absolute right-2.5 top-1 rounded-full bg-black/60 px-2 text-[12px] text-white" style={{ transform: 'translateZ(30px)' }}>+{fora.length} cabines</span>}
    </div>
  );
}

export default function MapaDaCasa3D({ salas, onEntrar, onEspiar, fechadas = [], pedindo = null, onPedir }: {
  salas: SalaDoMapa[];
  onEntrar: (salaId: string) => void;
  onEspiar: (salaId: string, cabineId: string) => void;
  fechadas?: CabineFechadaDoMapa[];
  pedindo?: string | null;
  onPedir?: (cabineId: string) => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  // De frente: no celular, inclinada para o lado a casa encolhia e ficava torta.
  const [angulo, setAngulo] = useState(0);
  const [escala, setEscala] = useState(0.8);
  const arrasto = useRef<{ x: number; angulo: number } | null>(null);
  const moveu = useRef(false);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setEscala(Math.min(1.25, (el.clientWidth || 340) / 372));
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
  // A cabine escolhida pode fechar enquanto o painel está aberto: aí o painel some junto.
  const salaDaEscolhida = escolhida ? salas.find((s) => (s.cabines ?? []).some((c) => c.id === escolhida)) : null;
  const cabine = salaDaEscolhida?.cabines?.find((c) => c.id === escolhida) ?? null;
  const fechada = cabine && !cabine.aberta ? fechadas.find((f) => f.id === cabine.id) : null;
  const quemDentro = cabine ? quemEstaDentro(cabine.aberta ? cabine.tipos : fechada?.tipos ?? []) : '';
  const CLIMA = ['conversando', 'nas preliminares 🔥', 'pegando fogo 🔥🔥'];
  // Altura do palco acompanha a largura, para a casa caber inteira no celular.
  const altura = Math.round(ALTURA * 0.78 * escala + 56);

  return (
    <div>
      <style>{`
        @keyframes nsCabineSobe { from { transform: translateZ(-40px) scale(.4); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes nsCabineTreme { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-1.2px); } 75% { transform: translateX(1.2px); } }
        @keyframes nsAnda0 { 0%, 100% { transform: translate(0, 0); } 30% { transform: translate(34px, 8px); } 65% { transform: translate(12px, -14px); } }
        @keyframes nsAnda1 { 0%, 100% { transform: translate(0, 0); } 35% { transform: translate(-26px, 12px); } 70% { transform: translate(18px, 16px); } }
        @keyframes nsAnda2 { 0%, 100% { transform: translate(0, 0); } 40% { transform: translate(20px, -10px); } 75% { transform: translate(-22px, -6px); } }
        @media (prefers-reduced-motion: reduce) { [data-cabine], [data-sala] > div { animation: none !important; } }
      `}</style>
      <div
        ref={palco}
        className="relative overflow-hidden rounded-2xl bg-[#0b0610] select-none"
        style={{ height: altura, perspective: 1700, touchAction: 'pan-y' }}
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
          style={{ width: LARGURA, height: ALTURA, marginLeft: -LARGURA / 2, marginTop: -ALTURA / 2, transform: `scale(${escala}) rotateX(${INCLINACAO}deg) rotateZ(${angulo}deg)` }}
        >
          {salas.map((s) => <Sala3D key={s.id} s={s} calor={total(s) / maior} angulo={angulo} escolhida={escolhida} onEntrar={onEntrar} onTocarCabine={setEscolhida} />)}
        </div>
      </div>
      {cabine && salaDaEscolhida && (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 p-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{cabine.aberta ? '👀 Porta aberta' : '🔒 Porta fechada'} · {salaDaEscolhida.nome}</p>
            <p className="text-xs text-white/70">
              {quemDentro || `${cabine.pessoas} pessoa(s)`} · {CLIMA[cabine.nivel ?? 0] ?? CLIMA[0]}{cabine.espiando > 0 ? ` · ${cabine.espiando} espiando` : ''}
            </p>
            {!cabine.aberta && !fechada && <p className="mt-0.5 text-xs text-white/55">Essa cabine não está recebendo pedidos agora.</p>}
          </div>
          {cabine.aberta ? (
            <button type="button" onClick={() => onEspiar(salaDaEscolhida.id, cabine.id)} className="shrink-0 rounded-full bg-amber-500 px-3 py-2 text-xs font-bold text-black">Espiar</button>
          ) : fechada && onPedir ? (
            <button type="button" disabled={fechada.pedi || pedindo === fechada.id} onClick={() => onPedir(fechada.id)} className="shrink-0 rounded-full bg-rose-600 px-3 py-2 text-xs font-bold disabled:opacity-60">
              {fechada.pedi ? 'Pedido enviado' : pedindo === fechada.id ? 'Enviando…' : '🙋 Pedir para entrar'}
            </button>
          ) : null}
          <button type="button" onClick={() => setEscolhida(null)} className="shrink-0 rounded-full p-1 text-white/60" aria-label="Fechar">✕</button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-white/60">
        <button type="button" onClick={() => girar(-45)} className="rounded-full border border-white/20 px-2.5 py-1" aria-label="Girar para a esquerda">↺</button>
        <span className="text-center">
          {cabinesAtivas > 0 ? `${cabinesAtivas} ${cabinesAtivas === 1 ? 'cabine montada' : 'cabines montadas'} agora · ` : ''}
          toque numa cabine para ver e pedir para entrar
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
