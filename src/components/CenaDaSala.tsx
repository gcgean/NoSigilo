import { resolveServerUrl } from '@/utils/serverUrl';

// Ambiente de cada quarto (só CSS, nada para baixar): bar neon, veludo, abajur
// vermelho, holofote âmbar e as paredes do glory. Escuro o bastante para ler.
export const CENA_DA_SALA: Record<string, string> = {
  salao: 'radial-gradient(ellipse 120% 55% at 50% 0%, rgba(168,85,247,.30), transparent 60%), radial-gradient(circle at 12% 88%, rgba(236,72,153,.20), transparent 35%), radial-gradient(circle at 88% 72%, rgba(59,130,246,.16), transparent 30%), radial-gradient(circle at 70% 20%, rgba(255,255,255,.06) 0 3px, transparent 4px), radial-gradient(circle at 30% 35%, rgba(255,255,255,.05) 0 2px, transparent 3px), repeating-linear-gradient(90deg, rgba(255,255,255,.025) 0 2px, transparent 2px 64px), linear-gradient(180deg, #160a22, #07060a)',
  casais: 'radial-gradient(ellipse 110% 50% at 50% 0%, rgba(244,63,94,.32), transparent 60%), radial-gradient(circle at 82% 92%, rgba(236,72,153,.22), transparent 40%), repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 16px, rgba(255,255,255,.025) 16px 34px), linear-gradient(180deg, #220712, #08040a)',
  quarto: 'radial-gradient(circle at 18% 12%, rgba(239,68,68,.38), transparent 34%), radial-gradient(ellipse 95% 40% at 50% 100%, rgba(127,29,29,.50), transparent 70%), radial-gradient(circle at 85% 30%, rgba(251,113,133,.10), transparent 25%), linear-gradient(180deg, #170404, #050202)',
  cuckold: 'conic-gradient(from 165deg at 50% -8%, transparent 0deg, rgba(245,158,11,.24) 15deg, transparent 30deg), radial-gradient(ellipse 85% 40% at 50% 100%, rgba(180,83,9,.30), transparent 70%), radial-gradient(circle at 10% 50%, rgba(220,38,38,.12), transparent 30%), linear-gradient(180deg, #150b02, #050302)',
  glory: 'radial-gradient(circle at 28% 38%, rgba(220,38,38,.40) 0 20px, rgba(0,0,0,.9) 24px, transparent 70px), radial-gradient(circle at 74% 64%, rgba(220,38,38,.32) 0 16px, rgba(0,0,0,.9) 20px, transparent 60px), radial-gradient(circle at 60% 18%, rgba(220,38,38,.22) 0 12px, transparent 45px), repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 30px), linear-gradient(180deg, #0c0000, #000)',
};
export const cenaDaSala = (id: string) => CENA_DA_SALA[id] ?? CENA_DA_SALA.salao;

// Cor de cada quarto aplicada sobre a foto de fundo (mesma família da cena).
const TINTA_DA_SALA: Record<string, string> = {
  salao: '#a855f7', casais: '#f43f5e', quarto: '#dc2626', cuckold: '#d97706', glory: '#b91c1c',
};

export type FotoDeFundo = { url: string; intensidade: number };

/**
 * Fundo da sala: a cena em CSS e, se o admin configurou, a foto como papel de
 * parede (preto e branco, levemente desfocada, tingida com a cor da sala e
 * escurecida nas bordas). Fica atrás de tudo; o pai precisa ser `relative`/`fixed`
 * com `isolate` ou z-index próprio para o tingimento não vazar.
 */
export default function CenaDaSala({ salaId, foto }: { salaId: string; foto?: FotoDeFundo | null }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: cenaDaSala(salaId) }} />
      {foto && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center"
            style={{
              backgroundImage: `url("${resolveServerUrl(foto.url)}")`,
              opacity: foto.intensidade,
              filter: 'grayscale(1) contrast(1.15) brightness(.8) blur(1.5px)',
              transform: 'scale(1.03)',
            }}
          />
          <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: TINTA_DA_SALA[salaId] ?? TINTA_DA_SALA.salao, mixBlendMode: 'color' }} />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/10 to-black/60" />
        </>
      )}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
    </>
  );
}
