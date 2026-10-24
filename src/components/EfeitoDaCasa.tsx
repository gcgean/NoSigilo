import { useEffect, useMemo } from 'react';

/**
 * Efeito animado por cima da tela (drinks, brinde e ações da cabine).
 * Não bloqueia toques e some sozinho em ~2,4 s.
 */
type Movimento = 'pop' | 'tremer' | 'quicar' | 'brinde' | 'deslizar' | 'explodir';
const EFEITOS: Record<string, { principal: string; particulas: string[]; movimento: Movimento; cor: string }> = {
  // Bar
  cerveja: { principal: '🍺', particulas: ['🫧', '🫧', '🍺'], movimento: 'brinde', cor: 'rgba(245,158,11,' },
  caipirinha: { principal: '🍹', particulas: ['🍋', '🧊', '🍃'], movimento: 'pop', cor: 'rgba(132,204,22,' },
  gin: { principal: '🍸', particulas: ['✨', '🧊', '🫧'], movimento: 'pop', cor: 'rgba(56,189,248,' },
  champanhe: { principal: '🍾', particulas: ['🎉', '✨', '🥂', '💫'], movimento: 'explodir', cor: 'rgba(250,204,21,' },
  brinde: { principal: '🥂', particulas: ['✨', '💫', '🔥'], movimento: 'brinde', cor: 'rgba(250,204,21,' },
  // Cabine
  beijo: { principal: '💋', particulas: ['💋', '💕', '💋'], movimento: 'pop', cor: 'rgba(244,63,94,' },
  pescoco: { principal: '😮‍💨', particulas: ['💕', '🔥', '💋'], movimento: 'pop', cor: 'rgba(244,63,94,' },
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
  gozar: { principal: '💦', particulas: ['💦', '💦', '💦', '🤤', '🔥'], movimento: 'explodir', cor: 'rgba(56,189,248,' },
};

export const temEfeito = (id?: string | null) => !!id && id in EFEITOS;

export default function EfeitoDaCasa({ efeito, texto, onFim }: { efeito: string; texto?: string; onFim: () => void }) {
  const e = EFEITOS[efeito];
  useEffect(() => {
    const t = setTimeout(onFim, 2400);
    return () => clearTimeout(t);
  }, [onFim]);
  const particulas = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    emoji: e?.particulas[i % e.particulas.length] ?? '✨',
    x: Math.round((Math.random() - 0.5) * 320),
    y: Math.round(-80 - Math.random() * 260),
    atraso: Math.round(Math.random() * 500),
    tam: 18 + Math.round(Math.random() * 18),
  })), [e]);
  if (!e) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] flex items-center justify-center overflow-hidden" aria-hidden>
      <style>{`
        @keyframes efFundo { 0% { opacity: 0 } 15% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes efPop { 0% { transform: scale(.2); opacity: 0 } 25% { transform: scale(1.25); opacity: 1 } 45% { transform: scale(1) } 85% { opacity: 1 } 100% { transform: scale(1.4); opacity: 0 } }
        @keyframes efTremer { 0% { transform: scale(.3); opacity: 0 } 15% { transform: scale(1.1); opacity: 1 } 20%,30%,40%,50%,60%,70% { transform: translate(-6px,2px) rotate(-6deg) scale(1.05) } 25%,35%,45%,55%,65%,75% { transform: translate(6px,-2px) rotate(6deg) scale(1.1) } 90% { opacity: 1 } 100% { transform: scale(1.3); opacity: 0 } }
        @keyframes efQuicar { 0% { transform: translateY(0) scale(.3); opacity: 0 } 12% { opacity: 1; transform: translateY(0) scale(1) } 22%,42%,62% { transform: translateY(-40px) scale(1.05,.95) } 32%,52%,72% { transform: translateY(10px) scale(1.15,.85) } 90% { opacity: 1 } 100% { transform: translateY(0) scale(1.2); opacity: 0 } }
        @keyframes efDeslizar { 0% { transform: translate(-120px,40px) rotate(-20deg); opacity: 0 } 20% { opacity: 1 } 60% { transform: translate(60px,-20px) rotate(10deg) } 85% { opacity: 1 } 100% { transform: translate(120px,-40px) rotate(20deg); opacity: 0 } }
        @keyframes efExplodir { 0% { transform: scale(.2); opacity: 0 } 18% { transform: scale(1.5); opacity: 1 } 30% { transform: scale(1.1) } 85% { opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }
        @keyframes efCopoA { 0% { transform: translateX(-140px) rotate(-25deg); opacity: 0 } 30% { opacity: 1 } 45% { transform: translateX(-28px) rotate(12deg) } 55% { transform: translateX(-40px) rotate(0) } 90% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes efCopoB { 0% { transform: translateX(140px) scaleX(-1) rotate(-25deg); opacity: 0 } 30% { opacity: 1 } 45% { transform: translateX(28px) scaleX(-1) rotate(12deg) } 55% { transform: translateX(40px) scaleX(-1) rotate(0) } 90% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes efParticula { 0% { transform: translate(0,0) scale(.4); opacity: 0 } 15% { opacity: 1 } 100% { transform: translate(var(--x), var(--y)) scale(1.1) rotate(25deg); opacity: 0 } }
        @keyframes efTexto { 0%,10% { opacity: 0; transform: translateY(10px) } 25% { opacity: 1; transform: translateY(0) } 85% { opacity: 1 } 100% { opacity: 0 } }
      `}</style>
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at center, ${e.cor}0.35) 0%, ${e.cor}0.08) 45%, transparent 70%)`, animation: 'efFundo 2.4s ease forwards' }} />
      {particulas.map((p, i) => (
        <span key={i} className="absolute"
          style={{ fontSize: p.tam, ['--x' as any]: `${p.x}px`, ['--y' as any]: `${p.y}px`, animation: `efParticula 1.8s ease-out ${p.atraso}ms forwards`, opacity: 0 }}>
          {p.emoji}
        </span>
      ))}
      {e.movimento === 'brinde' ? (
        <div className="relative flex items-center">
          <span className="absolute text-7xl" style={{ animation: 'efCopoA 2.4s ease forwards' }}>{e.principal}</span>
          <span className="absolute text-7xl" style={{ animation: 'efCopoB 2.4s ease forwards' }}>{e.principal}</span>
        </div>
      ) : (
        <span className="relative text-8xl drop-shadow-[0_0_30px_rgba(255,255,255,0.35)]"
          style={{ animation: `${{ pop: 'efPop', tremer: 'efTremer', quicar: 'efQuicar', deslizar: 'efDeslizar', explodir: 'efExplodir' }[e.movimento]} 2.4s ease forwards` }}>
          {e.principal}
        </span>
      )}
      {texto && (
        <p className="absolute bottom-[22%] left-4 right-4 text-center text-lg font-black text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" style={{ animation: 'efTexto 2.4s ease forwards' }}>
          {texto}
        </p>
      )}
    </div>
  );
}
