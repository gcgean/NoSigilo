import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import VideoWithPreview from './VideoWithPreview';

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
            className="relative w-full"
            style={aspectStyle ? aspectStyle(m.id) : { minHeight: 200 }}
          >
            {/* Thumbnail visível — poster gerado do primeiro frame */}
            <VideoWithPreview
              src={resolveUrl(m.url)}
              className="h-full w-full object-contain sm:object-cover"
              muted
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) =>
                onAspectLoaded?.(m.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)
              }
            />
            {/* Overlay leve — thumbnail aparece por baixo */}
            <div
              className="absolute inset-0 cursor-pointer"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.08) 100%)' }}
              onClick={onPremiumGate}
            >
              {/* Ícone de play + cadeado centralizado */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-[2px] ring-2 ring-white/20">
                  <Crown className="w-7 h-7 text-yellow-400 drop-shadow" />
                </div>
              </div>
              {/* Texto fixado na base */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                  Assinar para assistir
                </span>
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="relative w-full" style={aspectStyle ? aspectStyle(m.id) : {}}>
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
      <div className="relative w-full" style={aspectStyle ? aspectStyle(m.id) : {}}>
        <img
          src={resolveUrl(m.url)}
          alt=""
          draggable={false}
          className="h-full w-full bg-black object-contain sm:object-cover select-none"
          style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
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
