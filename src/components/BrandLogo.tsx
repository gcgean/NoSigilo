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
        <linearGradient id="nosigilo-brand-stroke" x1="20" y1="16" x2="112" y2="112" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4A8FF" />
          <stop offset="0.5" stopColor="#D76BFF" />
          <stop offset="1" stopColor="#A93BFF" />
        </linearGradient>
        <filter id="nosigilo-brand-glow" x="0" y="0" width="128" height="128" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="1 0 0 0 0.64  0 1 0 0 0.23  0 0 1 0 1  0 0 0 1 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#nosigilo-brand-glow)" stroke="url(#nosigilo-brand-stroke)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M40 49V34C40 20.75 50.75 10 64 10C77.25 10 88 20.75 88 34V49" strokeWidth="7" />
        <path d="M30 49H84C92.84 49 100 56.16 100 65V88C100 96.84 92.84 104 84 104H30C21.16 104 14 96.84 14 88V65C14 56.16 21.16 49 30 49Z" strokeWidth="7" />
        <path d="M57 73C57 69.13 60.13 66 64 66C67.87 66 71 69.13 71 73C71 75.63 69.55 77.93 67.4 79.13V87H60.6V79.13C58.45 77.93 57 75.63 57 73Z" strokeWidth="6" />
        <path d="M87.5 63.5L111 71.5V85.5C111 98.92 101.64 108.97 87.5 113.5C73.36 108.97 64 98.92 64 85.5V71.5L87.5 63.5Z" strokeWidth="6" />
        <path d="M87.5 76.5L98 80V85.5C98 92.67 93.8 98.31 87.5 101.25C81.2 98.31 77 92.67 77 85.5V80L87.5 76.5Z" strokeWidth="5" />
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
          'flex items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgba(37,99,235,0.22),transparent_35%),linear-gradient(180deg,#101827_0%,#050816_100%)] shadow-[0_18px_40px_rgba(169,59,255,0.26)]',
          sizing.mark,
          markClassName
        )}
      >
        <BrandGlyph className={cn('text-white', sizing.icon)} />
      </div>
      {showText ? <span className={cn('font-bold text-gradient', sizing.text, textClassName)}>NoSigilo</span> : null}
    </div>
  );
}

export default BrandLogo;
