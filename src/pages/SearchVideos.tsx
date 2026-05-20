import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, SlidersHorizontal, MapPin, Heart, Play, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { videoSearchService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { hasPremiumAccess } from '@/utils/premium';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import MobileState from '@/components/MobileState';
import { cn } from '@/lib/utils';

const genderOptions = [
  { value: 'Mulher',          label: 'Mulher solteira' },
  { value: 'Homem',           label: 'Homem solteiro' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)' },
  { value: 'Transexual',      label: 'Pessoa trans' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)' },
  { value: 'Travesti',        label: 'Travesti' },
];

const distanceOptions = [
  { value: 'all', label: 'Qualquer distância' },
  { value: '10',  label: 'Até 10 km' },
  { value: '25',  label: 'Até 25 km' },
  { value: '50',  label: 'Até 50 km' },
  { value: '100', label: 'Até 100 km' },
  { value: '250', label: 'Até 250 km' },
];

type VideoItem = {
  mediaId: string;
  postId: string;
  videoUrl: string;
  content: string;
  createdAt: string;
  likesCount: number;
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

function formatDistanceKm(d: number | null) {
  if (d === null || !Number.isFinite(d) || d < 0) return null;
  if (d < 1) return '< 1 km';
  return `${d.toLocaleString('pt-BR', { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;
}

const PAGE_SIZE = 24;

export default function SearchVideos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const premiumAccess = hasPremiumAccess(user);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Filters
  const [cityFilter, setCityFilter]         = useState('');
  const [genderFilter, setGenderFilter]     = useState('all');
  const [distanceFilter, setDistanceFilter] = useState('all');
  const [showFilters, setShowFilters]       = useState(false);

  // Results
  const [videos, setVideos]           = useState<VideoItem[]>([]);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Hovering thumbnail
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback((p: number) => ({
    page: p,
    limit: PAGE_SIZE,
    gender:         genderFilter !== 'all' ? genderFilter : undefined,
    city:           cityFilter.trim() || undefined,
    maxDistanceKm:  distanceFilter !== 'all' ? Number(distanceFilter) : undefined,
  }), [genderFilter, cityFilter, distanceFilter]);

  const fetchFirstPage = useCallback(async () => {
    setIsLoading(true);
    setVideos([]);
    setPage(1);
    setHasMore(false);
    try {
      const data = await videoSearchService.search(buildParams(1));
      setVideos(data.videos);
      setHasMore(data.hasMore);
    } catch {
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
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, page, buildParams]);

  // Debounced search on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void fetchFirstPage(); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchFirstPage]);

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !isLoadingMore && !isLoading) {
        void fetchNextPage();
      }
    }, { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextPage, hasMore, isLoadingMore, isLoading]);

  // Hover: play / pause video preview
  const handleMouseEnter = (mediaId: string) => {
    setHoveredId(mediaId);
    const vid = videoRefs.current[mediaId];
    if (vid) {
      vid.currentTime = 0;
      void vid.play().catch(() => {});
    }
  };
  const handleMouseLeave = (mediaId: string) => {
    setHoveredId(null);
    const vid = videoRefs.current[mediaId];
    if (vid) {
      vid.pause();
      vid.currentTime = 0;
    }
  };

  const handleVideoClick = (item: VideoItem) => {
    if (!premiumAccess) { setPaywallOpen(true); return; }
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
          {/* City search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cidade ou estado..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {/* Toggle filters */}
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

        {/* Expanded filters */}
        {showFilters && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 sm:grid-cols-2">
            {/* Gender */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Tipo de perfil</p>
              <Select value={genderFilter} onValueChange={setGenderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os perfis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os perfis</SelectItem>
                  {genderOptions.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Distance */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Distância máxima</p>
              <Select value={distanceFilter} onValueChange={setDistanceFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {distanceOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground"
                  onClick={() => { setCityFilter(''); setGenderFilter('all'); setDistanceFilter('all'); }}
                >
                  <X className="h-3.5 w-3.5" />
                  Limpar filtros
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

      {/* Empty state */}
      {!isLoading && videos.length === 0 && (
        <MobileState
          icon={Clapperboard}
          title="Nenhum vídeo encontrado"
          description="Tente ajustar os filtros ou remover a cidade para ver mais resultados."
        />
      )}

      {/* Video grid */}
      {!isLoading && videos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {videos.map((item) => (
            <button
              key={item.mediaId}
              type="button"
              className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-black text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => handleVideoClick(item)}
              onMouseEnter={() => handleMouseEnter(item.mediaId)}
              onMouseLeave={() => handleMouseLeave(item.mediaId)}
            >
              {/* Video element — shows first frame as thumbnail, plays on hover */}
              <video
                ref={(node) => { videoRefs.current[item.mediaId] = node; }}
                src={resolveServerUrl(item.videoUrl)}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
                loop
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
              />

              {/* Gradient overlay */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

              {/* Premium blur overlay for non-subscribers */}
              {!premiumAccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-1.5 px-2 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 border border-primary/30">
                      <Play className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-[11px] font-semibold text-white/90 leading-tight">Assine para assistir</p>
                  </div>
                </div>
              )}

              {/* Play indicator on hover (premium only) */}
              {premiumAccess && hoveredId !== item.mediaId && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
                    <Play className="h-5 w-5 fill-white" />
                  </div>
                </div>
              )}

              {/* Bottom info */}
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                {/* Author row */}
                <div className="flex items-center gap-1.5 mb-1">
                  {item.author.avatar ? (
                    <img
                      src={resolveServerUrl(item.author.avatar)}
                      alt={item.author.name}
                      className="h-6 w-6 rounded-full object-cover ring-1 ring-white/30"
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

                {/* Badges row */}
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
                  {item.author.city && (
                    <Badge className="gap-0.5 bg-black/50 px-1.5 py-0 text-[10px] font-medium text-white/90 backdrop-blur-sm border-0 hidden sm:flex">
                      {item.author.city}
                      {item.author.state ? `, ${item.author.state}` : ''}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {/* Load more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Paywall modal */}
      <ReferralPaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}
