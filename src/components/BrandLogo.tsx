import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
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

export function BrandLogo({ className, markClassName, textClassName, size = 'md', showText = true }: BrandLogoProps) {
  const sizing = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img
        src="/icon-96.png"
        alt="NoSigilo.net"
        width={MARK_PX}
        height={MARK_PX}
        className={cn('object-cover', sizing.mark, markClassName)}
      />
      {showText ? (
        <span className={cn('font-bold text-gradient', sizing.text, textClassName)}>
          NoSigilo.net
        </span>
      ) : null}
    </div>
  );
}

export default BrandLogo;
