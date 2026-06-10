import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clapperboard, SlidersHorizontal, MapPin, Heart, Play,
  X, Search, Clock, MessageCircle, Flame, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { videoSearchService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import MobileState from '@/components/MobileState';
import { cn } from '@/lib/utils';

const genderOptions = [
  { value: 'Mulher',            label: 'Mulher solteira' },
  { value: 'Homem',             label: 'Homem solteiro' },
  { value: 'Casal (Ele/Ela)',   label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)',   label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)',   label: 'Casal (Ela/Ela)' },
  { value: 'Transexual',        label: 'Pessoa trans' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)' },
  { value: 'Travesti',          label: 'Travesti' },
];

const distanceOptions = [
  { value: 'all', label: 'Qualquer distância' },
  { value: '10',  label: 'Até 10 km' },
  { value: '25',  label: 'Até 25 km' },
  { value: '50',  label: 'Até 50 km' },
  { value: '100', label: 'Até 100 km' },
  { value: '250', label: 'Até 250 km' },
];

type SortOption = 'recent' | 'liked' | 'commented';

type VideoItem = {
  mediaId: string;
  postId: string;
  videoUrl: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  distanceKm: number | null;
  author: {
    id: string;
    name: string;
    avatar: string | null;
    gender: string | null;
    city: string | null;
    state: string | null;
  };
};

const sortOptions: { value: SortOption; label: string; icon: React.ElementType }[] = [
  { value: 'recent',    label: 'Recentes',       icon: Clock },
  { value: 'liked',     label: 'Mais curtidos',  icon: Flame },
  { value: 'commented', label: 'Mais comentados',icon: MessageCircle },
];

function formatDistanceKm(d: number | null) {
  if (d === null || !Number.isFinite(d) || d < 0) return null;
  if (d < 1) return '< 1 km';
  return `${d.toLocaleString('pt-BR', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;
}

const PAGE_SIZE = 24;
const SEEN_VIDEOS_LS_KEY = 'nosigilo:seen-video-ids';
const SEEN_VIDEOS_MAX = 500;

function readSeenVideoIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_VIDEOS_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch { return new Set(); }
}

function addSeenVideoId(id: string) {
  try {
    const set = readSeenVideoIds();
    set.add(id);
    const arr = Array.from(set).slice(-SEEN_VIDEOS_MAX);
    localStorage.setItem(SEEN_VIDEOS_LS_KEY, JSON.stringify(arr));
  } catch {}
}

// ─── VideoCard com lazy-load + canvas thumbnail ───────────────────────────────
function VideoCard({
  item,
  premiumAccess,
  seen,
  onClick,
}: {
  seen?: boolean;
  item: VideoItem;
  premiumAccess: boolean;
  onClick: () => void;
}) {
  const cardRef    = useRef<HTMLButtonElement>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  const [shouldLoad,  setShouldLoad]  = useState(false); // lazy: src só definido quando perto
  const [thumbDone,   setThumbDone]   = useState(false); // canvas com 1º frame capturado
  const [isHovering,  setIsHovering]  = useState(false); // hover desktop

  // 1. IntersectionObserver — carrega o src só quando o card chega perto do viewport
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShouldLoad(true); obs.disconnect(); } },
      { rootMargin: '400px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 2. Captura o 1º frame no canvas assim que o vídeo sofreu seek
  const captureFrame = useCallback(() => {
    const vid    = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas || thumbDone) return;
    canvas.width  = vid.videoWidth  || 360;
    canvas.height = vid.videoHeight || 640;
    canvas.getContext('2d')?.drawImage(vid, 0, 0, canvas.width, canvas.height);
    setThumbDone(true);
  }, [thumbDone]);

  // 3. Quando metadados chegam, faz seek para 0.1 s para garantir que um frame está disponível
  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (vid && !thumbDone) vid.currentTime = 0.1;
  }, [thumbDone]);

  // 4. Hover (desktop / premium): toca o vídeo; ao sair volta ao canvas
  const handleMouseEnter = () => {
    if (!premiumAccess) return;
    setIsHovering(true);
    const vid = videoRef.current;
    if (vid) { vid.currentTime = 0; void vid.play().catch(() => {}); }
  };
  const handleMouseLeave = () => {
    setIsHovering(false);
    const vid = videoRef.current;
    if (vid) { vid.pause(); vid.currentTime = 0; }
  };

  return (
    <button
      ref={cardRef}
      type="button"
      className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-muted text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Skeleton enquanto o thumb não está pronto */}
      {!thumbDone && (
        <div className="absolute inset-0 animate-pulse bg-neutral-800" />
      )}

      {/* Canvas — exibido como thumbnail estático (não consome banda extra) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full transition-opacity duration-200"
        style={{
          objectFit: 'cover',
          opacity: thumbDone && !isHovering ? 1 : 0,
          pointerEvents: 'none',
        }}
      />

      {/* Elemento de vídeo — carregado apenas quando próximo ao viewport */}
      {shouldLoad && (
        <video
          ref={videoRef}
          src={resolveServerUrl(item.videoUrl)}
          className="h-full w-full object-cover transition-opacity duration-200"
          style={{ opacity: isHovering || !thumbDone ? 1 : 0 }}
          muted
          playsInline
          preload="metadata"
          loop
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={captureFrame}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}

      {/* Gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Badge "Já visto" */}
      {seen && (
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 backdrop-blur-sm">
          <Eye className="h-3 w-3 text-white/80" />
          <span className="text-[10px] font-semibold text-white/80">Visto</span>
        </div>
      )}

      {/* Badge premium */}
      {!premiumAccess && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
          <Play className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-semibold text-white">Premium</span>
        </div>
      )}

      {/* Play icon no hover */}
      {!isHovering && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
            <Play className={cn('h-5 w-5', premiumAccess ? 'fill-white' : 'text-primary')} />
          </div>
        </div>
      )}

      {/* Info bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          {item.author.avatar ? (
            <img
              src={resolveServerUrl(item.author.avatar)}
              alt={item.author.name}
              className="h-6 w-6 rounded-full object-cover ring-1 ring-white/30"
              loading="lazy"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold text-white ring-1 ring-white/30">
              {item.author.name.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white">
            {item.author.name}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {item.distanceKm !== null && (
            <Badge className="gap-0.5 bg-black/50 px-1.5 py-0 text-[10px] font-medium text-white/90 backdrop-blur-sm border-0">
              <MapPin className="h-2.5 w-2.5" />
              {formatDistanceKm(item.distanceKm)}
            </Badge>
          )}
          {item.likesCount > 0 && (
            <Badge className="gap-0.5 bg-black/50 px-1.5 py-0 text-[10px] font-medium text-white/90 backdrop-blur-sm border-0">
              <Heart className="h-2.5 w-2.5 fill-rose-400 text-rose-400" />
              {item.likesCount}
            </Badge>
          )}
          {item.commentsCount > 0 && (
            <Badge className="gap-0.5 bg-black/50 px-1.5 py-0 text-[10px] font-medium text-white/90 backdrop-blur-sm border-0">
              <MessageCircle className="h-2.5 w-2.5 text-sky-300" />
              {item.commentsCount}
            </Badge>
          )}
          {item.author.city && (
            <Badge className="hidden gap-0.5 bg-black/50 px-1.5 py-0 text-[10px] font-medium text-white/90 backdrop-blur-sm border-0 sm:flex">
              {item.author.city}{item.author.state ? `, ${item.author.state}` : ''}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
const PAGE_SIZE_CONST = PAGE_SIZE;

export default function SearchVideos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premiumAccess = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const [cityFilter,     setCityFilter]     = useState('');
  const [genderFilter,   setGenderFilter]   = useState('all');
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [sortFilter,     setSortFilter]     = useState<SortOption>('recent');
  const [showFilters,    setShowFilters]    = useState(false);
  const [onlyUnseen,     setOnlyUnseen]     = useState(false);
  const [seenIds,        setSeenIds]        = useState<Set<string>>(() => readSeenVideoIds());

  const [videos,         setVideos]         = useState<VideoItem[]>([]);
  const [page,           setPage]           = useState(1);
  const [hasMore,        setHasMore]        = useState(false);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isLoadingMore,  setIsLoadingMore]  = useState(false);
  const [fetchError,     setFetchError]     = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((p: number) => ({
    page:           p,
    limit:          PAGE_SIZE_CONST,
    gender:         genderFilter !== 'all' ? genderFilter : undefined,
    city:           cityFilter.trim() || undefined,
    maxDistanceKm:  distanceFilter !== 'all' ? Number(distanceFilter) : undefined,
    sort:           sortFilter !== 'recent' ? sortFilter : undefined,
  }), [genderFilter, cityFilter, distanceFilter, sortFilter]);

  const fetchFirstPage = useCallback(async () => {
    setIsLoading(true);
    setVideos([]);
    setPage(1);
    setHasMore(false);
    setFetchError(null);
    try {
      const data = await videoSearchService.search(buildParams(1));
      // Normalise response — backend may return `items` or `data` instead of `videos`
      const list = Array.isArray(data?.videos)
        ? data.videos
        : Array.isArray((data as any)?.items)
          ? (data as any).items
          : Array.isArray((data as any)?.data)
            ? (data as any).data
            : [];
      console.info('[SearchVideos] fetched', list.length, 'videos', buildParams(1));
      setVideos(list);
      setHasMore(data?.hasMore ?? false);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || 'Erro desconhecido';
      console.error('[SearchVideos] fetch error', status, msg, err);
      setFetchError(`Erro ${status ?? ''}: ${msg}`);
      setVideos([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  const fetchNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await videoSearchService.search(buildParams(nextPage));
      setVideos((prev) => {
        const seen = new Set(prev.map((v) => v.mediaId));
        return [...prev, ...data.videos.filter((v) => !seen.has(v.mediaId))];
      });
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch { /* ignore */ } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, buildParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchFirstPage(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchFirstPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    // Só começa a observar depois da primeira página carregada
    if (isLoading || videos.length === 0) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
        void fetchNextPage();
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextPage, hasMore, isLoadingMore, isLoading, videos.length]);

  const handleVideoClick = async (item: VideoItem) => {
    if (!premiumAccess) { setPaywallOpen(true); return; }
    const ok = await requireFields(['photo', 'birthDate']);
    if (!ok) return;
    // Mark as seen
    addSeenVideoId(item.mediaId);
    setSeenIds((prev) => { const next = new Set(prev); next.add(item.mediaId); return next; });
    // Salva o item no sessionStorage para o Reels injetar na posição 0
    // sem depender do feed carregar esse vídeo específico
    try {
      sessionStorage.setItem('nosigilo:target-reel', JSON.stringify({
        id: item.mediaId,
        postId: item.postId,
        url: resolveServerUrl(item.videoUrl),
        author: item.author,
        content: item.content,
        createdAt: item.createdAt,
        likesCount: item.likesCount,
        commentsCount: item.commentsCount,
        likedByMe: false,
      }));
    } catch { /* ignora falha de storage */ }
    navigate(`/reels?reelId=${encodeURIComponent(item.mediaId)}`);
  };

  const activeFilterCount = [
    genderFilter !== 'all',
    cityFilter.trim() !== '',
    distanceFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <div className="container mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Clapperboard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Buscar Vídeos</h1>
          <p className="text-sm text-muted-foreground">Encontre vídeos por perfil e localização</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cidade ou estado..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn('shrink-0 relative', showFilters && 'border-primary text-primary')}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Sort pills */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {sortOptions.map(({ value, label, icon: Icon }) => (
            <Fragment key={value}>
              <button
                type="button"
                onClick={() => setSortFilter(value)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  sortFilter === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
              {/* Filtro "Não vistos" — posicionado logo após "Mais curtidos" e antes de "Mais comentados" */}
              {value === 'liked' && (
                <button
                  type="button"
                  onClick={() => setOnlyUnseen((v) => !v)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    onlyUnseen
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-emerald-500/50 hover:text-foreground'
                  )}
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Não vistos
                </button>
              )}
            </Fragment>
          ))}
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tipo de perfil</p>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger><SelectValue placeholder="Todos os perfis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os perfis</SelectItem>
                  {genderOptions.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Distância máxima</p>
              <Select value={distanceFilter} onValueChange={setDistanceFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {distanceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  onClick={() => {
                    setCityFilter('');
                    setGenderFilter('all');
                    setDistanceFilter('all');
                    setSortFilter('recent');
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[9/16] animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && fetchError && (
        <MobileState
          icon={Clapperboard}
          title="Erro ao carregar vídeos"
          description={fetchError}
        />
      )}

      {/* Empty state */}
      {!isLoading && !fetchError && videos.length === 0 && (
        <MobileState
          icon={Clapperboard}
          title="Nenhum vídeo encontrado"
          description="Tente ajustar os filtros ou remover a cidade para ver mais resultados."
        />
      )}

      {/* Video grid */}
      {!isLoading && videos.length > 0 && (() => {
        const displayVideos = onlyUnseen ? videos.filter((v) => !seenIds.has(v.mediaId)) : videos;
        return (
          <>
            {onlyUnseen && (
              <p className="mb-3 text-xs text-muted-foreground">
                <EyeOff className="inline h-3.5 w-3.5 mr-1" />
                Mostrando {displayVideos.length} vídeo{displayVideos.length !== 1 ? 's' : ''} não vistos de {videos.length} carregados
              </p>
            )}
            {displayVideos.length === 0 ? (
              <MobileState
                icon={Eye}
                title="Você já viu todos os vídeos!"
                description="Desative o filtro 'Não vistos' para ver todos, ou aguarde novos vídeos serem publicados."
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {displayVideos.map((item) => (
                  <VideoCard
                    key={item.mediaId}
                    item={item}
                    premiumAccess={premiumAccess}
                    seen={seenIds.has(item.mediaId)}
                    onClick={() => void handleVideoClick(item)}
                  />
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
