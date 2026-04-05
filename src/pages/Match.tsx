import { useEffect, useMemo, useState } from 'react';
import { Heart, X, Star, MapPin, Sparkles, Filter, MoreHorizontal, Image, Video, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { matchService, notificationsService } from '@/services/api';
import { calculateAge } from '@/utils/age';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSocket } from '@/contexts/SocketContext';
import { useNavigate } from 'react-router-dom';
import { useFavorites } from '@/contexts/FavoritesContext';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';

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
};

function resolveMediaUrl(url?: string | null) {
  if (!url) return '';
  return resolveServerUrl(url);
}

const CACHE_KEY_PROFILES = 'nosigilo_match_profiles';
const CACHE_KEY_INDEX = 'nosigilo_match_index';

export default function Match() {
  const { on, off } = useSocket();
  const navigate = useNavigate();
  const { toggleFavorite, isFavorite } = useFavorites();
  
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

  useEffect(() => {
    let cancelled = false;
    if (profiles.length === 0) setIsLoading(true);

    matchService
      .getCards()
      .then((data) => {
        if (cancelled) return;
        const newProfiles = Array.isArray(data) ? data : [];
        setProfiles(newProfiles);
        sessionStorage.setItem(CACHE_KEY_PROFILES, JSON.stringify(newProfiles));
        
        setCurrentIndex(prev => {
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

  const handleSwipe = (direction: 'left' | 'right') => {
    setSwipeDirection(direction);
    window.setTimeout(() => {
      setSwipeDirection(null);
      setCurrentIndex((prev) => {
        const next = profiles.length ? (prev + 1) % profiles.length : 0;
        sessionStorage.setItem(CACHE_KEY_INDEX, String(next));
        return next;
      });
    }, 300);
  };

  const handleLike = async () => {
    if (!currentProfile) return;
    try {
      await matchService.like(currentProfile.id);
    } catch {}
    handleSwipe('right');
  };

  const handlePass = () => handleSwipe('left');

  return (
    <div className="max-w-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-2xl font-bold">Match</h1>
          <p className="text-muted-foreground">Encontre sua conexão</p>
        </div>
        <Button variant="outline" size="icon">
          <Filter className="w-5 h-5" />
        </Button>
      </div>

      <div className="relative aspect-[3/4] max-h-[70dvh] sm:max-h-[600px]">
        {isLoading && (
          <div className="absolute inset-0 rounded-3xl glass flex items-center justify-center text-muted-foreground">Carregando...</div>
        )}
        {!isLoading && !currentProfile && (
          <div className="absolute inset-0 rounded-3xl glass flex items-center justify-center text-muted-foreground">
            Nenhum perfil disponível
          </div>
        )}
        {!isLoading && currentProfile && (
          <div
            className={cn(
              'absolute inset-0 rounded-3xl overflow-hidden shadow-elevated transition-all duration-300',
              swipeDirection === 'right' && 'animate-swipe-right',
              swipeDirection === 'left' && 'animate-swipe-left'
            )}
          >
            {coverUrl ? (
              <button type="button" className="w-full h-full" onClick={() => navigate(`/users/${currentProfile.id}`)}>
                <img src={coverUrl} alt={currentProfile.name} className="w-full h-full object-cover" />
              </button>
            ) : (
              <div className="w-full h-full bg-secondary" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            <div className="absolute top-4 left-4 flex gap-2">
              {currentProfile.isVerified && (
                <Badge className="bg-success text-white gap-1">
                  <Sparkles className="w-3 h-3" /> Verificado
                </Badge>
              )}
              {currentProfile.isPremium && (
                <Badge className="bg-gold text-black gap-1">
                  <Star className="w-3 h-3" /> Premium
                </Badge>
              )}
              {isNewProfile && (
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1">
                  Perfil Novo
                </Badge>
              )}
            </div>

            {currentProfile.isOnline && isHoveringPass && (
              <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                <span className="text-xs text-white/90">Online</span>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1 break-words">
                    {currentProfile.name}
                    {age !== null ? `, ${age}` : ''}
                  </h2>
                  {identityLine ? (
                    <div className="mb-3 text-sm text-white/80">{identityLine}</div>
                  ) : (
                    <div className="flex items-center gap-1 text-white/80 mb-3">
                      <MapPin className="w-4 h-4" />
                      <span className="truncate">{cityLine || '—'}</span>
                    </div>
                  )}
                  <p className="text-white/90 text-sm line-clamp-2 mb-4">{currentProfile.bio || ''}</p>
                  
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="bg-white/20 hover:bg-white/30 text-white border-none backdrop-blur-md gap-2"
                    onClick={() => navigate(`/users/${currentProfile.id}`)}
                  >
                    <User className="w-4 h-4" /> Ver Perfil
                  </Button>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="shrink-0 text-white hover:bg-white/10">
                      <MoreHorizontal className="w-5 h-5" />
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

      <div className="mt-6 grid grid-cols-4 gap-3 sm:flex sm:items-center sm:justify-center sm:gap-6">
        <Button
          size="lg"
          variant="outline"
          className="h-14 w-full rounded-full border-2 border-destructive text-destructive hover:bg-destructive hover:text-white transition-all sm:h-16 sm:w-16"
          onClick={handlePass}
          onMouseEnter={() => setIsHoveringPass(true)}
          onMouseLeave={() => setIsHoveringPass(false)}
          disabled={!currentProfile}
        >
          <X className="w-8 h-8" />
        </Button>

        <Button
          size="lg"
          className="h-16 w-full rounded-full bg-gradient-primary shadow-glow hover:opacity-90 transition-all sm:h-20 sm:w-20"
          onClick={() => void handleLike()}
          disabled={!currentProfile}
        >
          <Heart className="w-8 h-8 sm:w-10 sm:h-10" fill="white" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-14 w-full rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all sm:h-16 sm:w-16"
          onClick={() => currentProfile && navigate(`/users/${currentProfile.id}`)}
          disabled={!currentProfile}
        >
          <User className="w-8 h-8" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          className={cn(
            "h-14 w-full rounded-full border-2 transition-all sm:h-16 sm:w-16",
            currentProfile && isFavorite(currentProfile.id)
              ? "border-gold bg-gold text-black hover:bg-gold/90"
              : "border-gold text-gold hover:bg-gold hover:text-black"
          )}
          disabled={!currentProfile}
          onClick={() => {
            if (!currentProfile) return;
            toggleFavorite({
              id: currentProfile.id,
              name: currentProfile.name,
              avatar: currentProfile.avatar || undefined,
              addedAt: new Date().toISOString()
            });
          }}
        >
          <Star className={cn("w-8 h-8", currentProfile && isFavorite(currentProfile.id) && "fill-current")} />
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-4 px-4">Arraste para os lados ou use os botões</p>
    </div>
  );
}
