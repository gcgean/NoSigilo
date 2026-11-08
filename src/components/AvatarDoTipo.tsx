import { useId } from 'react';
import { cn } from '@/lib/utils';
import { inicialDoNome, tipoDoPerfil, type FormaDoTipo } from '@/utils/tipoDoPerfil';

// Busto em silhueta, desenhado num quadro 100x100 e centrado em x=50.
// Feminino: cabelo longo caindo nos ombros, pescoço fino, ombros estreitos.
const FEMININO =
  'M50 17C35 17 30 30 31 43C32 55 28 64 23 73C30 75 35 72 38 68C39 70 40 72 42 73C34 75 27 82 25 100H75C73 82 66 75 58 73C60 72 61 70 62 68C65 72 70 75 77 73C72 64 68 55 69 43C70 30 65 17 50 17Z';
// Masculino: cabelo curto, pescoço e ombros largos.
const MASCULINO =
  'M50 18C40 18 35 25 35 35C35 44 39 52 44 56V62C31 64 19 72 17 100H83C81 72 69 64 56 62V56C61 52 65 44 65 35C65 25 60 18 50 18Z';

function Busto({ forma, x = 0, escala = 1, opacidade = 1, fill }: { forma: 'f' | 'm'; x?: number; escala?: number; opacidade?: number; fill: string }) {
  return (
    <path
      d={forma === 'f' ? FEMININO : MASCULINO}
      fill={fill}
      opacity={opacidade}
      transform={`translate(${50 + x - 50 * escala} ${100 - 100 * escala}) scale(${escala})`}
    />
  );
}

/**
 * Silhueta em neon (rosa → roxo) do tipo de perfil. Adulta e discreta: busto,
 * sem rosto. Casal = duas silhuetas lado a lado, a de trás mais apagada.
 */
export function SilhuetaDoTipo({ forma, className, luz = true }: { forma: FormaDoTipo; className?: string; luz?: boolean }) {
  const id = useId().replace(/:/g, '');
  const fill = `url(#sil-${id})`;
  const dupla = forma.length === 2;
  return (
    <svg viewBox="0 0 100 100" className={cn('h-full w-full', className)} aria-hidden>
      <defs>
        <linearGradient id={`sil-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <radialGradient id={`luz-${id}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ec4899" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
        </radialGradient>
      </defs>
      {luz && <rect width="100" height="100" fill={`url(#luz-${id})`} />}
      {dupla ? (
        <>
          <Busto forma={forma[1] as 'f' | 'm'} x={13} escala={0.82} opacidade={0.55} fill={fill} />
          <Busto forma={forma[0] as 'f' | 'm'} x={-12} escala={0.86} fill={fill} />
        </>
      ) : (
        <Busto forma={forma as 'f' | 'm'} escala={0.92} fill={fill} />
      )}
    </svg>
  );
}

/** Conteúdo do AvatarFallback: silhueta do tipo, ou a inicial quando o tipo não é conhecido. */
export function FotoAusente({ name, gender }: { name?: string | null; gender?: string | null }) {
  const tipo = tipoDoPerfil(gender);
  if (!tipo) return <>{inicialDoNome(name)}</>;
  return (
    <span className="flex h-full w-full items-end justify-center overflow-hidden bg-neutral-950" role="img" aria-label={`${tipo.rotulo} sem foto`}>
      <SilhuetaDoTipo forma={tipo.forma} />
    </span>
  );
}

/** Fundo grande (card da Busca e do Match) para perfil sem foto. */
export function FundoDoTipo({ name, gender, className }: { name?: string | null; gender?: string | null; className?: string }) {
  const tipo = tipoDoPerfil(gender);
  return (
    <div className={cn('flex h-full w-full items-end justify-center overflow-hidden bg-gradient-to-b from-neutral-950 via-neutral-900 to-black', className)}>
      {tipo ? (
        <span className="mb-[18%] block aspect-square w-[78%] drop-shadow-[0_0_18px_rgba(236,72,153,0.45)]" role="img" aria-label={`${tipo.rotulo} sem foto`}>
          <SilhuetaDoTipo forma={tipo.forma} luz={false} />
        </span>
      ) : (
        <span className="mb-auto mt-auto select-none text-5xl font-bold text-primary/50">{inicialDoNome(name)}</span>
      )}
    </div>
  );
}
