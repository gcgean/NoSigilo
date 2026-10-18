import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  /** Só o cadeado no ícone (sem o "NoSigilo.net" de dentro do círculo), para usar com o nome ao lado. */
  soCadeado?: boolean;
};

const sizeClasses = {
  sm: { mark: 'h-10 w-10 rounded-xl',   text: 'text-xl' },
  md: { mark: 'h-12 w-12 rounded-xl',   text: 'text-2xl' },
  lg: { mark: 'h-16 w-16 rounded-2xl',  text: 'text-3xl' },
  xl: { mark: 'h-24 w-24 rounded-3xl',  text: 'text-4xl' },
};

// A marca aparece no máximo a 96px (tamanho `xl` em tela 2x). O icon.jpg
// original tinha 1254px e 76 KB — mais de 30x a resolução usada.
const MARK_PX = 96;

export function BrandLogo({ className, markClassName, textClassName, size = 'md', showText = true, soCadeado = false }: BrandLogoProps) {
  const sizing = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {soCadeado ? (
        // Recorte da logomarca no cadeado: amplia 2x e centraliza nele, deixando
        // de fora o texto de dentro do círculo; o aro neon é refeito por fora.
        <span
          role="img"
          aria-label="NoSigilo.net"
          className={cn('block shrink-0 rounded-full p-[2px] shadow-[0_0_18px_rgba(236,72,153,0.55)]', sizing.mark.replace(/rounded-\S+/, ''), markClassName)}
          style={{ backgroundImage: 'linear-gradient(135deg, #ff3fbf, #8b5cf6 55%, #3b82f6)' }}
        >
          <span
            className="block h-full w-full rounded-full bg-[#0b0618]"
            style={{ backgroundImage: 'url(/icon-512.png)', backgroundSize: '185%', backgroundPosition: '50% 32%' }}
          />
        </span>
      ) : (
      <img
        src="/icon-96.png"
        alt="NoSigilo.net"
        width={MARK_PX}
        height={MARK_PX}
        className={cn('object-cover', sizing.mark, markClassName)}
      />
      )}
      {showText ? (
        <span className={cn('font-bold text-gradient', sizing.text, textClassName)}>
          NoSigilo.net
        </span>
      ) : null}
    </div>
  );
}

export default BrandLogo;
