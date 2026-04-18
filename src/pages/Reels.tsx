import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Heart, MessageCircle, Play, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { feedService, interactionsService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfileHref } from '@/utils/userProfileNavigation';

type FeedMedia = { id: string; url: string | null; mimeType?: string | null };
type FeedPost = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
  media: FeedMedia[];
};

type ReelItem = {
  id: string;
  postId: string;
  url: string;
  author: FeedPost['author'];
  content: string;
  createdAt: string;
};

function getSeenRapStorageKey(userId?: string | null) {
  return `nosigilo:rap:seen:${userId || 'anon'}`;
}

function formatWhen(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export default function Reels() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [initialSeenReelIds, setInitialSeenReelIds] = useState<string[]>([]);
  const [, setSeenReelIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mutedById, setMutedById] = useState<Record<string, boolean>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedByPostId, setLikedByPostId] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getSeenRapStorageKey(user?.id));
      const parsed = raw ? JSON.parse(raw) : [];
      const nextSeenIds = Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
      setInitialSeenReelIds(nextSeenIds);
      setSeenReelIds(nextSeenIds);
    } catch {
      setInitialSeenReelIds([]);
      setSeenReelIds([]);
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    feedService
      .getFeed({ page: 1, limit: 40, includeReelsOnly: true })
      .then((data) => {
        if (cancelled) return;
        const posts = Array.isArray(data?.posts) ? (data.posts as FeedPost[]) : [];
        const nextReels = posts.flatMap((post) =>
          (post.media || [])
            .filter((media) => String(media.mimeType || '').startsWith('video/') && media.url)
            .map((media) => ({
              id: String(media.id),
              postId: String(post.id),
              url: resolveServerUrl(media.url || ''),
              author: post.author,
              content: String(post.content || ''),
              createdAt: String(post.createdAt || ''),
            }))
        ) as ReelItem[];

        setReels(nextReels);
        setMutedById(
          nextReels.reduce<Record<string, boolean>>((acc, item) => {
            acc[item.id] = true;
            return acc;
          }, {})
        );
      })
      .catch(() => {
        if (cancelled) return;
        setReels([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const orderedReels = useMemo(() => {
    const seenIds = new Set(initialSeenReelIds);
    const unseen = reels.filter((item) => !seenIds.has(item.id));
    const seen = reels.filter((item) => seenIds.has(item.id));
    return [...unseen, ...seen];
  }, [initialSeenReelIds, reels]);

  const markReelAsSeen = useCallback((reelId: string) => {
    if (!reelId) return;

    setSeenReelIds((prev) => {
      if (prev.includes(reelId)) return prev;
      const next = [...prev, reelId];
      try {
        localStorage.setItem(getSeenRapStorageKey(user?.id), JSON.stringify(next));
      } catch {
        // Ignora falha de persistência local sem quebrar a navegação
      }
      return next;
    });
  }, [user?.id]);

  useEffect(() => {
    if (orderedReels.length === 0) {
      setPlayingId(null);
      setCurrentIndex(0);
      return;
    }

    if (!playingId || !orderedReels.some((item) => item.id === playingId)) {
      setPlayingId(orderedReels[0].id);
      setCurrentIndex(0);
    }
  }, [orderedReels, playingId]);

  // IntersectionObserver: play/pause on visibility + track current index
  useEffect(() => {
    if (orderedReels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const el = entry.target as HTMLDivElement;
          const id = el.dataset.reelId;
          if (!id) return;
          const video = videoRefs.current[id];
          if (!video) return;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            void video.play().catch(() => {});
            setPlayingId(id);
            markReelAsSeen(id);
            const idx = orderedReels.findIndex((r) => r.id === id);
            if (idx !== -1) setCurrentIndex(idx);
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.6 }
    );

    Object.values(itemRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [markReelAsSeen, orderedReels]);

  const scrollTo = useCallback((idx: number) => {
    const reel = orderedReels[idx];
    if (!reel) return;
    const el = itemRefs.current[reel.id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [orderedReels]);

  const handleVideoEnded = useCallback((idx: number) => {
    const next = idx + 1;
    if (next < orderedReels.length) {
      scrollTo(next);
    } else {
      scrollTo(0);
    }
  }, [orderedReels.length, scrollTo]);

  const toggleMute = useCallback((id: string) => {
    setMutedById((prev) => {
      const nextMuted = !(prev[id] ?? true);
      const video = videoRefs.current[id];
      if (video) video.muted = nextMuted;
      return { ...prev, [id]: nextMuted };
    });
  }, []);

  const togglePlay = useCallback((id: string) => {
    const video = videoRefs.current[id];
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
      setPlayingId(id);
    } else {
      video.pause();
      setPlayingId(null);
    }
  }, []);

  const reelsWithMeta = useMemo(
    () =>
      orderedReels.map((item) => ({
        ...item,
        identityLine: formatProfileIdentityLine(item.author),
        when: item.createdAt ? formatWhen(item.createdAt) : '',
      })),
    [orderedReels]
  );

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <MobileState
          loading
          title="Carregando Rap"
          description="Separando os vídeos do feed para você assistir em sequência."
        />
      </div>
    );
  }

  if (reelsWithMeta.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-8rem)] items-center justify-center">
        <MobileState
          icon={Clapperboard}
          title="Nenhum vídeo disponível"
          description="Quando houver vídeos publicados no feed, eles vão aparecer aqui."
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-y-scroll"
      style={{
        height: 'calc(100dvh - 8rem)',
        scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch',
      } as React.CSSProperties}
    >
      {/* Navigation arrows (desktop) */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(currentIndex - 1)}
          className="fixed left-1/2 top-24 z-50 hidden -translate-x-1/2 items-center justify-center rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 md:flex"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
      {currentIndex < orderedReels.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(currentIndex + 1)}
          className="fixed bottom-24 left-1/2 z-50 hidden -translate-x-1/2 items-center justify-center rounded-full bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60 md:flex"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      {reelsWithMeta.map((reel, idx) => (
        <div
          key={reel.id}
          ref={(node) => { itemRefs.current[reel.id] = node; }}
          data-reel-id={reel.id}
          className="relative flex w-full items-center justify-center bg-black"
          style={{
            height: 'calc(100dvh - 8rem)',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}
        >
          {/* Video */}
          <video
            ref={(node) => { videoRefs.current[reel.id] = node; }}
            src={reel.url}
            className="h-full w-full object-cover"
            playsInline
            loop={false}
            muted={mutedById[reel.id] ?? true}
            preload="metadata"
            onEnded={() => handleVideoEnded(idx)}
            onClick={() => togglePlay(reel.id)}
          />

          {/* Dark gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

          {/* Top — counter */}
          <div className="absolute left-0 right-0 top-4 flex justify-center">
            <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
              {idx + 1} / {orderedReels.length}
            </span>
          </div>

          {/* Right side actions */}
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4">
            {/* Mute */}
            <button
              type="button"
              onClick={() => toggleMute(reel.id)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60"
            >
              {mutedById[reel.id] ?? true
                ? <VolumeX className="h-5 w-5" />
                : <Volume2 className="h-5 w-5" />}
            </button>

            {/* Like */}
            <button
              type="button"
              onClick={async () => {
                if (!user) return;
                const already = likedByPostId[reel.postId];
                setLikedByPostId(prev => ({ ...prev, [reel.postId]: !already }));
                try {
                  if (already) {
                    await interactionsService.unlike('post', reel.postId);
                  } else {
                    await interactionsService.like('post', reel.postId);
                  }
                } catch {
                  // Revert optimistic update
                  setLikedByPostId(prev => ({ ...prev, [reel.postId]: already }));
                }
              }}
              className="flex flex-col items-center gap-1 text-white"
            >
              <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition hover:bg-black/60 ${likedByPostId[reel.postId] ? 'bg-rose-500/70' : 'bg-black/40'}`}>
                <Heart className={`h-5 w-5 ${likedByPostId[reel.postId] ? 'fill-white' : ''}`} />
              </div>
            </button>

            {/* Open in feed */}
            <button
              type="button"
              onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              className="flex flex-col items-center gap-1 text-white"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition hover:bg-black/60">
                <MessageCircle className="h-5 w-5" />
              </div>
            </button>
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 text-white">
            {/* Author */}
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                className="overflow-hidden rounded-full ring-2 ring-white/30"
                onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              >
                {reel.author.avatar ? (
                  <img
                    src={resolveServerUrl(reel.author.avatar)}
                    alt={reel.author.name}
                    className="h-11 w-11 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                    {String(reel.author.name || 'U')[0].toUpperCase()}
                  </div>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block truncate text-left text-[15px] font-semibold hover:underline"
                  onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
                >
                  {reel.author.name}
                </button>
                <p className="truncate text-xs text-white/70">
                  {reel.identityLine || reel.when || 'Rap'}
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-white hover:opacity-90"
                onClick={() => navigate(getUserProfileHref(reel.author.id, user?.id, '/rap'))}
              >
                Ver perfil
              </Button>
            </div>

            {/* Caption */}
            {reel.content ? (
              <p className="line-clamp-2 text-sm leading-6 text-white/90">{reel.content}</p>
            ) : null}

            {/* Swipe hint — only on first video */}
            {idx === 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-white/50">
                <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
                <span className="text-xs">Deslize para o próximo vídeo</span>
              </div>
            )}
          </div>

          {/* Paused overlay */}
          {playingId !== reel.id && (
            <button
              type="button"
              onClick={() => togglePlay(reel.id)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
                <Play className="h-8 w-8 translate-x-0.5 text-white" />
              </div>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
