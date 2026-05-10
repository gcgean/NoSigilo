import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Filter, MapPin, Heart, Sparkles, Radar as RadarIcon, SlidersHorizontal, Camera } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usersService, matchService, locationService } from '@/services/api';
import { resolveServerUrl } from '@/utils/serverUrl';
import { calculateAge } from '@/utils/age';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NavLink } from 'react-router-dom';
import { UserAvatar } from '@/components/UserAvatar';
import { CitySearch } from '@/components/CitySearch';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useToast } from '@/hooks/use-toast';

const genderOptions = [
  { value: 'Mulher', label: 'Mulher solteira' },
  { value: 'Homem', label: 'Homem solteiro' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)' },
  { value: 'Transexual', label: 'Pessoa trans' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)' },
  { value: 'Travesti', label: 'Travesti' },
];

const PAGE_SIZE = 24;

function formatDistanceKm(distanceKm: unknown) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return `${distanceKm.toLocaleString('pt-BR', {
    minimumFractionDigits: distanceKm < 10 && !Number.isInteger(distanceKm) ? 1 : 0,
    maximumFractionDigits: distanceKm < 10 ? 1 : 0,
  })} km de você`;
}

export default function SearchPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Results / pagination state
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Liked profiles mode
  const [onlyLiked, setOnlyLiked] = useState(false);
  const [likedProfiles, setLikedProfiles] = useState<any[]>([]);
  const [filteredLiked, setFilteredLiked] = useState<any[]>([]);

  // Filters
  const [ageRange, setAgeRange] = useState('all');
  const [city, setCity] = useState('');
  const [radar, setRadar] = useState('all');
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [sort, setSort] = useState<'nearby' | 'active' | 'new'>('nearby');

  // Sentinel ref for IntersectionObserver (infinite scroll)
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounce ref for text inputs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  const buildParams = useCallback(
    (p: number) => ({
      page: p,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      city: city.trim() || undefined,
      ageRange: ageRange !== 'all' ? ageRange : undefined,
      genders: selectedGenders.length > 0 ? selectedGenders.join(',') : undefined,
      radar: radar !== 'all' ? radar : undefined,
      sort,
    }),
    [search, city, ageRange, selectedGenders, radar, sort]
  );

  const applyLikedFilters = useCallback(
    (profiles: any[]) => {
      const q = search.trim().toLowerCase();
      const c = city.trim().toLowerCase();
      return profiles
        .filter((p) => {
          const name   = String(p?.name  || '').toLowerCase();
          const pCity  = String(p?.city  || '').toLowerCase();
          const pState = String(p?.state || '').toLowerCase();
          const age    = calculateAge(p?.birthDate);

          if (q && !name.includes(q) && !pCity.includes(q) && !pState.includes(q)) return false;
          if (c && !pCity.includes(c) && !pState.includes(c)) return false;
          if (selectedGenders.length > 0 && !selectedGenders.includes(String(p?.gender || ''))) return false;
          if (ageRange !== 'all') {
            if (!age) return false;
            if (ageRange === '18-25' && (age < 18 || age > 25)) return false;
            if (ageRange === '26-35' && (age < 26 || age > 35)) return false;
            if (ageRange === '36-45' && (age < 36 || age > 45)) return false;
            if (ageRange === '45+' && age < 45) return false;
          }
          return true;
        })
        .sort((a, b) => {
          const aDistance = typeof a?.distanceKm === 'number' ? a.distanceKm : Number.POSITIVE_INFINITY;
          const bDistance = typeof b?.distanceKm === 'number' ? b.distanceKm : Number.POSITIVE_INFINITY;
          if (aDistance !== bDistance) return aDistance - bDistance;
          return String(b?.likedAt || '').localeCompare(String(a?.likedAt || ''));
        });
    },
    [search, city, ageRange, selectedGenders]
  );

  // ── fetch first page (reset) ───────────────────────────────────────────────
  const fetchFirstPage = useCallback(async () => {
    if (onlyLiked) {
      setFilteredLiked(applyLikedFilters(likedProfiles));
      return;
    }
    setIsLoading(true);
    setResults([]);
    setPage(1);
    setHasMore(false);
    try {
      const data = await usersService.searchUsers(buildParams(1));
      setResults(data.users);
      setHasMore(data.hasMore);
      setPage(1);
    } catch {
      setResults([]);
      setHasMore(false);
      toast({
        title: 'Erro ao buscar perfis',
        description: 'Não foi possível carregar os resultados. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [onlyLiked, buildParams, applyLikedFilters, likedProfiles, toast]);

  // ── fetch next page ────────────────────────────────────────────────────────
  const fetchNextPage = useCallback(async () => {
    if (isLoadingMore || !hasMore || onlyLiked) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await usersService.searchUsers(buildParams(nextPage));
      setResults((prev) => [...prev, ...data.users]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch {
      // silently ignore load-more errors
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, onlyLiked, page, buildParams]);

  // ── IntersectionObserver for infinite scroll ──────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage]);

  // ── Load liked profiles once ───────────────────────────────────────────────
  useEffect(() => {
    matchService
      .getLikedProfiles()
      .then((list) => setLikedProfiles(Array.isArray(list) ? list : []))
      .catch(() => setLikedProfiles([]));
  }, []);

  // ── React to filter changes (debounce text, immediate for dropdowns) ───────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchFirstPage();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, city]);

  useEffect(() => {
    void fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageRange, radar, selectedGenders, onlyLiked, sort]);

  // ── Update filtered liked when raw list changes ────────────────────────────
  useEffect(() => {
    if (onlyLiked) setFilteredLiked(applyLikedFilters(likedProfiles));
  }, [likedProfiles, onlyLiked, applyLikedFilters]);

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const handleGenderToggle = (gender: string) => {
    setSelectedGenders((prev) =>
      prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender]
    );
  };

  const displayResults = onlyLiked ? filteredLiked : results;
  const isEmpty        = !isLoading && displayResults.length === 0;

  const hasDistanceData = displayResults.some((p) => typeof p.distanceKm === 'number');

  type ProfileGroup = { label: string; profiles: any[] };
  const groupedResults: ProfileGroup[] = (() => {
    if (!hasDistanceData || onlyLiked || sort !== 'nearby') return [];
    const city_: any[]    = [];
    const near: any[]     = [];
    const distant: any[]  = [];
    const unknown: any[]  = [];
    for (const p of displayResults) {
      const d = p.distanceKm;
      if (typeof d !== 'number') { unknown.push(p); continue; }
      if (d <= 5)  city_.push(p);
      else if (d <= 50) near.push(p);
      else distant.push(p);
    }
    const groups: ProfileGroup[] = [];
    if (city_.length)    groups.push({ label: 'Na sua cidade', profiles: city_ });
    if (near.length)     groups.push({ label: 'Até 50 km',     profiles: near });
    if (distant.length)  groups.push({ label: 'Mais distantes', profiles: distant });
    if (unknown.length)  groups.push({ label: 'Outros',         profiles: unknown });
    return groups;
  })();

  const useGroups = groupedResults.length > 0;

  const handleUseDeviceRadar = async () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Geolocalização indisponível',
        description: 'Seu navegador não suporta localização por GPS.',
        variant: 'destructive',
      });
      return;
    }

    setIsLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      });

      await locationService.updateLocation(position.coords.latitude, position.coords.longitude);
      if (radar === 'all') setRadar('25');
      await fetchFirstPage();

      toast({
        title: 'Localização atualizada',
        description: 'Busca por proximidade ativada com a localização do seu dispositivo.',
      });
    } catch {
      toast({
        title: 'Não foi possível usar o GPS',
        description: 'Permita o acesso à localização do dispositivo para buscar por proximidade.',
        variant: 'destructive',
      });
    } finally {
      setIsLocating(false);
    }
  };

  const ProfileCard = ({ profile }: { profile: any }) => {
    const age = calculateAge(profile.birthDate);
    const avatarUrl = profile.mainMediaUrl ? resolveServerUrl(profile.mainMediaUrl) : undefined;
    const distanceLabel = formatDistanceKm(profile.distanceKm);
    return (
      <NavLink
        to={getUserProfileHref(profile.id, undefined, '/search')}
        className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl transition-all hover:shadow-glow"
      >
        <div className="aspect-[4/5] w-full min-[420px]:aspect-[3/4]">
          <UserAvatar
            user={{ ...profile, avatar: avatarUrl ?? profile.avatar }}
            className="w-full h-full rounded-none"
            indicatorClassName="hidden"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 sm:right-3 sm:top-3 sm:gap-2">
          {distanceLabel ? (
            <Badge variant="secondary" className="h-5 rounded-full border-none bg-black/45 px-2 text-[10px] font-medium text-white backdrop-blur-md">
              {distanceLabel}
            </Badge>
          ) : null}
          {profile.isOnline ? (
            <span className="h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" title="Online agora" />
          ) : profile.lastSeenAt ? (
            <Badge variant="secondary" className="h-5 rounded-full border-none bg-black/40 px-2 text-[10px] font-medium text-white backdrop-blur-md">
              {format(new Date(profile.lastSeenAt), 'HH:mm', { locale: ptBR })}
            </Badge>
          ) : null}
        </div>
        {profile.isVerified && (
          <Badge className="absolute left-2.5 top-2.5 h-5 gap-1 rounded-full bg-success/90 px-2 text-[10px] font-medium text-white sm:left-3 sm:top-3">
            <Sparkles className="h-3 w-3" />
          </Badge>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4">
          <h3 className="truncate text-[0.95rem] font-semibold leading-tight text-white sm:text-lg">
            {profile.name}{age ? `, ${age}` : ''}
          </h3>
          {distanceLabel ? (
            <div className="truncate text-xs text-white/85 sm:text-sm">{distanceLabel}</div>
          ) : null}
          {formatProfileIdentityLine(profile) ? (
            <div className="truncate text-xs text-white/70 sm:text-sm">{formatProfileIdentityLine(profile)}</div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-white/70 sm:text-sm">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{profile.city || '—'}</span>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          <Button size="icon" className="w-14 h-14 rounded-full bg-gradient-primary shadow-glow">
            <Heart className="w-6 h-6" />
          </Button>
        </div>
      </NavLink>
    );
  };

  // Gate: user must have a profile photo to use Search
  if (!user?.avatar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6 max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Camera className="w-10 h-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Foto necessária para Buscar</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Para aparecer nos resultados de busca e ver outros perfis, você precisa de uma foto de perfil.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate('/profile')}>
          Adicionar foto de perfil
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 overflow-x-hidden pb-24 md:pb-0">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="mb-1.5 text-[1.8rem] font-bold sm:mb-2 sm:text-2xl">Buscar</h1>
        <p className="text-[0.98rem] leading-6 text-muted-foreground sm:text-base">Encontre casais e singles compatíveis com o seu interesse</p>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou cidade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-xl border-2 border-primary/15 bg-background pl-11 pr-4 text-base focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-10 sm:rounded-md sm:border-input sm:pl-10 sm:text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:flex sm:flex-row">
          <Button
            type="button"
            variant={onlyLiked ? 'default' : 'outline'}
            onClick={() => setOnlyLiked((prev) => !prev)}
            className={
              onlyLiked
                ? 'animate-liked-filter h-11 w-full justify-center rounded-xl gap-2 border-0 bg-gradient-primary px-4 text-sm font-medium text-white hover:opacity-95 motion-reduce:animate-none'
                : 'h-11 w-full justify-center rounded-xl gap-2 border-primary/50 bg-primary/5 px-4 text-sm font-medium text-primary hover:bg-primary/10'
            }
          >
            <Heart className={onlyLiked ? 'w-4 h-4 fill-current' : 'w-4 h-4'} />
            Somente curtidos
            <span
              className={
                onlyLiked
                  ? 'rounded-full bg-pink-300/30 px-2 py-0.5 text-xs font-semibold text-white'
                  : 'rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-600'
              }
            >
              {likedProfiles.length}
            </span>
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            className="h-11 w-full justify-center rounded-xl gap-2 px-4 text-sm font-medium sm:self-auto"
          >
            <Filter className="w-4 h-4" />
            Filtros
          </Button>
        </div>
      </div>

      {/* Quick distance + sort bar */}
      {!onlyLiked && (
        <div className="mb-4 flex flex-col gap-2 sm:mb-5">
          {/* Distance quick buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {([['all','Qualquer'],['10','10 km'],['25','25 km'],['50','50 km']] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setRadar(v)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  radar === v
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Sort buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {([['nearby','Próximos'],['active','Ativos'],['new','Novos']] as const).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setSort(v)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  sort === v
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="glass mb-4 animate-slide-up space-y-5 rounded-xl p-4 sm:mb-6 sm:p-6 sm:space-y-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Idade</label>
              <Select value={ageRange} onValueChange={setAgeRange}>
                <SelectTrigger className="h-12 rounded-xl text-base sm:h-10 sm:rounded-md sm:text-sm">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="18-25">18–25</SelectItem>
                  <SelectItem value="26-35">26–35</SelectItem>
                  <SelectItem value="36-45">36–45</SelectItem>
                  <SelectItem value="45+">45+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Radar (km)</label>
              <div className="relative">
                <RadarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Select value={radar} onValueChange={setRadar}>
                  <SelectTrigger className="h-12 rounded-xl pl-9 text-base sm:h-10 sm:rounded-md sm:text-sm">
                    <SelectValue placeholder="Raio de busca" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualquer</SelectItem>
                    <SelectItem value="10">Até 10 km</SelectItem>
                    <SelectItem value="25">Até 25 km</SelectItem>
                    <SelectItem value="50">Até 50 km</SelectItem>
                    <SelectItem value="100">Até 100 km</SelectItem>
                    <SelectItem value="500">Até 500 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleUseDeviceRadar()}
                disabled={isLocating}
                className="mt-2 h-11 w-full justify-center gap-2 rounded-xl text-sm"
              >
                <MapPin className="h-4 w-4" />
                {isLocating ? 'Obtendo localização...' : 'Usar GPS do dispositivo'}
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cidade</label>
              <CitySearch
                value={city}
                onChange={setCity}
                onSelect={(c) => setCity(c)}
                showLocate={false}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">Perfis que você quer encontrar</label>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-4 sm:gap-y-4">
              {genderOptions.map((opt) => (
                <div
                  key={opt.value}
                  className="group flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background/70 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5 sm:border-0 sm:bg-transparent sm:p-0"
                  onClick={() => handleGenderToggle(opt.value)}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      selectedGenders.includes(opt.value)
                        ? 'border-primary bg-primary/10'
                        : 'border-muted-foreground/30 group-hover:border-primary/50'
                    }`}
                  >
                    {selectedGenders.includes(opt.value) && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="min-w-0 cursor-pointer select-none text-sm leading-tight">{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Results Grid */}
      {isLoading ? (
        <MobileState
          loading
          title="Buscando perfis"
          description="Refinando os resultados com os filtros que você escolheu."
        />
      ) : isEmpty ? (
        <MobileState
          icon={Search}
          title={onlyLiked ? 'Nenhum curtido encontrado' : 'Nenhum perfil encontrado'}
          description={
            onlyLiked
              ? 'Ajuste a busca ou os filtros para localizar alguém da sua lista de curtidos.'
              : 'Tente ampliar os filtros para aparecerem mais perfis.'
          }
        />
      ) : (
        <>
          {useGroups ? (
            groupedResults.map((group) => (
              <div key={group.label} className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{group.label}</span>
                  <span className="text-xs text-muted-foreground">({group.profiles.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                  {group.profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 md:gap-4">
              {displayResults.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          {!onlyLiked && (
            <div ref={sentinelRef} className="mt-6 flex min-h-[40px] justify-center pb-6">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Carregando mais...
                </div>
              )}
              {!hasMore && !isLoadingMore && results.length > 0 && (
                <p className="text-xs text-muted-foreground">Todos os perfis foram exibidos</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
