import { useEffect, useRef, useState } from 'react';
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
  onAspectLoaded?: (id: string, w: number, h: number) => void;
  aspectStyle?: (id: string) => React.CSSProperties;
  premiumAccess?: boolean;
  onPremiumGate?: () => void;
  /**
   * Quando true, a mídia é exibida inteira dentro de um quadro horizontal e as
   * laterais vazias recebem uma cópia borrada da própria imagem. Usado no feed
   * em desktop para que retratos não fiquem altos demais — sem cortar a foto.
   */
  fitToFrame?: (id: string) => boolean;
}

// ─── Preview Gate (3s play → paywall) ────────────────────────────────────────
function VideoPreviewGate({
  src,
  style,
  onAspectLoaded,
  onPremiumGate,
}: {
  src: string;
  style?: React.CSSProperties;
  onAspectLoaded?: (w: number, h: number) => void;
  onPremiumGate?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewDone, setPreviewDone] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  // Arrange progress bar animation right after play starts
  useEffect(() => {
    if (isPlaying && !previewDone) {
      // Next frame: animate from 0 → 100% over 3 s
      const raf = requestAnimationFrame(() => setBarWidth(100));
      return () => cancelAnimationFrame(raf);
    }
    setBarWidth(0);
  }, [isPlaying, previewDone]);

  // IntersectionObserver: play when ≥40% visible, stop if scrolled away
  useEffect(() => {
    const video = videoRef.current;
    if (!video || previewDone) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting) {
          void video.play()
            .then(() => setIsPlaying(true))
            .catch(() => {});

          timerRef.current = setTimeout(() => {
            video.pause();
            setPreviewDone(true);
            setIsPlaying(false);
          }, 3000);
        } else {
          video.pause();
          setIsPlaying(false);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        }
      },
      { threshold: 0.4 }
    );

    observer.observe(video);
    return () => {
      observer.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [previewDone]);

  return (
    <div className="relative w-full" style={style}>
      <video
        ref={videoRef}
        src={src}
        className="h-full w-full object-contain sm:object-cover bg-black/70"
        muted
        playsInline
        preload="metadata"
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        onLoadedMetadata={(e) =>
          onAspectLoaded?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
        }
      />

      {/* Barra de progresso do preview (0 → 100% em 3 s) */}
      {isPlaying && !previewDone && (
        <div className="absolute bottom-0 left-0 right-0 z-10 h-1 bg-black/30">
          <div
            className="h-full bg-yellow-400"
            style={{
              width: `${barWidth}%`,
              transition: barWidth === 100 ? 'width 3s linear' : 'none',
            }}
          />
        </div>
      )}

      {/* Overlay de paywall — aparece após os 3 s */}
      {previewDone && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 cursor-pointer animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(3px)' }}
          onClick={onPremiumGate}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 ring-2 ring-yellow-400/50">
            <Crown className="w-8 h-8 text-yellow-400 drop-shadow" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-white drop-shadow">Assinar para assistir</p>
            <p className="text-xs text-white/65 mt-0.5">Preview de 3s encerrado</p>
          </div>
        </div>
      )}

      {/* Overlay leve antes do preview começar (video ainda carregando / não visível) */}
      {!isPlaying && !previewDone && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.04) 100%)' }}
          onClick={onPremiumGate}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 ring-2 ring-white/20">
            <Crown className="w-7 h-7 text-yellow-400 drop-shadow" />
          </div>
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            Preview de 3s • Toque para assistir
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Carousel ────────────────────────────────────────────────────────────
export function PostMediaCarousel({
  media,
  resolveUrl,
  onAspectLoaded,
  aspectStyle,
  premiumAccess = false,
  onPremiumGate,
  fitToFrame,
}: PostMediaCarouselProps) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (!media || media.length === 0) return null;

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
    const fitted = fitToFrame?.(m.id) ?? false;

    if (isVideo) {
      if (!premiumAccess) {
        return (
          <VideoPreviewGate
            key={m.id}
            src={resolveUrl(m.url)}
            style={aspectStyle ? aspectStyle(m.id) : { minHeight: 200 }}
            onAspectLoaded={(w, h) => onAspectLoaded?.(m.id, w, h)}
            onPremiumGate={onPremiumGate}
          />
        );
      }
      return (
        <div className="relative w-full overflow-hidden" style={aspectStyle ? aspectStyle(m.id) : {}}>
          <VideoWithPreview
            src={resolveUrl(m.url)}
            className={cn(
              'relative h-full w-full bg-black',
              fitted ? 'object-contain' : 'object-contain sm:object-cover'
            )}
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
      <div className="relative w-full overflow-hidden" style={aspectStyle ? aspectStyle(m.id) : {}}>
        {fitted && (
          <img
            src={resolveUrl(m.url)}
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          />
        )}
        <img
          src={resolveUrl(m.url)}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          className={cn(
            'relative h-full w-full select-none',
            fitted ? 'object-contain' : 'bg-black object-contain sm:object-cover'
          )}
          style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
          onLoad={(e) =>
            onAspectLoaded?.(m.id, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
          }
        />
      </div>
    );
  }

  // Single item — no carousel overhead
  if (media.length === 1) {
    return (
      <div className="relative rounded-lg overflow-hidden">
        {renderSlide(media[0])}
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

      {/* Arrow buttons (desktop) */}
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
