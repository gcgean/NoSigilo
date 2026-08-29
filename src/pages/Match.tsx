import { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, X, Star, MapPin, Sparkles, Filter, MoreHorizontal, Image, Video, User, MessageCircle, Bell, BellOff, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { chatService, matchService, notificationsService } from '@/services/api';
import { calculateAge } from '@/utils/age';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSocket } from '@/contexts/SocketContext';
import { useNavigate } from 'react-router-dom';
import UserBadges from '@/components/UserBadges';
import { useFavorites } from '@/contexts/FavoritesContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { hasPremiumAccess } from '@/utils/premium';
import MobileState from '@/components/MobileState';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import SeekingYouModal from '@/components/SeekingYouModal';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { enablePushNotifications, getPushActivationState } from '@/utils/pushNotifications';
import { calcProfileCompletion } from '@/utils/profileCompletion';
import { useActivityTracker } from '@/contexts/ActivityTrackerContext';
import { useProfileGate } from '@/contexts/ProfileGateContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

type MatchProfile = {
  id: string;
  name: string;
  gender?: string | null;
  city?: string | null;
  state?: string | null;
  bio?: string | null;
  birthDate?: string | null;
  avatar?: string | null;
  mainMediaUrl?: string | null;
  isVerified?: boolean;
  isPremium?: boolean;
  isOnline?: boolean;
  mediaSummary?: { photosCount: number; videosCount: number };
  createdAt?: string | null;
  badges?: string[];
  availabilityStatus?: string | null;
  distanceKm?: number | null;
};


type LikedProfile = {
  id: string;
  name: string;
  avatar?: string | null;
  mainMediaUrl?: string | null;
  city?: string | null;
  state?: string | null;
  likedAt?: string | null;
};

function resolveMediaUrl(url?: string | null) {
  if (!url) return '';
  return resolveServerUrl(url);
}

const CACHE_KEY_PROFILES = 'nosigilo_match_profiles';
const CACHE_KEY_INDEX = 'nosigilo_match_index';

export default function Match() {
  useDocumentTitle('Match');
  const { on, off } = useSocket();
  const navigate = useNavigate();
  const { addFavorite } = useFavorites();
  const { user } = useAuth();
  const { toast } = useToast();
  const { registerActivity } = useActivityTracker();
  const profileViewCountRef = useRef(0);
  
  const [profiles, setProfiles] = useState<MatchProfile[]>(() => {
    try {
      const saved = sessionStorage.getItem(CACHE_KEY_PROFILES);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = sessionStorage.getItem(CACHE_KEY_INDEX);
    return saved ? parseInt(saved, 10) : 0;
  });

  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [isHoveringPass, setIsHoveringPass] = useState(false);
  const [isLoading, setIsLoading] = useState(profiles.length === 0);
  const [likedProfiles, setLikedProfiles] = useState<LikedProfile[]>([]);
  const [isLoadingLikedProfiles, setIsLoadingLikedProfiles] = useState(false);
  const [hasSwipedAny, setHasSwipedAny] = useState(() => sessionStorage.getItem('nosigilo_match_swiped') === '1');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const premiumAccess = hasPremiumAccess(user);
  const { requireFields } = useProfileGate();

  // Banner "X perfis procuram alguém como você" — aparece ao entrar no Match para
  // quem NÃO é assinante pagante (trial/expirado incluídos), 1x por sessão.
  const [showSeekingYou, setShowSeekingYou] = useState(false);
  const isPaidSubscriber = !!user?.isPremium && premiumAccess;
  useEffect(() => {
    if (!user?.id || isPaidSubscriber) return;
    const key = 'nosigilo:seeking-you-session';
    if (sessionStorage.getItem(key)) return;
    setShowSeekingYou(true);
    try { sessionStorage.setItem(key, '1'); } catch { /* ignora */ }
  }, [user?.id, isPaidSubscriber]);
  const { percent: profilePercent, missing: profileMissing } = useMemo(() => calcProfileCompletion({
    avatar: user?.avatar ?? null,
    bio: user?.bio ?? null,
    city: user?.city ?? null,
    birthDate: user?.birthDate ?? null,
    gender: user?.gender ?? null,
    lookingFor: user?.lookingFor?.length ? user.lookingFor[0] : null,
    maritalStatus: user?.maritalStatus ?? null,
  }), [user]);

  const redirectToPlans = () => {
    setPaywallOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    if (profiles.length === 0) setIsLoading(true);

    Promise.all([matchService.getCards(), matchService.getLikedProfiles()])
      .then(([cardsData, likedData]) => {
        if (cancelled) return;
        const newProfiles = Array.isArray(cardsData) ? cardsData : [];
        const liked = Array.isArray(likedData) ? likedData : [];
        setProfiles(newProfiles);
        setLikedProfiles(liked);
        sessionStorage.setItem(CACHE_KEY_PROFILES, JSON.stringify(newProfiles));

        setCurrentIndex((prev) => {
          if (prev >= newProfiles.length) {
            sessionStorage.setItem(CACHE_KEY_INDEX, '0');
            return 0;
          }
          return prev;
        });
      })
      .catch(() => {
        if (cancelled) return;
        if (profiles.length === 0) setProfiles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (payload: any) => {
      const userId = payload?.userId ? String(payload.userId) : null;
      const isOnline = !!payload?.isOnline;
      if (!userId) return;
      setProfiles((prev) => prev.map((p) => (p.id === userId ? { ...p, isOnline } : p)));
    };
    on('presence.changed', handler);
    return () => off('presence.changed', handler);
  }, [on, off]);

  useEffect(() => {
    getPushActivationState().then((s) => setPushEnabled(s.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    // Clear match notifications when entering match page
    const clearMatchNotifs = async () => {
      try {
        const list = await notificationsService.getNotifications();
        const unreadMatch = Array.isArray(list) ? list.filter((n: any) => !n.isRead && n.type === 'profile.liked') : [];
        for (const n of unreadMatch) {
          await notificationsService.markAsRead(n.id);
        }
      } catch {}
    };
    void clearMatchNotifs();
  }, []);

  const currentProfile = profiles[currentIndex];
  const age = useMemo(() => calculateAge(currentProfile?.birthDate) ?? null, [currentProfile?.birthDate]);
  const cityLine = useMemo(() => {
    if (!currentProfile) return '';
    return [currentProfile.city, currentProfile.state].filter(Boolean).join(', ');
  }, [currentProfile]);
  const identityLine = useMemo(() => formatProfileIdentityLine(currentProfile), [currentProfile]);

  const isNewProfile = useMemo(() => {
    if (!currentProfile?.createdAt) return false;
    const created = new Date(currentProfile.createdAt).getTime();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return created > weekAgo;
  }, [currentProfile?.createdAt]);

  const coverUrl = useMemo(() => {
    if (!currentProfile) return '';
    return resolveMediaUrl(currentProfile.mainMediaUrl || currentProfile.avatar || '');
  }, [currentProfile]);

  // Placeholder (gradiente+inicial) fica ATRÁS e some quando a foto pinta.
  // Só escondemos a <img> se ela falhar (não usamos gate por onLoad: imagem em
  // cache dispara load antes do handler e ficaria invisível).
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setImgError(false); }, [coverUrl]);

  // Pré-carrega a imagem do PRÓXIMO perfil pra não piscar preto ao passar o card.
  useEffect(() => {
    const next = profiles[currentIndex + 1];
    const url = next ? resolveMediaUrl(next.mainMediaUrl || next.avatar || '') : '';
    if (url) { const img = new window.Image(); img.src = url; }
  }, [profiles, currentIndex]);

  const handleEnablePush = async () => {
    setPushLoading(true);
    try {
      await enablePushNotifications();
      setPushEnabled(true);
      toast({ title: 'Notificações ativadas!', description: 'Você será avisado quando novos perfis chegarem.' });
    } catch {
      toast({ title: 'Não foi possível ativar', description: 'Verifique as permissões do seu navegador.', variant: 'destructive' });
    } finally {
      setPushLoading(false);
    }
  };

  const handleSwipe = (direction: 'left' | 'right') => {
    const swipedProfileId = currentProfile?.id ? String(currentProfile.id) : null;
    setHasSwipedAny(true);
    sessionStorage.setItem('nosigilo_match_swiped', '1');
    profileViewCountRef.current += 1;
    if (profileViewCountRef.current === 5) registerActivity('match_view');
    setSwipeDirection(direction);
    window.setTimeout(() => {
      setSwipeDirection(null);
      setProfiles((prev) => {
        const nextProfiles = swipedProfileId ? prev.filter((p) => String(p.id) !== swipedProfileId) : prev;
        sessionStorage.setItem(CACHE_KEY_PROFILES, JSON.stringify(nextProfiles));
        setCurrentIndex((prevIndex) => {
          const nextIndex = nextProfiles.length === 0 ? 0 : Math.min(prevIndex, nextProfiles.length - 1);
          sessionStorage.setItem(CACHE_KEY_INDEX, String(nextIndex));
          return nextIndex;
        });
        return nextProfiles;
      });
    }, 300);
  };

  const handleLike = async () => {
    if (!premiumAccess) {
      redirectToPlans();
      return;
    }
    const ok = await requireFields(['photo', 'birthDate', 'interests', 'city']);
    if (!ok) return;
    if (!currentProfile) return;
    try {
      await matchService.like(currentProfile.id);
      addFavorite({
        id: currentProfile.id,
        name: currentProfile.name,
        avatar: currentProfile.avatar || undefined,
        addedAt: new Date().toISOString(),
      });
      setLikedProfiles((prev) => {
        if (prev.some((p) => String(p.id) === String(currentProfile.id))) return prev;
        return [
          {
            id: currentProfile.id,
            name: currentProfile.name,
            avatar: currentProfile.avatar || null,
            mainMediaUrl: currentProfile.mainMediaUrl || null,
            city: currentProfile.city || null,
            state: currentProfile.state || null,
            likedAt: new Date().toISOString(),
          },
          ...prev,
        ];
      });
    } catch {}
    handleSwipe('right');
  };

  const handlePass = async () => {
    if (!premiumAccess) {
      redirectToPlans();
      return;
    }
    const ok = await requireFields(['photo', 'birthDate', 'interests', 'city']);
    if (!ok) return;
    if (currentProfile?.id) {
      try {
        await matchService.pass(currentProfile.id);
      } catch {}
    }
    handleSwipe('left');
  };

  const handleOpenChat = async () => {
    if (!currentProfile) return;
    if (!premiumAccess) {
      redirectToPlans();
      return;
    }

    try {
      const conversation = await chatService.createConversation(currentProfile.id);
      navigate('/chat', { state: { conversationId: String(conversation?.id || '') } });
    } catch {
      toast({
        title: 'Não foi possível abrir o chat',
        description: 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  // Gate: user must have a profile photo to access Match
  if (!user?.avatar) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-6 max-w-sm mx-auto">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Image className="w-10 h-10 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Foto necessária para o Match</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Para aparecer e ver perfis no Match, você precisa adicionar uma foto de perfil. Perfis sem foto não participam da descoberta.
          </p>
        </div>
        <Button className="w-full" onClick={() => navigate('/profile')}>
          Adicionar foto de perfil
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[430px] min-w-0 overflow-x-hidden px-2 pb-24 sm:max-w-lg sm:px-0 md:pb-0 lg:max-w-[560px]">
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 sm:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-semibold tracking-tight sm:text-2xl">Match</h1>
          <p className="text-[0.98rem] font-normal text-muted-foreground/90 sm:text-lg">Encontre sua conexão</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!premiumAccess) {
                    redirectToPlans();
                    return;
                  }
                  setIsLoadingLikedProfiles(true);
                  matchService
                    .getLikedProfiles()
                    .then((list) => setLikedProfiles(Array.isArray(list) ? list : []))
                    .catch(() => setLikedProfiles([]))
                    .finally(() => setIsLoadingLikedProfiles(false));
                }}
                className="h-11 rounded-xl gap-2 px-3 text-sm font-medium sm:h-9 sm:rounded-md"
              >
                <Heart className="w-4 h-4" />
                Curtidos ({likedProfiles.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] max-w-80">
              <p className="font-semibold mb-3">Perfis que você curtiu</p>
              {isLoadingLikedProfiles ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
              {!isLoadingLikedProfiles && likedProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Você ainda não curtiu nenhum perfil.</p>
              ) : null}
              {!isLoadingLikedProfiles && likedProfiles.length > 0 ? (
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {likedProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className="w-full rounded-lg border p-2 text-left hover:bg-secondary/40 transition-colors"
                      onClick={() => navigate(getUserProfileHref(profile.id, user?.id, '/match'))}
                    >
                      <div className="flex items-center gap-2">
                        <img
                          src={resolveMediaUrl(profile.mainMediaUrl || profile.avatar || '')}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover bg-secondary"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{profile.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[profile.city, profile.state].filter(Boolean).join(', ') || 'Sem localização'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (!premiumAccess) {
                redirectToPlans();
                return;
              }
              navigate('/search');
            }}
            className="h-11 w-11 rounded-xl sm:h-10 sm:w-10 sm:rounded-md"
            aria-label="Filtros de busca"
          >
            <Filter className="w-5 h-5" />
          </Button>
        </div>
      </div>


      {/* svh (não dvh): dvh recalcula ao vivo conforme a barra de endereço do
          navegador mobile some/aparece durante o scroll, fazendo o card e tudo
          abaixo dele mudar de altura e "pular" de posição a cada rolagem. svh
          usa o menor viewport possível (com a barra visível) e fica estável. */}
      <div className="relative h-[min(58svh,480px)] min-h-[300px] sm:h-auto sm:aspect-[3/4] sm:max-h-[600px]">
        {isLoading && (
          <div className="absolute inset-0">
            <MobileState
              loading
              className="h-full rounded-[22px] sm:rounded-3xl"
              title="Carregando perfis"
              description="Separando novas sugestões para o seu Match."
            />
          </div>
        )}
        {!isLoading && !currentProfile && hasSwipedAny && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-[22px] sm:rounded-3xl bg-secondary/40 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold">Você viu todos os perfis!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Novos perfis chegam em breve. Ative as notificações e seja o primeiro a saber.
              </p>
            </div>
            {!pushEnabled ? (
              <Button
                onClick={() => void handleEnablePush()}
                disabled={pushLoading}
                className="gap-2 rounded-xl"
              >
                <Bell className="h-4 w-4" />
                {pushLoading ? 'Ativando…' : 'Ativar notificações'}
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-success font-medium">
                <BellOff className="h-4 w-4" />
                Notificações ativas
              </div>
            )}
            <p className="text-xs text-muted-foreground/70">
              Sua busca cobre todo o Brasil — novos usuários aparecem aqui assim que cadastram.
            </p>
          </div>
        )}
        {!isLoading && !currentProfile && !hasSwipedAny && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[22px] sm:rounded-3xl bg-secondary/40 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-semibold">Nenhum perfil no momento</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Perfis completos aparecem primeiro nos resultados de outras pessoas.
              </p>
            </div>
            {profilePercent < 100 && (
              <div className="w-full max-w-xs">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Seu perfil está {profilePercent}% completo</span>
                  <span className="text-muted-foreground">{profilePercent}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${profilePercent}%` }}
                  />
                </div>
                {profileMissing.length > 0 && (
                  <div className="mt-3 space-y-1.5 text-left">
                    {profileMissing.slice(0, 3).map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                        {item.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl"
              onClick={() => navigate('/settings')}
            >
              Completar perfil <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        {!isLoading && currentProfile && (
          <div
            className={cn(
              'absolute inset-0 rounded-[22px] sm:rounded-3xl overflow-hidden shadow-elevated transition-all duration-300',
              swipeDirection === 'right' && 'animate-swipe-right',
              swipeDirection === 'left' && 'animate-swipe-left'
            )}
          >
            {/* Fundo sempre presente (nunca preto): gradiente + inicial do nome.
                Some enquanto a foto carrega e no caso de perfil sem foto. */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/25 via-secondary to-background">
              <span className="select-none text-7xl font-bold text-white/25">
                {(currentProfile.name?.[0] || '?').toUpperCase()}
              </span>
            </div>
            {coverUrl && !imgError && (
              <button
                type="button"
                className="absolute inset-0 h-full w-full"
                onClick={() => navigate(getUserProfileHref(currentProfile.id, user?.id, '/match'))}
                aria-label={`Ver perfil de ${currentProfile.name}`}
              >
                <img
                  src={coverUrl}
                  alt={currentProfile.name}
                  loading="eager"
                  decoding="async"
                  onError={() => setImgError(true)}
                  className="h-full w-full object-cover"
                />
              </button>
            )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

            <div className="absolute left-3 top-3 flex flex-col gap-1 sm:left-4 sm:top-4">
              {currentProfile.isVerified && (
                <Badge className="h-5 rounded-full bg-success px-2 text-[10px] font-medium text-white gap-1">
                  <Sparkles className="h-3 w-3" /> Verificado
                </Badge>
              )}
              {currentProfile.isPremium && (
                <Badge className="h-5 rounded-full bg-gold px-2 text-[10px] font-medium text-black gap-1">
                  <Star className="h-3 w-3" /> Premium
                </Badge>
              )}
              {isNewProfile && (
                <Badge variant="secondary" className="h-5 rounded-full border-blue-500/30 bg-blue-500/20 px-2 text-[10px] font-medium text-blue-400 gap-1">
                  Perfil Novo
                </Badge>
              )}
              {currentProfile.availabilityStatus === 'now' && (
                <Badge className="h-5 w-fit gap-0.5 rounded-full bg-emerald-500 px-2 text-[10px] font-bold text-white animate-pulse">
                  <Zap className="h-3 w-3" /> Disponível hoje
                </Badge>
              )}
              {currentProfile.availabilityStatus === 'week' && (
                <Badge className="h-5 w-fit gap-0.5 rounded-full bg-orange-500/90 px-2 text-[10px] font-semibold text-white">
                  <Zap className="h-3 w-3" /> Esta semana
                </Badge>
              )}
              {currentProfile.availabilityStatus === 'month' && (
                <Badge className="h-5 w-fit gap-0.5 rounded-full bg-violet-500/90 px-2 text-[10px] font-semibold text-white">
                  📅 Este mês
                </Badge>
              )}
              {currentProfile.availabilityStatus === 'online_only' && (
                <Badge className="h-5 w-fit gap-0.5 rounded-full bg-sky-500/90 px-2 text-[10px] font-semibold text-white">
                  💬 Online
                </Badge>
              )}
            </div>

            {currentProfile.isOnline && isHoveringPass && (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 sm:right-4 sm:top-4 sm:gap-2 sm:px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-success" />
                <span className="text-[10px] font-medium text-white/90 sm:text-xs">Online</span>
              </div>
            )}

              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                <div className="flex min-w-0 items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      className="mb-1 text-left text-[clamp(1.45rem,7vw,2.05rem)] font-semibold leading-tight tracking-tight text-white break-words hover:underline sm:text-3xl"
                      onClick={() => navigate(getUserProfileHref(currentProfile.id, user?.id, '/match'))}
                    >
                      {currentProfile.name}
                      {age !== null ? `, ${age}` : ''}
                    </button>
                    {identityLine ? (
                      <div className="mb-1 text-[0.95rem] font-normal text-white/75 sm:text-sm">{identityLine}</div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-[0.95rem] sm:text-sm text-white/70 mb-3 font-normal">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{cityLine || '—'}</span>
                      {currentProfile.distanceKm != null && (
                        <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm">
                          {currentProfile.distanceKm < 1
                            ? '< 1 km'
                            : `${currentProfile.distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: currentProfile.distanceKm < 10 ? 1 : 0 })} km`}
                        </span>
                      )}
                    </div>
                    <p className="mb-3 line-clamp-2 text-[0.95rem] font-normal text-white/80 sm:text-sm">{currentProfile.bio || ''}</p>

                    {currentProfile.badges && currentProfile.badges.length > 0 && (
                      <div className="mb-3">
                        <UserBadges badges={currentProfile.badges} size="sm" max={5} />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-10 rounded-xl border-none bg-white/20 px-3 text-sm font-medium text-white backdrop-blur-md gap-2 hover:bg-white/30 sm:h-9 sm:rounded-md"
                      onClick={() => navigate(getUserProfileHref(currentProfile.id, user?.id, '/match'))}
                    >
                      <User className="h-4 w-4" /> Ver Perfil
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-10 rounded-xl border-none bg-primary/80 px-3 text-sm font-medium text-white backdrop-blur-md gap-2 hover:bg-primary sm:h-9 sm:rounded-md"
                      onClick={() => void handleOpenChat()}
                    >
                      <MessageCircle className="h-4 w-4" /> Mandar msg
                    </Button>
                  </div>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/10" aria-label="Mais opções">
                      <MoreHorizontal className="h-4.5 w-4.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <p className="font-semibold mb-3">Resumo de mídia</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Image className="w-4 h-4" /> Fotos
                        </span>
                        <span className="font-medium">{currentProfile.mediaSummary?.photosCount ?? 0}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Video className="w-4 h-4" /> Vídeos
                        </span>
                        <span className="font-medium">{currentProfile.mediaSummary?.videosCount ?? 0}</span>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {swipeDirection === 'right' && (
              <div className="absolute inset-0 flex items-center justify-center bg-success/20 animate-fade-in">
                <Heart className="w-32 h-32 text-success" fill="currentColor" />
              </div>
            )}
            {swipeDirection === 'left' && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/20 animate-fade-in">
                <X className="w-32 h-32 text-destructive" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-6 sm:flex sm:items-center sm:justify-center sm:gap-6">
        {/* Passar — requer premium */}
        <Button
          size="lg"
          variant="outline"
          className="h-[58px] w-full rounded-[22px] border-2 border-destructive text-destructive transition-all hover:bg-destructive hover:text-white sm:h-16 sm:w-16 sm:rounded-full"
          onClick={() => void handlePass()}
          onMouseEnter={() => setIsHoveringPass(true)}
          onMouseLeave={() => setIsHoveringPass(false)}
          disabled={!currentProfile}
          aria-label="Passar"
        >
          <X className="h-7 w-7 sm:h-8 sm:w-8" />
        </Button>

        {/* Curtir — requer premium */}
        <Button
          size="lg"
          className="relative h-[64px] w-full rounded-[24px] bg-gradient-primary shadow-glow transition-all hover:opacity-90 sm:h-20 sm:w-20 sm:rounded-full"
          onClick={() => void handleLike()}
          disabled={!currentProfile}
          aria-label="Curtir"
        >
          <Heart className="h-7 w-7 sm:h-10 sm:w-10" fill="white" />
        </Button>

        {/* Ver Perfil — livre para todos */}
        <Button
          size="lg"
          variant="outline"
          className="h-[58px] w-full rounded-[22px] border-2 border-primary text-primary transition-all hover:bg-primary hover:text-white sm:h-16 sm:w-16 sm:rounded-full"
          onClick={() => {
            if (!currentProfile) return;
            navigate(getUserProfileHref(currentProfile.id, user?.id, '/match'));
          }}
          disabled={!currentProfile}
          aria-label="Ver perfil"
        >
          <User className="h-7 w-7 sm:h-8 sm:w-8" />
        </Button>

        {/* Mensagem — requer premium */}
        <Button
          size="lg"
          variant="outline"
          className="h-[58px] w-full rounded-[22px] border-2 border-primary text-primary transition-all hover:bg-primary hover:text-white sm:h-16 sm:w-16 sm:rounded-full"
          onClick={() => void handleOpenChat()}
          disabled={!currentProfile}
          aria-label="Mandar mensagem"
        >
          <MessageCircle className="h-7 w-7 sm:h-8 sm:w-8" />
        </Button>

      </div>

      <p className="mt-3 px-4 text-center text-[0.92rem] text-muted-foreground/90 sm:mt-4 sm:text-[0.98rem]">Arraste para os lados ou use os botões</p>

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <SeekingYouModal open={showSeekingYou} onClose={() => setShowSeekingYou(false)} />
    </div>
  );
}
