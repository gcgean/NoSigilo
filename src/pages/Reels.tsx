import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, MessageCircle, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { feedService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { useNavigate } from 'react-router-dom';

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
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mutedById, setMutedById] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    feedService
      .getFeed({ page: 1, limit: 40 })
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
        ) as Array<ReelItem & { createdAt: string }>;

        setReels(nextReels as ReelItem[]);
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

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reels.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            void video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.7 }
    );

    Object.values(videoRefs.current).forEach((video) => {
      if (video) observer.observe(video);
    });

    return () => observer.disconnect();
  }, [reels]);

  const reelsWithMeta = useMemo(
    () =>
      reels.map((item: any) => ({
        ...item,
        identityLine: formatProfileIdentityLine(item.author),
        when: item.createdAt ? formatWhen(item.createdAt) : '',
      })),
    [reels]
  );

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-2xl">Reels</h1>
          <p className="text-[0.98rem] text-muted-foreground/90 sm:text-lg">Veja só os vídeos em formato vertical</p>
        </div>
      </div>

      {isLoading ? (
        <MobileState
          loading
          title="Carregando reels"
          description="Separando os vídeos do feed para você assistir em sequência."
        />
      ) : reelsWithMeta.length === 0 ? (
        <MobileState
          icon={Clapperboard}
          title="Nenhum reel disponível"
          description="Quando houver vídeos publicados no feed, eles vão aparecer aqui."
        />
      ) : (
        <div className="space-y-4">
          {reelsWithMeta.map((reel) => (
            <div
              key={reel.id}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-black shadow-sm"
              style={{ aspectRatio: '9 / 16' }}
            >
              <video
                ref={(node) => {
                  videoRefs.current[reel.id] = node;
                }}
                src={reel.url}
                className="h-full w-full object-cover"
                playsInline
                loop
                muted={mutedById[reel.id] ?? true}
                controls
                preload="metadata"
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

              <div className="absolute right-3 top-3 flex flex-col gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="pointer-events-auto h-10 w-10 rounded-full border-none bg-black/40 text-white hover:bg-black/55"
                  onClick={() =>
                    setMutedById((prev) => {
                      const nextMuted = !(prev[reel.id] ?? true);
                      const video = videoRefs.current[reel.id];
                      if (video) video.muted = nextMuted;
                      return { ...prev, [reel.id]: nextMuted };
                    })
                  }
                >
                  {mutedById[reel.id] ?? true ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
                </Button>
              </div>

              <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                <div className="mb-2 flex items-center gap-3">
                  <button
                    type="button"
                    className="overflow-hidden rounded-full"
                    onClick={() => navigate(`/users/${reel.author.id}`)}
                  >
                    {reel.author.avatar ? (
                      <img src={resolveServerUrl(reel.author.avatar)} alt={reel.author.name} className="h-10 w-10 object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
                        {String(reel.author.name || 'U')[0]}
                      </div>
                    )}
                  </button>
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="block truncate text-left text-sm font-semibold hover:underline"
                      onClick={() => navigate(`/users/${reel.author.id}`)}
                    >
                      {reel.author.name}
                    </button>
                    <p className="truncate text-xs text-white/70">{reel.identityLine || reel.when || 'Vídeo do feed'}</p>
                  </div>
                </div>

                {reel.content ? <p className="line-clamp-3 text-sm leading-6 text-white/90">{reel.content}</p> : null}

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 rounded-xl bg-white/15 px-4 text-sm font-medium text-white hover:bg-white/20"
                    onClick={() => navigate(`/users/${reel.author.id}`)}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Ver perfil
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 rounded-xl bg-gradient-primary px-4 text-sm font-medium text-white hover:opacity-90"
                    onClick={() => navigate('/chat')}
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Conversar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
