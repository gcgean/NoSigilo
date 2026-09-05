import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Filter, MapPin, Heart, Sparkles, Radar as RadarIcon, SlidersHorizontal, Zap, Pencil, ChevronRight, Check, Crown, Loader2 } from 'lucide-react';
import ActiveNowBar from '@/components/ActiveNowBar';
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
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from '@/components/UserAvatar';
import { CitySearch } from '@/components/CitySearch';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import MobileState from '@/components/MobileState';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import { hasPremiumAccess } from '@/utils/premium';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

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

// Intention options — must match keys used in Profile settings
export const INTENTION_OPTIONS: Array<{ value: string; emoji: string; label: string }> = [
  { value: 'troca_casal',      emoji: '👫',  label: 'Troca de casal' },
  { value: 'menage_m_sem_bi',  emoji: '👨‍👨‍👦',  label: 'Ménage masc. sem bi' },
  { value: 'menage_m_com_bi',  emoji: '♾️',  label: 'Ménage masc. com bi' },
  { value: 'mesmo_ambiente',   emoji: '🛏️',  label: 'Sexo no mesmo ambiente' },
  { value: 'sexo_grupo',       emoji: '👥',  label: 'Sexo em grupo' },
  { value: 'menage_f_sem_bi',  emoji: '👩‍👩‍👦',  label: 'Ménage fem. sem bi' },
  { value: 'menage_f_com_bi',  emoji: '🌈',  label: 'Ménage fem. com bi' },
  { value: 'exibicionismo',    emoji: '👁️',  label: 'Exibicionismo' },
];

const PAGE_SIZE = 24;

function formatDistanceKm(distanceKm: unknown) {
  if (typeof distanceKm !== 'number' || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return `${distanceKm.toLocaleString('pt-BR', {
    minimumFractionDigits: distanceKm < 10 && !Number.isInteger(distanceKm) ? 1 : 0,
    maximumFractionDigits: distanceKm < 10 ? 1 : 0,
  })} km`;
}

export default function SearchPage() {
  useDocumentTitle('Buscar');
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { requireFields: _requireFields } = useProfileGate(); // reservado para ações futuras
  const premiumAccess = hasPremiumAccess(user);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; avatar: string | null; gender: string | null; city: string | null; state: string | null }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [sort, setSort] = useState<'nearby' | 'active' | 'new' | 'available'>('nearby');

  // New: availability + intention
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selectedIntention, setSelectedIntention] = useState('');

  // ── Search preferences (saved defaults) ───────────────────────────────────
  type SavedPrefs = {
    profileTypes: string[];
    maxDistance: number | null;
    intentions: string[];
    availabilityFilter: 'any' | 'available' | null;
    updatedAt: string;
  };
  const [savedPrefs, setSavedPrefs] = useState<SavedPrefs | null | undefined>(undefined); // undefined = still loading
  const [prefsReady, setPrefsReady] = useState(false); // true once we know prefs (or they failed)
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardData, setWizardData] = useState<{
    profileTypes: string[];
    maxDistance: number | null;
    intentions: string[];
  }>({ profileTypes: [], maxDistance: null, intentions: [] });

  // Fallback results: shown when active filters return 0 profiles
  const [fallbackResults, setFallbackResults] = useState<any[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [isLoadingFallback, setIsLoadingFallback] = useState(false);

  // Sentinel ref for IntersectionObserver (infinite scroll)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const queryVersionRef = useRef(0);

  // Debounce ref for text inputs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ref for the filters panel (click-outside detection)
  const filtersPanelRef = useRef<HTMLDivElement | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);

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
      availableOnly: availableOnly || undefined,
      intention: selectedIntention || undefined,
    }),
    [search, city, ageRange, selectedGenders, radar, sort, availableOnly, selectedIntention]
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
          // Radar (distância): perfis sem distância conhecida saem quando um
          // raio está ativo — igual à busca normal, evita falso positivo.
          if (radar !== 'all') {
            const maxKm = Number(radar);
            if (typeof p?.distanceKm !== 'number' || p.distanceKm > maxKm) return false;
          }
          // Modo Encontro Hoje: só perfis com disponibilidade ativa (mesma
          // regra do backend — exclui vazio e "not_looking").
          if (availableOnly) {
            const status = p?.availabilityStatus;
            if (!status || status === 'not_looking') return false;
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
    [search, city, ageRange, selectedGenders, radar, availableOnly]
  );

  // ── fetch first page (reset) ───────────────────────────────────────────────
  const fetchFirstPage = useCallback(async () => {
    const queryVersion = ++queryVersionRef.current;
    loadingMoreRef.current = false;
    setIsLoadingMore(false);
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
      if (queryVersion !== queryVersionRef.current) return;
      setResults(data.users);
      setHasMore(data.hasMore);
      setPage(1);
    } catch {
      if (queryVersion !== queryVersionRef.current) return;
      setResults([]);
      setHasMore(false);
      toast({
        title: 'Erro ao buscar perfis',
        description: 'Não foi possível carregar os resultados. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      if (queryVersion === queryVersionRef.current) setIsLoading(false);
    }
  }, [onlyLiked, buildParams, applyLikedFilters, likedProfiles, toast]);

  // ── fetch next page ────────────────────────────────────────────────────────
  const fetchNextPage = useCallback(async () => {
    if (loadingMoreRef.current || isLoadingMore || !hasMore || onlyLiked) return;
    loadingMoreRef.current = true;
    const queryVersion = queryVersionRef.current;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    try {
      const data = await usersService.searchUsers(buildParams(nextPage));
      if (queryVersion !== queryVersionRef.current) return;
      setResults((prev) => {
        const knownIds = new Set(prev.map((profile) => String(profile.id)));
        const newProfiles = data.users.filter((profile: any) => !knownIds.has(String(profile.id)));
        return [...prev, ...newProfiles];
      });
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch {
      // silently ignore load-more errors
    } finally {
      loadingMoreRef.current = false;
      if (queryVersion === queryVersionRef.current) setIsLoadingMore(false);
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
  // /match/liked exige premium (403 premium_required). Sem a checagem, todo
  // usuário grátis que abria a Busca levava o toast global "Recurso Premium"
  // sem ter clicado em nada — o filtro "Somente curtidos" já leva ao paywall
  // por conta própria quando é usado.
  useEffect(() => {
    if (!premiumAccess) {
      setLikedProfiles([]);
      return;
    }
    matchService
      .getLikedProfiles()
      .then((list) => setLikedProfiles(Array.isArray(list) ? list : []))
      .catch(() => setLikedProfiles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load search preferences + apply as defaults ────────────────────────────
  useEffect(() => {
    usersService.getSearchPreferences()
      .then((prefs) => {
        setSavedPrefs(prefs);
        if (prefs === null) {
          // No prefs yet → show first-time wizard
          setShowWizard(true);
        } else {
          // Apply saved prefs as initial filter state
          if (prefs.profileTypes?.length > 0) setSelectedGenders(prefs.profileTypes);
          if (prefs.maxDistance) setRadar(String(prefs.maxDistance));
          // Intention defaults to "Tudo" — user picks manually per session
          if (prefs.availabilityFilter === 'available') {
            setAvailableOnly(true);
            setSort('available');
          }
        }
      })
      .catch(() => setSavedPrefs(null))
      .finally(() => setPrefsReady(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autocomplete: sugere perfis pelo nome enquanto digita ───────────────────
  useEffect(() => {
    const q = search.trim();
    if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current);
    if (q.length < 2) { setSuggestions([]); return; }
    suggestDebounceRef.current = setTimeout(() => {
      usersService.suggestUsers(q).then((r) => setSuggestions(r.users || [])).catch(() => setSuggestions([]));
    }, 250);
    return () => { if (suggestDebounceRef.current) clearTimeout(suggestDebounceRef.current); };
  }, [search]);

  // ── React to filter changes (debounce text, immediate for dropdowns) ───────
  useEffect(() => {
    if (!prefsReady) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchFirstPage();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, city]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prefsReady) return;
    void fetchFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ageRange, radar, selectedGenders, onlyLiked, sort, availableOnly, selectedIntention, prefsReady]);

  // ── Update filtered liked when raw list changes ────────────────────────────
  useEffect(() => {
    if (onlyLiked) setFilteredLiked(applyLikedFilters(likedProfiles));
  }, [likedProfiles, onlyLiked, applyLikedFilters]);

  // ── Click-outside to close filters panel ─────────────────────────────────
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        filtersPanelRef.current?.contains(target) ||
        filtersButtonRef.current?.contains(target)
      ) return;
      setShowFilters(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  // ── Fallback search: when filters return 0 results, show all profiles ───────
  // Resets whenever any filter changes (so the fallback doesn't linger).
  useEffect(() => {
    setIsFallback(false);
    setFallbackResults([]);
  }, [search, city, ageRange, selectedGenders, radar, sort, availableOnly, selectedIntention, onlyLiked]);

  useEffect(() => {
    // Only trigger when we genuinely have 0 results (not still loading, not liked mode)
    const hasActiveFilters =
      selectedGenders.length > 0 ||
      radar !== 'all' ||
      availableOnly ||
      !!selectedIntention ||
      ageRange !== 'all' ||
      !!search.trim() ||
      !!city.trim();

    if (!prefsReady || isLoading || !hasActiveFilters || onlyLiked) return;
    if (results.length > 0) return; // already has results, no fallback needed
    if (isFallback || isLoadingFallback) return; // already running

    let cancelled = false;
    setIsLoadingFallback(true);
    usersService
      .searchUsers({ page: 1, limit: PAGE_SIZE, sort: 'nearby' })
      .then((data) => {
        if (cancelled) return;
        setFallbackResults(data.users || []);
        setIsFallback(true);
      })
      .catch(() => { if (!cancelled) setFallbackResults([]); })
      .finally(() => { if (!cancelled) setIsLoadingFallback(false); });
    // Always reset isLoadingFallback when interrupted — prevents infinite spinner
    return () => { cancelled = true; setIsLoadingFallback(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, isLoading, prefsReady, onlyLiked, isFallback]);

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const handleGenderToggle = (gender: string) => {
    setSelectedGenders((prev) =>
      prev.includes(gender) ? prev.filter((g) => g !== gender) : [...prev, gender]
    );
  };

  const displayResults = onlyLiked ? filteredLiked : results;
  // isEmpty = truly no results and no fallback is covering for us
  const isEmpty = prefsReady && !isLoading && !isLoadingFallback && displayResults.length === 0 && !isFallback;

  const hasDistanceData = displayResults.some((p) => typeof p.distanceKm === 'number');

  type ProfileGroup = { label: string; profiles: any[] };
  const groupedResults: ProfileGroup[] = (() => {
    if (onlyLiked || sort !== 'nearby' || availableOnly) return [];
    const viewerCity = String(user?.city || '').trim().toLowerCase();
    if (!hasDistanceData && !viewerCity) return [];
    const sameCity: any[] = [];
    const sameState: any[] = [];
    const otherStates: any[] = [];
    const unknown: any[]  = [];
    const viewerState = String(user?.state || '').trim().toUpperCase();
    for (const p of displayResults) {
      // Mesma cidade (por nome) vem primeiro, independente da distância — dois
      // perfis da mesma cidade grande (ex.: São Paulo) podem estar a 20 km.
      const pCity = String(p.city || '').trim().toLowerCase();
      const pState = String(p.state || '').trim().toUpperCase();
      if (viewerCity && pCity && pCity === viewerCity && (!viewerState || pState === viewerState)) {
        sameCity.push(p);
        continue;
      }
      if (viewerState && pState === viewerState) {
        sameState.push(p);
        continue;
      }
      if (typeof p.distanceKm === 'number') otherStates.push(p);
      else unknown.push(p);
    }
    // Dentro de cada grupo, ordena por distância crescente (sem distância vai ao fim).
    const byDistance = (a: any, b: any) => {
      const da = typeof a.distanceKm === 'number' ? a.distanceKm : Infinity;
      const dbv = typeof b.distanceKm === 'number' ? b.distanceKm : Infinity;
      return da - dbv;
    };
    sameCity.sort(byDistance);
    sameState.sort(byDistance);
    otherStates.sort(byDistance);
    const groups: ProfileGroup[] = [];
    if (sameCity.length) groups.push({ label: 'Na sua cidade', profiles: sameCity });
    if (sameState.length) groups.push({
      label: viewerState ? `Outras cidades de ${viewerState}` : 'No seu estado',
      profiles: sameState,
    });
    if (otherStates.length) groups.push({ label: 'Outros estados por proximidade', profiles: otherStates });
    if (unknown.length) groups.push({ label: 'Outros', profiles: unknown });
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
      if (radar === 'all') setRadar('50');
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

  // ── Profile Card ───────────────────────────────────────────────────────────
  const ProfileCard = ({ profile }: { profile: any }) => {
    const age = calculateAge(profile.birthDate);
    const avatarUrl = profile.mainMediaUrl ? resolveServerUrl(profile.mainMediaUrl) : undefined;
    const distanceLabel = formatDistanceKm(profile.distanceKm);
    const availStatus = profile.availabilityStatus as string | null;
    const isAvailableNow     = availStatus === 'now';
    const isAvailableWeek    = availStatus === 'week';
    const isAvailableMonth   = availStatus === 'month';
    const isOnlineOnly       = availStatus === 'online_only';
    const isNotLooking       = availStatus === 'not_looking';
    const intentions: string[] = Array.isArray(profile.intentions) ? profile.intentions : [];
    const tagline: string | null = profile.meetingTagline ?? null;

    const handleOpenProfile = () => {
      if (!premiumAccess) {
        setPaywallOpen(true);
        return;
      }
      navigate(getUserProfileHref(profile.id, undefined, '/search'));
    };

    return (
      <div
        onClick={handleOpenProfile}
        className="group relative min-w-0 cursor-pointer overflow-hidden rounded-2xl transition-all hover:shadow-glow"
      >
        <div className="aspect-[4/5] w-full min-[420px]:aspect-[3/4]">
          {(avatarUrl ?? profile.avatar) ? (
            <UserAvatar
              user={{ ...profile, avatar: avatarUrl ?? profile.avatar }}
              className="w-full h-full rounded-none"
              indicatorClassName="hidden"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/25 via-background to-rose-500/15">
              <span className="text-5xl font-bold text-primary/50">
                {profile.name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
          )}
        </div>

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

        {/* Top-right: distance + online */}
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

        {/* Top-left: verified + availability badge */}
        <div className="absolute left-2.5 top-2.5 flex flex-col gap-1 sm:left-3 sm:top-3">
          {profile.isVerified && (
            <Badge className="h-5 w-fit gap-1 rounded-full bg-success/90 px-2 text-[10px] font-medium text-white">
              <Sparkles className="h-3 w-3" />
            </Badge>
          )}
          {isAvailableNow && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white animate-pulse">
              <Zap className="h-3 w-3" /> Disponível hoje
            </Badge>
          )}
          {isAvailableWeek && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-orange-500/90 px-2 text-[10px] font-semibold text-white">
              <Zap className="h-3 w-3" /> Esta semana
            </Badge>
          )}
          {isAvailableMonth && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-violet-500/90 px-2 text-[10px] font-semibold text-white">
              📅 Este mês
            </Badge>
          )}
          {isOnlineOnly && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-sky-500/90 px-2 text-[10px] font-semibold text-white">
              💬 Online
            </Badge>
          )}
          {isNotLooking && (
            <Badge className="h-5 w-fit gap-0.5 rounded-full bg-zinc-500/80 px-2 text-[10px] font-medium text-white">
              🔒
            </Badge>
          )}
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-3.5">
          <h3 className="truncate text-[0.95rem] font-semibold leading-tight text-white sm:text-base">
            {profile.name}{age ? `, ${age}` : ''}
          </h3>
          {distanceLabel ? (
            <div className="truncate text-xs text-white/80">{distanceLabel} de você</div>
          ) : null}
          {formatProfileIdentityLine(profile) ? (
            <div className="truncate text-xs text-white/65">{formatProfileIdentityLine(profile)}</div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-white/65">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{profile.city || '—'}</span>
            </div>
          )}

          {/* Tagline */}
          {tagline ? (
            <p className="mt-1 line-clamp-1 text-sm italic text-white/70">"{tagline}"</p>
          ) : null}

          {/* Intention icons */}
          {intentions.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {intentions.slice(0, 4).map((intent) => {
                const opt = INTENTION_OPTIONS.find((o) => o.value === intent);
                return opt ? (
                  <span
                    key={intent}
                    title={opt.label}
                    className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] backdrop-blur-sm"
                  >
                    {opt.emoji}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Hover overlay */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
          {premiumAccess ? (
            <Button size="icon" className="w-14 h-14 rounded-full bg-gradient-primary shadow-glow" aria-label="Curtir perfil">
              <Heart className="w-6 h-6" />
            </Button>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 ring-2 ring-yellow-400/40 backdrop-blur-sm">
                <Crown className="w-7 h-7 text-yellow-400 drop-shadow" />
              </div>
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                Assinar para ver
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Save wizard preferences ────────────────────────────────────────────────
  const handleSaveWizard = async () => {
    const prefs = {
      profileTypes: wizardData.profileTypes,
      maxDistance: wizardData.maxDistance,
      intentions: wizardData.intentions,
      availabilityFilter: null as 'any' | 'available' | null,
    };
    try {
      await usersService.saveSearchPreferences(prefs);
      setSavedPrefs({ ...prefs, updatedAt: new Date().toISOString() });
      // Apply to active filters
      if (prefs.profileTypes.length > 0) setSelectedGenders(prefs.profileTypes);
      if (prefs.maxDistance) setRadar(String(prefs.maxDistance));
      if (prefs.intentions.length > 0) setSelectedIntention(prefs.intentions[0] ?? '');
    } catch {
      // Save failed silently, just close wizard
    }
    setShowWizard(false);
  };

  // ── "Mostrando:" label for active defaults ─────────────────────────────────
  const hasActiveDefaults = savedPrefs && (
    (savedPrefs.profileTypes?.length > 0) ||
    savedPrefs.maxDistance != null ||
    (savedPrefs.intentions?.length > 0) ||
    savedPrefs.availabilityFilter === 'available'
  );

  const defaultsLabel = (() => {
    if (!savedPrefs) return null;
    const parts: string[] = [];
    if (savedPrefs.profileTypes?.length > 0) {
      // Abbreviate e.g. "Casal (Ele/Ela), Mulher" → "Casais · Mulher"
      const typeLabels = savedPrefs.profileTypes.map((t) => {
        if (t.startsWith('Casal')) return 'Casais';
        return t;
      });
      parts.push([...new Set(typeLabels)].slice(0, 2).join(' · '));
    }
    if (savedPrefs.maxDistance) parts.push(`até ${savedPrefs.maxDistance} km`);
    if (savedPrefs.intentions?.length > 0) {
      const intentLabels = savedPrefs.intentions
        .map((v) => INTENTION_OPTIONS.find((o) => o.value === v)?.label ?? v)
        .slice(0, 2);
      parts.push(intentLabels.join(' · '));
    }
    if (savedPrefs.availabilityFilter === 'available') parts.push('Disponíveis');
    return parts.join(' · ') || null;
  })();

  return (
    <div className="mx-auto w-full max-w-4xl lg:max-w-6xl min-w-0">

      {/* ── First-time search onboarding wizard ────────────────────────────── */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-0 sm:px-4">
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-background shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-muted">
              <div
                className="h-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-300"
                style={{ width: `${(wizardStep / 3) * 100}%` }}
              />
            </div>

            <div className="p-6 space-y-5">
              {/* Step label */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Passo {wizardStep} de 3
                </span>
                <button
                  type="button"
                  onClick={() => setShowWizard(false)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Pular
                </button>
              </div>

              {/* Step 1: Profile types */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">Quem você quer encontrar?</h2>
                    <p className="text-sm text-muted-foreground mt-1">Selecione os perfis que mais combinam com você. Pode escolher vários.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {genderOptions.map((opt) => {
                      const selected = wizardData.profileTypes.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setWizardData((d) => ({
                            ...d,
                            profileTypes: selected
                              ? d.profileTypes.filter((v) => v !== opt.value)
                              : [...d.profileTypes, opt.value],
                          }))}
                          className={cn(
                            'flex items-center justify-between rounded-xl border px-4 py-3 text-sm text-left transition-colors',
                            selected
                              ? 'border-primary bg-primary/8 text-foreground font-medium'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                          )}
                        >
                          <span>{opt.label}</span>
                          {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 2: Distance */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">Qual o raio máximo?</h2>
                    <p className="text-sm text-muted-foreground mt-1">Distância padrão para exibir perfis na busca.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      [null,  'Qualquer distância'],
                      [10,   '10 km'],
                      [25,   '25 km'],
                      [50,   '50 km'],
                      [100,  '100 km'],
                      [500,  '500 km'],
                    ] as const).map(([val, label]) => {
                      const selected = wizardData.maxDistance === val;
                      return (
                        <button
                          key={String(val)}
                          type="button"
                          onClick={() => setWizardData((d) => ({ ...d, maxDistance: val ?? null }))}
                          className={cn(
                            'flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors',
                            selected
                              ? 'border-primary bg-primary/8 font-semibold text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                          )}
                        >
                          <span>{label}</span>
                          {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Step 3: Intentions */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold">O que você busca?</h2>
                    <p className="text-sm text-muted-foreground mt-1">Escolha as intenções que mais te interessam.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {INTENTION_OPTIONS.map((opt) => {
                      const selected = wizardData.intentions.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setWizardData((d) => ({
                            ...d,
                            intentions: selected
                              ? d.intentions.filter((v) => v !== opt.value)
                              : [...d.intentions, opt.value],
                          }))}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                            selected
                              ? 'border-primary bg-primary/8 font-medium text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                          )}
                        >
                          <span className="text-base">{opt.emoji}</span>
                          <span className="flex-1 text-left text-xs leading-snug">{opt.label}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex gap-3 pt-1">
                {wizardStep > 1 && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3)}
                  >
                    Voltar
                  </Button>
                )}
                {wizardStep < 3 ? (
                  <Button
                    className="flex-1 bg-gradient-to-r from-primary to-violet-500"
                    onClick={() => setWizardStep((s) => (s + 1) as 2 | 3)}
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    className="flex-1 bg-gradient-to-r from-primary to-violet-500"
                    onClick={() => void handleSaveWizard()}
                  >
                    Salvar preferências
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 sm:mb-5">
        <h1 className="mb-1 text-[1.8rem] font-bold sm:mb-1.5 sm:text-2xl">Buscar</h1>
        <p className="text-[0.98rem] leading-6 text-muted-foreground sm:text-base">Encontre casais e singles compatíveis com o seu interesse</p>
      </div>

      {/* Ativos agora — descoberta de perfis ativos nas últimas 2h */}
      {!showWizard && <ActiveNowBar />}

      {/* ── "Mostrando:" active defaults bar ──────────────────────────────── */}
      {hasActiveDefaults && defaultsLabel && !showWizard && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-xs text-foreground/80 flex-1 min-w-0 truncate">
            <span className="text-muted-foreground">Mostrando: </span>
            <span className="font-medium">{defaultsLabel}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setWizardStep(1);
              setWizardData({
                profileTypes: savedPrefs?.profileTypes ?? [],
                maxDistance: savedPrefs?.maxDistance ?? null,
                intentions: savedPrefs?.intentions ?? [],
              });
              setShowWizard(true);
            }}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand-pink hover:underline"
          >
            <Pencil className="h-3 w-3" /> Editar padrão
          </button>
        </div>
      )}

      {/* ⚡ Encontro Hoje mode banner */}
      <button
        type="button"
        onClick={() => {
          setAvailableOnly((v) => !v);
          if (!availableOnly) setSort('available');
          else setSort('nearby');
        }}
        className={cn(
          'mb-4 w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all',
          availableOnly
            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
            : 'border-border bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
        )}
      >
        <div className="flex items-center gap-2.5">
          <Zap className={cn('h-5 w-5 shrink-0', availableOnly && 'animate-pulse')} />
          <div>
            <p className="text-sm font-bold leading-tight">
              {availableOnly ? '⚡ Modo Encontro Hoje ativo' : '⚡ Modo Encontro Hoje'}
            </p>
            <p className="text-xs opacity-70 leading-tight mt-0.5">
              {availableOnly
                ? 'Exibindo apenas perfis com disponibilidade ativa (hoje, semana, mês ou online)'
                : 'Ver apenas quem está disponível para um encontro real'}
            </p>
          </div>
        </div>
        <div className={cn(
          'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
          availableOnly ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
        )}>
          {availableOnly ? 'Ativo' : 'Ativar'}
        </div>
      </button>

      {/* Search & Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:mb-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou cidade..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowSuggestions(false);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  void fetchFirstPage();
                }
              }}
              className="h-12 rounded-xl border-2 border-primary/15 bg-background pl-11 pr-4 text-base focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-10 sm:rounded-md sm:border-input sm:pl-10 sm:text-sm"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg">
                <p className="px-3 pt-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">Perfis encontrados</p>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowSuggestions(false); navigate(getUserProfileHref(s.id, undefined, '/search')); }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <UserAvatar user={{ name: s.name, avatar: s.avatar }} className="h-9 w-9 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.gender, [s.city, s.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleUseDeviceRadar()}
            disabled={isLocating}
            title="Buscar pessoas próximas por GPS (raio de 50 km)"
            aria-label="Buscar pessoas próximas por GPS"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-primary/15 bg-background text-primary transition-colors hover:bg-primary/10 disabled:opacity-60 sm:h-10 sm:w-10 sm:rounded-md sm:border-input"
          >
            {isLocating ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:flex sm:flex-row">
          <Button
            type="button"
            variant={onlyLiked ? 'default' : 'outline'}
            onClick={() => setOnlyLiked((prev) => !prev)}
            className={
              onlyLiked
                ? 'animate-liked-filter h-11 w-full justify-center rounded-xl gap-2 border-0 bg-gradient-primary px-4 text-sm font-medium text-white hover:opacity-95 motion-reduce:animate-none'
                : 'h-11 w-full justify-center rounded-xl gap-2 border-primary/50 bg-primary/5 px-4 text-sm font-medium text-brand-pink hover:bg-primary/10'
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
            ref={filtersButtonRef}
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
          <div className="relative">
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {([['all','Qualquer'],['10','10 km'],['25','25 km'],['50','50 km'],['100','100 km'],['500','500 km']] as const).map(([v, l]) => (
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
              {/* right-side spacer so last chip clears the fade */}
              <span className="shrink-0 w-8" aria-hidden />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>

          {/* Sort buttons */}
          <div className="relative">
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
              <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {([
                ['nearby',    'Próximos'],
                ['active',    'Ativos'],
                ['new',       'Novos'],
                ['available', '⚡ Disponíveis'],
              ] as const).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSort(v)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    sort === v
                      ? v === 'available'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-primary bg-primary text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {l}
                </button>
              ))}
              <span className="shrink-0 w-8" aria-hidden />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>

          {/* Intention filter pills */}
          <div className="relative">
            <div className="flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5">
              <span className="text-sm shrink-0 text-muted-foreground">Busca por:</span>
              <button
                type="button"
                onClick={() => setSelectedIntention('')}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  selectedIntention === ''
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                Tudo
              </button>
              {INTENTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedIntention((v) => v === opt.value ? '' : opt.value)}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors gap-1 inline-flex items-center ${
                    selectedIntention === opt.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
              <span className="shrink-0 w-8" aria-hidden />
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>

        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div ref={filtersPanelRef} className="glass mb-4 animate-slide-up space-y-5 rounded-xl p-4 sm:mb-6 sm:p-6 sm:space-y-6">
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

      {/* "Encontro Hoje" active info bar */}
      {availableOnly && !isLoading && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-2.5">
          <Zap className="h-4 w-4 shrink-0 text-emerald-500" />
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            <span className="font-semibold">{displayResults.length} perfil{displayResults.length !== 1 ? 'is' : ''}</span> com disponibilidade ativa
          </p>
          <button
            type="button"
            onClick={() => { setAvailableOnly(false); setSort('nearby'); }}
            className="ml-auto text-xs text-emerald-600/70 hover:text-emerald-600 underline"
          >
            Ver todos
          </button>
        </div>
      )}

      {/* Results Grid */}
      {(!prefsReady || isLoading || isLoadingFallback) ? (
        <MobileState
          loading
          title={isLoadingFallback ? 'Ampliando a busca...' : 'Buscando perfis'}
          description={isLoadingFallback ? 'Sem resultados com esses filtros. Buscando todos os perfis.' : 'Refinando os resultados com os filtros que você escolheu.'}
        />
      ) : isEmpty ? (
        <MobileState
          icon={Search}
          title={onlyLiked ? 'Nenhum curtido encontrado' : availableOnly ? 'Nenhum perfil disponível agora' : 'Nenhum perfil encontrado'}
          description={
            onlyLiked
              ? 'Ajuste a busca ou os filtros para localizar alguém da sua lista de curtidos.'
              : availableOnly
                ? 'Não há perfis com disponibilidade ativa na sua região. Tente ampliar o raio ou desativar o filtro.'
                : 'Tente ampliar os filtros para aparecerem mais perfis.'
          }
        />
      ) : (
        <>
          {/* ── Fallback banner: shown when active filters returned 0 results ── */}
          {isFallback && fallbackResults.length > 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
              <span className="mt-0.5 text-base leading-none">🔍</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug">
                  Sem perfis com esses filtros
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mostrando todos os perfis da plataforma. Ajuste os filtros para refinar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedGenders([]);
                  setRadar('all');
                  setAvailableOnly(false);
                  setSelectedIntention('');
                  setAgeRange('all');
                  setSearch('');
                  setCity('');
                  setSort('nearby');
                }}
                className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-pink hover:bg-primary/20 transition-colors"
              >
                Limpar filtros
              </button>
            </div>
          )}

          {/* ── Results grid (normal or fallback) ────────────────────────────── */}
          {useGroups && !isFallback ? (
            groupedResults.map((group) => (
              <div key={group.label} className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{group.label}</span>
                  <span className="text-xs text-muted-foreground">({group.profiles.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
                  {group.profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
              {(isFallback ? fallbackResults : displayResults).map((profile) => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
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

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
