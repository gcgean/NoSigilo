import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
};

const sizeClasses = {
  sm: { mark: 'h-10 w-10 rounded-xl p-2', icon: 'h-6 w-6', text: 'text-xl' },
  md: { mark: 'h-12 w-12 rounded-xl p-2.5', icon: 'h-7 w-7', text: 'text-2xl' },
  lg: { mark: 'h-16 w-16 rounded-2xl p-3', icon: 'h-10 w-10', text: 'text-3xl' },
  xl: { mark: 'h-24 w-24 rounded-3xl p-4.5', icon: 'h-16 w-16', text: 'text-4xl' },
};

function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nosigilo-brand-stroke" x1="34" y1="22" x2="98" y2="96" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB8F6" />
          <stop offset="0.5" stopColor="#F472FF" />
          <stop offset="1" stopColor="#8B5CFF" />
        </linearGradient>
        <filter id="nosigilo-brand-glow" x="0" y="0" width="128" height="128" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#050816" floodOpacity="0.44" />
        </filter>
      </defs>
      <g filter="url(#nosigilo-brand-glow)" stroke="url(#nosigilo-brand-stroke)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M44 52V45.5C44 31.97 54.97 21 68.5 21C80.87 21 91.09 30.18 92.71 42.11" strokeWidth="7" />
        <path d="M39 52H76C84.84 52 92 59.16 92 68V81C92 89.84 84.84 97 76 97H39C30.16 97 23 89.84 23 81V68C23 59.16 30.16 52 39 52Z" strokeWidth="7" />
        <path d="M57.5 72C57.5 68.41 60.41 65.5 64 65.5C67.59 65.5 70.5 68.41 70.5 72C70.5 74.39 69.21 76.48 67.29 77.61V84.5H60.71V77.61C58.79 76.48 57.5 74.39 57.5 72Z" fill="url(#nosigilo-brand-stroke)" stroke="none" />
        <path d="M81.5 43.5L104.5 50.75V63.5C104.5 75.46 96.41 84.76 84 88.5C71.59 84.76 63.5 75.46 63.5 63.5V50.75L81.5 45.08" strokeWidth="6" />
        <path d="M84 55L87.09 61.26L94 62.26L89 67.13L90.18 74L84 70.75L77.82 74L79 67.13L74 62.26L80.91 61.26L84 55Z" fill="url(#nosigilo-brand-stroke)" stroke="none" />
      </g>
    </svg>
  );
}

export function BrandLogo({ className, markClassName, textClassName, size = 'md', showText = true }: BrandLogoProps) {
  const sizing = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'flex items-center justify-center bg-[radial-gradient(circle_at_30%_18%,rgba(255,135,243,0.32),transparent_34%),linear-gradient(180deg,#1b2450_0%,#11162e_48%,#060814_100%)] shadow-[0_20px_44px_rgba(98,76,255,0.28)]',
          sizing.mark,
          markClassName
        )}
      >
        <BrandGlyph className={cn('text-white', sizing.icon)} />
      </div>
      {showText ? <span className={cn('font-bold text-gradient', sizing.text, textClassName)}>NoSigilo.net</span> : null}
    </div>
  );
}

export default BrandLogo;
