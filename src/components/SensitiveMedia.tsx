import { useState } from 'react';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SensitiveMediaProps {
  src: string;
  alt?: string;
  className?: string;
  aspectRatio?: 'video' | 'square' | 'portrait';
  isSensitive?: boolean;
  warningText?: string;
}

export default function SensitiveMedia({
  src,
  alt = '',
  className,
  aspectRatio = 'video',
  isSensitive = true,
  warningText = 'Este conteúdo pode ser sensível',
}: SensitiveMediaProps) {
  const [isBlurred, setIsBlurred] = useState(isSensitive);

  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    portrait: 'aspect-[3/4]',
  };

  if (!isSensitive) {
    return (
      <div className={cn('relative overflow-hidden rounded-lg', aspectClasses[aspectRatio], className)}>
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-lg group', aspectClasses[aspectRatio], className)}>
      <img
        src={src}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-all duration-300',
          isBlurred && 'blur-xl scale-110'
        )}
      />

      {isBlurred && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <AlertTriangle className="w-8 h-8 text-warning mb-2" />
          <p className="text-sm text-white text-center px-4 mb-3">{warningText}</p>
          <button
            onClick={() => setIsBlurred(false)}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm transition-colors"
          >
            <Eye className="w-4 h-4" />
            Mostrar
          </button>
        </div>
      )}

      {!isBlurred && (
        <button
          onClick={() => setIsBlurred(true)}
          className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <EyeOff className="w-4 h-4 text-white" />
        </button>
      )}
    </div>
  );
}
