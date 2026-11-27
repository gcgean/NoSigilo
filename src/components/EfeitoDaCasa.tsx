import { useCallback, useEffect, useMemo, useState } from 'react';
import { tocarSomDaCasa } from '@/utils/somDaCasa';
import { efeitosLigados, movimentoReduzido } from '@/utils/efeitosDaCasa';

/**
 * Efeito animado por cima da tela (drinks, brinde e ações da cabine).
 * Não bloqueia toques e some sozinho em ~2,4 s.
 *
 * 27/11/2026:
 * - "cheio" (tela inteira, com som) para quem deu e quem recebeu; "mini" (pílula no
 *   canto, sem som) para o resto da sala — quem recebe se sente especial e o chat
 *   de quem só está lendo não some atrás da animação.
 * - Fila: um efeito termina antes do próximo começar (antes o segundo cortava o primeiro).
 * - Desligável (BotaoEfeitosDaCasa) e calmo para quem marcou "reduzir movimento".
 * - Só emojis de um código só: os compostos (👩‍❤️‍💋‍👩, 😮‍💨) viravam vários soltos em
 *   Android antigo e no Windows.
 */
type Movimento = 'pop' | 'tremer' | 'quicar' | 'brinde' | 'deslizar' | 'explodir' | 'trocar' | 'dupla';
const EFEITOS: Record<string, { principal: string; particulas: string[]; movimento: Movimento; cor: string }> = {
  // Bar
  cerveja: { principal: '🍺', particulas: ['🫧', '🫧', '🍺'], movimento: 'brinde', cor: 'rgba(245,158,11,' },
  caipirinha: { principal: '🍹', particulas: ['🍋', '🧊', '🍃'], movimento: 'pop', cor: 'rgba(132,204,22,' },
  gin: { principal: '🍸', particulas: ['✨', '🧊', '🫧'], movimento: 'pop', cor: 'rgba(56,189,248,' },
  champanhe: { principal: '🍾', particulas: ['🎉', '✨', '🥂', '💫'], movimento: 'explodir', cor: 'rgba(250,204,21,' },
  brinde: { principal: '🥂', particulas: ['✨', '💫', '🔥'], movimento: 'brinde', cor: 'rgba(250,204,21,' },
  // Cabine
  beijo: { principal: '💋', particulas: ['💋', '💕', '💋'], movimento: 'pop', cor: 'rgba(244,63,94,' },
  pescoco: { principal: '🥵', particulas: ['💕', '🔥', '💋'], movimento: 'pop', cor: 'rgba(244,63,94,' },
  mao: { principal: '🤚', particulas: ['✨', '🔥', '💕'], movimento: 'deslizar', cor: 'rgba(251,113,133,' },
  roupa: { principal: '👙', particulas: ['👗', '👔', '🩲', '👠'], movimento: 'explodir', cor: 'rgba(217,70,239,' },
  colo: { principal: '🍑', particulas: ['🔥', '💕', '🍑'], movimento: 'quicar', cor: 'rgba(249,115,22,' },
  chupar: { principal: '👅', particulas: ['💦', '💦', '🔥'], movimento: 'tremer', cor: 'rgba(236,72,153,' },
  chupar_buceta: { principal: '👅', particulas: ['💦', '🌸', '💦', '🔥'], movimento: 'tremer', cor: 'rgba(244,63,94,' },
  chupar_pica: { principal: '🍆', particulas: ['👅', '💦', '💦'], movimento: 'quicar', cor: 'rgba(168,85,247,' },
  tocar: { principal: '🤤', particulas: ['💦', '✨', '🔥'], movimento: 'tremer', cor: 'rgba(236,72,153,' },
  cavalgar: { principal: '🔥', particulas: ['🍑', '💦', '🔥'], movimento: 'quicar', cor: 'rgba(239,68,68,' },
  quatro: { principal: '🍑', particulas: ['💥', '💦', '🔥'], movimento: 'tremer', cor: 'rgba(220,38,38,' },
  papai: { principal: '🛏️', particulas: ['💕', '💦', '🔥'], movimento: 'tremer', cor: 'rgba(225,29,72,' },
  // Troca de casais: cada opção com a sua cena.
  esposas_beijo: { principal: '💋', particulas: ['👭', '💕', '💋', '✨'], movimento: 'pop', cor: 'rgba(244,63,94,' },
  esposas_pegam: { principal: '👭', particulas: ['🍒', '🔥', '💕'], movimento: 'tremer', cor: 'rgba(236,72,153,' },
  marido_pega: { principal: '🕺', particulas: ['💃', '🤚', '🔥'], movimento: 'deslizar', cor: 'rgba(249,115,22,' },
  troca: { principal: '🔄', particulas: ['💋', '🔥', '😈', '✨'], movimento: 'trocar', cor: 'rgba(251,146,60,' },
  esposa_da: { principal: '💃', particulas: ['👀', '💦', '🔥', '🍑'], movimento: 'quicar', cor: 'rgba(220,38,38,' },
  lado_a_lado: { principal: '🛏️', particulas: ['💦', '🔥', '💕', '👀'], movimento: 'dupla', cor: 'rgba(225,29,72,' },
  gozar: { principal: '💦', particulas: ['💦', '💦', '💦', '🤤', '🔥'], movimento: 'explodir', cor: 'rgba(56,189,248,' },
};

export const temEfeito = (id?: string | null) => !!id && id in EFEITOS;
export const emojiDoEfeito = (id: string) => EFEITOS[id]?.principal ?? '✨';

export type ModoDoEfeito = 'cheio' | 'mini';
export type EfeitoNaFila = { id: string; efeito: string; texto?: string; modo?: ModoDoEfeito; vibrar?: boolean };

const DURACAO = { cheio: 2400, mini: 2000 } as const;

/**
 * Fila curta de efeitos: mostra um de cada vez. Com mais de `max` esperando, descarta
 * primeiro os "mini" (de outras pessoas) e depois os mais antigos.
 * Animações desligadas: não entra na fila, mas o som e a vibração de quem recebeu continuam.
 */
export function useFilaDeEfeitos(max = 3) {
  const [fila, setFila] = useState<EfeitoNaFila[]>([]);
  const adicionar = useCallback((e: EfeitoNaFila) => {
    if (!temEfeito(e.efeito)) return;
    if (!efeitosLigados()) {
      if ((e.modo ?? 'cheio') === 'cheio') void tocarSomDaCasa(e.efeito);
      if (e.vibrar) try { navigator.vibrate?.([40, 60, 80]); } catch { /* sem vibração */ }
      return;
    }
    setFila((f) => {
      if (f.some((x) => x.id === e.id)) return f;
      const n = [...f, e];
      if (n.length <= max) return n;
      const [atual, ...esperando] = n;
      const i = esperando.findIndex((x) => x.modo === 'mini' && x !== e);
      esperando.splice(i >= 0 ? i : 0, 1);
      return [atual, ...esperando];
    });
  }, [max]);
  const terminar = useCallback(() => setFila((f) => f.slice(1)), []);
  return { atual: fila[0] ?? null, adicionar, terminar };
}

export default function EfeitoDaCasa({ efeito, texto, onFim, modo = 'cheio', vibrar = false }: {
  efeito: string; texto?: string; onFim: () => void; modo?: ModoDoEfeito; vibrar?: boolean;
}) {
  const e = EFEITOS[efeito];
  const calmo = useMemo(() => movimentoReduzido(), []);
  useEffect(() => {
    if (modo === 'cheio') void tocarSomDaCasa(efeito);
    if (vibrar) try { navigator.vibrate?.([40, 60, 80]); } catch { /* sem vibração */ }
  }, [efeito, modo, vibrar]);
  useEffect(() => {
    const t = setTimeout(onFim, DURACAO[modo]);
    return () => clearTimeout(t);
  }, [onFim, modo]);
  const particulas = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    emoji: e?.particulas[i % e.particulas.length] ?? '✨',
    x: Math.round((Math.random() - 0.5) * 320),
    y: Math.round(-80 - Math.random() * 260),
    atraso: Math.round(Math.random() * 500),
    tam: 18 + Math.round(Math.random() * 18),
  })), [e]);
  // Rastro de brilho no fim: faíscas que saem em círculo quando o emoji some.
  const faiscas = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const ang = (i / 10) * Math.PI * 2;
    return { x: Math.round(Math.cos(ang) * 130), y: Math.round(Math.sin(ang) * 130) };
  }), []);
  if (!e) return null;

  const estilos = (
    <style>{`
      @keyframes efFundo { 0% { opacity: 0 } 15% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efPop { 0% { transform: scale(.2); opacity: 0 } 25% { transform: scale(1.25); opacity: 1 } 45% { transform: scale(1) } 85% { opacity: 1 } 100% { transform: scale(1.4); opacity: 0 } }
      @keyframes efTremer { 0% { transform: scale(.3); opacity: 0 } 15% { transform: scale(1.1); opacity: 1 } 20%,30%,40%,50%,60%,70% { transform: translate(-6px,2px) rotate(-6deg) scale(1.05) } 25%,35%,45%,55%,65%,75% { transform: translate(6px,-2px) rotate(6deg) scale(1.1) } 90% { opacity: 1 } 100% { transform: scale(1.3); opacity: 0 } }
      @keyframes efQuicar { 0% { transform: translateY(0) scale(.3); opacity: 0 } 12% { opacity: 1; transform: translateY(0) scale(1) } 22%,42%,62% { transform: translateY(-40px) scale(1.05,.95) } 32%,52%,72% { transform: translateY(10px) scale(1.15,.85) } 90% { opacity: 1 } 100% { transform: translateY(0) scale(1.2); opacity: 0 } }
      @keyframes efDeslizar { 0% { transform: translate(-120px,40px) rotate(-20deg); opacity: 0 } 20% { opacity: 1 } 60% { transform: translate(60px,-20px) rotate(10deg) } 85% { opacity: 1 } 100% { transform: translate(120px,-40px) rotate(20deg); opacity: 0 } }
      @keyframes efExplodir { 0% { transform: scale(.2); opacity: 0 } 18% { transform: scale(1.5); opacity: 1 } 30% { transform: scale(1.1) } 85% { opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }
      @keyframes efCopoA { 0% { transform: translateX(-140px) rotate(-25deg); opacity: 0 } 30% { opacity: 1 } 45% { transform: translateX(-28px) rotate(12deg) } 55% { transform: translateX(-40px) rotate(0) } 90% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efCopoB { 0% { transform: translateX(140px) scaleX(-1) rotate(-25deg); opacity: 0 } 30% { opacity: 1 } 45% { transform: translateX(28px) scaleX(-1) rotate(12deg) } 55% { transform: translateX(40px) scaleX(-1) rotate(0) } 90% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efTrocaA { 0% { transform: translate(-55px,0); opacity: 0 } 15% { opacity: 1; transform: translate(-55px,0) } 55% { transform: translate(0,-55px) } 80% { transform: translate(55px,0) } 92% { opacity: 1 } 100% { transform: translate(55px,0); opacity: 0 } }
      @keyframes efTrocaB { 0% { transform: translate(55px,0) scaleX(-1); opacity: 0 } 15% { opacity: 1; transform: translate(55px,0) scaleX(-1) } 55% { transform: translate(0,55px) scaleX(-1) } 80% { transform: translate(-55px,0) scaleX(-1) } 92% { opacity: 1 } 100% { transform: translate(-55px,0) scaleX(-1); opacity: 0 } }
      @keyframes efFica { 0% { opacity: 0 } 15% { opacity: 1 } 90% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efGira { 0% { opacity: 0; transform: rotate(0) scale(.5) } 30% { opacity: .5 } 85% { opacity: .5 } 100% { opacity: 0; transform: rotate(360deg) scale(1.2) } }
      @keyframes efParticula { 0% { transform: translate(0,0) scale(.4); opacity: 0 } 15% { opacity: 1 } 100% { transform: translate(var(--x), var(--y)) scale(1.1) rotate(25deg); opacity: 0 } }
      @keyframes efTexto { 0%,10% { opacity: 0; transform: translateY(10px) } 25% { opacity: 1; transform: translateY(0) } 85% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efSuave { 0% { opacity: 0; transform: scale(.9) } 20% { opacity: 1; transform: scale(1) } 80% { opacity: 1 } 100% { opacity: 0 } }
      @keyframes efAnel { 0% { transform: scale(.2); opacity: 0 } 30% { opacity: .9 } 100% { transform: scale(2.6); opacity: 0 } }
      @keyframes efFaisca { 0% { transform: translate(0,0) scale(.3); opacity: 0 } 25% { opacity: 1 } 100% { transform: translate(var(--x), var(--y)) scale(.9); opacity: 0 } }
      @keyframes efMini { 0% { opacity: 0; transform: translateY(-12px) scale(.9) } 15% { opacity: 1; transform: translateY(0) scale(1) } 85% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(-8px) } }
      @keyframes efMiniEmoji { 0%,100% { transform: scale(1) } 20% { transform: scale(1.35) rotate(-8deg) } 40% { transform: scale(1) rotate(6deg) } 60% { transform: scale(1.15) rotate(0) } }
    `}</style>
  );

  // Versão pequena: pílula no topo, sem som, para quem só está assistindo.
  if (modo === 'mini') {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] z-[9998] flex justify-center px-4" aria-hidden data-testid="efeito-casa-mini">
        {estilos}
        <div className="flex max-w-sm items-center gap-2 rounded-full border border-white/15 bg-black/75 py-1.5 pl-1.5 pr-4 text-white shadow-lg backdrop-blur"
          style={{ animation: `efMini ${DURACAO.mini}ms ease forwards`, boxShadow: `0 0 24px ${e.cor}0.45)` }}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl" style={{ background: `${e.cor}0.25)`, animation: calmo ? undefined : 'efMiniEmoji 1.2s ease' }}>{e.principal}</span>
          {texto && <p className="line-clamp-2 text-xs font-semibold leading-snug">{texto}</p>}
        </div>
      </div>
    );
  }

  const animPrincipal = calmo
    ? 'efSuave'
    : ({ pop: 'efPop', tremer: 'efTremer', quicar: 'efQuicar', deslizar: 'efDeslizar', explodir: 'efExplodir' } as Record<string, string>)[e.movimento] ?? 'efPop';

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center overflow-hidden" aria-hidden data-testid="efeito-casa-cheio">
      {estilos}
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, ${e.cor}${calmo ? '0.18' : '0.35'}) 0%, ${e.cor}0.08) 45%, transparent 70%)`, animation: 'efFundo 2.4s ease forwards' }} />
      {!calmo && particulas.map((p, i) => (
        <span key={i} className="absolute"
          style={{ fontSize: p.tam, ['--x' as any]: `${p.x}px`, ['--y' as any]: `${p.y}px`, animation: `efParticula 1.8s ease-out ${p.atraso}ms forwards`, opacity: 0 }}>
          {p.emoji}
        </span>
      ))}
      {/* Fim do efeito: anel de luz e faíscas saindo em círculo. */}
      {!calmo && (
        <>
          <span className="absolute h-40 w-40 rounded-full border-4 opacity-0" style={{ borderColor: `${e.cor}0.8)`, boxShadow: `0 0 40px ${e.cor}0.6)`, animation: 'efAnel 0.8s ease-out 1.6s forwards' }} />
          {faiscas.map((f, i) => (
            <span key={`f${i}`} className="absolute text-xl opacity-0" style={{ ['--x' as any]: `${f.x}px`, ['--y' as any]: `${f.y}px`, animation: 'efFaisca 0.8s ease-out 1.6s forwards' }}>✨</span>
          ))}
        </>
      )}
      {calmo || !['trocar', 'dupla', 'brinde'].includes(e.movimento) ? (
        <span className="relative text-8xl drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]" style={{ animation: `${animPrincipal} 2.4s ease forwards` }}>
          {e.principal}
        </span>
      ) : e.movimento === 'trocar' ? (
        // Dois casais: os maridos ficam, as esposas atravessam para o outro lado.
        <div className="relative flex h-40 w-80 items-center justify-center">
          <span className="absolute text-[9rem] opacity-0" style={{ animation: 'efGira 2.4s ease forwards' }}>{e.principal}</span>
          <span className="absolute left-0 text-6xl" style={{ animation: 'efFica 2.4s ease forwards' }}>🕺</span>
          <span className="absolute right-0 text-6xl" style={{ animation: 'efFica 2.4s ease forwards', transform: 'scaleX(-1)' }}>🕺</span>
          <span className="absolute text-6xl" style={{ animation: 'efTrocaA 2.4s ease-in-out forwards' }}>💃</span>
          <span className="absolute text-6xl" style={{ animation: 'efTrocaB 2.4s ease-in-out forwards' }}>💃</span>
        </div>
      ) : e.movimento === 'dupla' ? (
        <div className="relative flex items-center gap-6">
          <span className="text-7xl" style={{ animation: 'efTremer 2.4s ease forwards' }}>{e.principal}</span>
          <span className="text-7xl" style={{ animation: 'efTremer 2.4s ease 120ms forwards' }}>{e.principal}</span>
        </div>
      ) : (
        <div className="relative flex items-center">
          <span className="absolute text-7xl" style={{ animation: 'efCopoA 2.4s ease forwards' }}>{e.principal}</span>
          <span className="absolute text-7xl" style={{ animation: 'efCopoB 2.4s ease forwards' }}>{e.principal}</span>
        </div>
      )}
      {texto && (
        <p className="absolute bottom-[22%] left-4 right-4 text-center text-lg font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" style={{ animation: 'efTexto 2.4s ease forwards' }}>
          {texto}
        </p>
      )}
    </div>
  );
}
