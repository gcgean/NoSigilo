import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crown, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import VideoWithPreview from './VideoWithPreview';
import { Button } from './ui/button';

export interface PostMediaItem {
  id: string;
  url: string;
  mimeType: string;
}

interface PostMediaCarouselProps {
  media: PostMediaItem[];
  resolveUrl: (url: string) => string;
  /** Pass to compute aspect-ratio box for images/videos */
  onAspectLoaded?: (id: string, w: number, h: number) => void;
  aspectStyle?: (id: string) => React.CSSProperties;
  premiumAccess?: boolean;
  onPremiumGate?: () => void;
}

export function PostMediaCarousel({
  media,
  resolveUrl,
  onAspectLoaded,
  aspectStyle,
  premiumAccess = false,
  onPremiumGate,
}: PostMediaCarouselProps) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (!media || media.length === 0) return null;

  // Single item — no carousel overhead
  if (media.length === 1) {
    const m = media[0];
    return (
      <div className="relative rounded-lg overflow-hidden">
        {renderSlide(m)}
      </div>
    );
  }

  const prev = () => setIndex((i) => (i - 1 + media.length) % media.length);
  const next = () => setIndex((i) => (i + 1) % media.length);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) next();
    else prev();
  }

  function renderSlide(m: PostMediaItem) {
    const isVideo = String(m.mimeType || '').startsWith('video/');

    if (isVideo) {
      if (!premiumAccess) {
        return (
          <div
            className="w-full bg-secondary/30 border flex flex-col items-center justify-center gap-3"
            style={aspectStyle ? aspectStyle(m.id) : { minHeight: 200 }}
          >
            <Lock className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Vídeos disponíveis apenas para Premium</p>
            <Button
              size="sm"
              className="bg-gradient-primary hover:opacity-90 gap-2"
              onClick={onPremiumGate}
            >
              <Crown className="w-4 h-4" /> Ver planos
            </Button>
          </div>
        );
      }
      return (
        <div className="w-full" style={aspectStyle ? aspectStyle(m.id) : {}}>
          <VideoWithPreview
            src={resolveUrl(m.url)}
            className="h-full w-full bg-black object-contain sm:object-cover"
            controls
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) =>
              onAspectLoaded?.(m.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)
            }
          />
        </div>
      );
    }

    return (
      <div className="w-full" style={aspectStyle ? aspectStyle(m.id) : {}}>
        <img
          src={resolveUrl(m.url)}
          alt=""
          className="h-full w-full bg-black object-contain sm:object-cover"
          onLoad={(e) =>
            onAspectLoaded?.(m.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
        />
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-lg select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Current slide */}
      {renderSlide(media[index])}

      {/* Counter badge */}
      <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white font-medium z-10">
        {index + 1}/{media.length}
      </span>

      {/* Arrow buttons (visible on desktop / wide screens) */}
      <button
        type="button"
        onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 z-10"
        aria-label="Anterior"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 z-10"
        aria-label="Próxima"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {media.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className={cn(
              'rounded-full transition-all duration-200',
              i === index
                ? 'w-4 h-1.5 bg-white'
                : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/75'
            )}
            aria-label={`Foto ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
