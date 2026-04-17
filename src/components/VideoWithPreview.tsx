import { useEffect, useMemo, useState } from 'react';
import type { VideoHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type VideoWithPreviewProps = VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
};

const posterCache = new Map<string, string>();

async function buildPosterFromFirstFrame(src: string): Promise<string | null> {
  if (!src) return null;
  if (posterCache.has(src)) return posterCache.get(src) ?? null;

  return new Promise<string | null>((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;

    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      if (value) posterCache.set(src, value);
      resolve(value);
      cleanup();
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedData);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('seeked', captureFrame);
      video.removeEventListener('error', onError);
      window.clearTimeout(timeoutId);
      try {
        video.pause();
      } catch {}
      video.src = '';
    };

    const onError = () => finish(null);

    const captureFrame = () => {
      try {
        const width = Number(video.videoWidth || 0);
        const height = Number(video.videoHeight || 0);
        if (width <= 0 || height <= 0) return finish(null);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        finish(dataUrl || null);
      } catch {
        finish(null);
      }
    };

    const onLoadedData = () => {
      const duration = Number(video.duration || 0);
      const seekPoint = duration > 0.2 ? 0.2 : 0;
      if (seekPoint <= 0) {
        captureFrame();
        return;
      }
      try {
        video.currentTime = seekPoint;
      } catch {
        captureFrame();
      }
    };

    const timeoutId = window.setTimeout(() => finish(null), 7000);
    video.addEventListener('loadedmetadata', onLoadedData);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('seeked', captureFrame);
    video.addEventListener('error', onError);
    video.src = src;
    video.load();
  });
}

export default function VideoWithPreview({ className, src, poster, ...props }: VideoWithPreviewProps) {
  const [generatedPoster, setGeneratedPoster] = useState<string | null>(null);

  const normalizedSrc = useMemo(() => String(src || ''), [src]);

  useEffect(() => {
    let cancelled = false;
    if (!normalizedSrc) {
      setGeneratedPoster(null);
      return;
    }

    if (poster) {
      setGeneratedPoster(null);
      return;
    }

    void buildPosterFromFirstFrame(normalizedSrc).then((result) => {
      if (cancelled) return;
      setGeneratedPoster(result);
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedSrc, poster]);

  return (
    <video
      {...props}
      src={normalizedSrc}
      poster={poster || generatedPoster || '/placeholder.svg'}
      className={cn('bg-black/70', className)}
    />
  );
}
