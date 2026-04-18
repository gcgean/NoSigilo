import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lock, MapPin, Image as ImageIcon, Plus, Star, Flag, Heart, MessageCircle, Send, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usersService, privatePhotosService, chatService, testimonialsService, interactionsService, locationService } from '@/services/api';
import ReportDialog from '@/components/ReportDialog';
import { useToast } from '@/hooks/use-toast';
import { calculateAge } from '@/utils/age';
import { buildProfileAgeLabel } from '@/utils/profileAgeLabel';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserAvatar } from '@/components/UserAvatar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sparkles } from 'lucide-react';
import { resolveServerUrl } from '@/utils/serverUrl';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { hasPremiumAccess } from '@/utils/premium';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean; createdAt?: string };
type Testimonial = { id: string; content: string; status: string; createdAt: string; author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null } };
type PhotoComment = { id: string; content: string; createdAt: string; user?: { id?: string; name?: string; avatar?: string | null } };
type PhotoReaction = 'heart' | 'fire' | 'love' | 'wow' | 'devil' | 'splash';
const PHOTO_REACTIONS: Array<{ id: PhotoReaction; emoji: string }> = [
  { id: 'heart', emoji: '💜' },
  { id: 'fire', emoji: '🔥' },
  { id: 'love', emoji: '😍' },
  { id: 'wow', emoji: '🤭' },
  { id: 'devil', emoji: '😈' },
  { id: 'splash', emoji: '💦' },
];

function resolveMediaUrl(url: string) {
  if (!url) return url;
  return resolveServerUrl(url);
}

function PhotoItem({
  photos,
  initialIndex,
  currentUserId,
}: {
  photos: Photo[];
  initialIndex: number;
  currentUserId?: string | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [likesCount, setLikesCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [myReaction, setMyReaction] = useState<PhotoReaction | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<PhotoReaction, number>>({
    heart: 0,
    fire: 0,
    love: 0,
    wow: 0,
    devil: 0,
    splash: 0,
  });
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isLoadingInteractions, setIsLoadingInteractions] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const currentPhoto = photos[currentIndex] ?? photos[0];
  const currentPhotoId = String(currentPhoto?.id || '');
  const currentPhotoUrl = String(currentPhoto?.url || '');
  const hasGalleryNavigation = photos.length > 1;

  const goPrev = () => {
    if (photos.length <= 1) return;
    setCurrentIndex((prev) => (prev <= 0 ? photos.length - 1 : prev - 1));
  };

  const goNext = () => {
    if (photos.length <= 1) return;
    setCurrentIndex((prev) => (prev >= photos.length - 1 ? 0 : prev + 1));
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    const touch = e.changedTouches?.[0];
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX === null || startY === null || !touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) {
      goNext();
    } else {
      goPrev();
    }
  };

  const loadInteractions = async () => {
    if (!currentPhotoId) return;
    setIsLoadingInteractions(true);
    try {
      const [likes, commentsList] = await Promise.all([
        interactionsService.getLikes('photo', currentPhotoId),
        interactionsService.getComments('photo', currentPhotoId),
      ]);
      const likesArray = Array.isArray(likes) ? likes : [];
      const commentsArray = Array.isArray(commentsList) ? commentsList : [];
      setLikesCount(likesArray.length);
      setLikedByMe(likesArray.some((l: any) => String(l?.user?.id || '') === String(currentUserId || '')));
      const counts: Record<PhotoReaction, number> = { heart: 0, fire: 0, love: 0, wow: 0, devil: 0, splash: 0 };
      let mine: PhotoReaction | null = null;
      for (const like of likesArray) {
        const reaction = (String(like?.reaction || 'heart') as PhotoReaction);
        if (Object.prototype.hasOwnProperty.call(counts, reaction)) counts[reaction] += 1;
        if (String(like?.user?.id || '') === String(currentUserId || '') && Object.prototype.hasOwnProperty.call(counts, reaction)) {
          mine = reaction;
        }
      }
      setReactionCounts(counts);
      setMyReaction(mine);
      setComments(commentsArray);
    } catch {
      toast({ title: 'Falha ao carregar interações da foto', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsLoadingInteractions(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCommentDraft('');
    void loadInteractions();
  }, [open, currentPhotoId, currentUserId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, photos.length]);

  const toggleLike = async () => {
    if (!currentPhotoId) return;
    const nextLiked = !likedByMe;
    setLikedByMe(nextLiked);
    setLikesCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));
    try {
      if (nextLiked) {
        await interactionsService.like('photo', currentPhotoId);
      } else {
        await interactionsService.unlike('photo', currentPhotoId);
      }
    } catch {
      setLikedByMe(!nextLiked);
      setLikesCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)));
      toast({ title: 'Falha ao curtir foto', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const reactToPhoto = async (reaction: PhotoReaction) => {
    if (!currentPhotoId) return;
    if (myReaction === reaction) {
      try {
        await interactionsService.unlike('photo', currentPhotoId);
        await loadInteractions();
      } catch {
        toast({ title: 'Falha ao remover reação', description: 'Tente novamente.', variant: 'destructive' });
      }
      return;
    }
    try {
      await interactionsService.like('photo', currentPhotoId, reaction);
      await loadInteractions();
    } catch {
      toast({ title: 'Falha ao reagir', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const sendComment = async () => {
    if (!currentPhotoId) return;
    const content = commentDraft.trim();
    if (!content) return;
    setIsSendingComment(true);
    try {
      await interactionsService.comment('photo', currentPhotoId, content);
      setCommentDraft('');
      await loadInteractions();
    } catch {
      toast({ title: 'Falha ao comentar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSendingComment(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in" onClick={() => setCurrentIndex(initialIndex)}>
          <img
            src={resolveMediaUrl(currentPhotoUrl)}
            alt=""
            className="w-full h-full object-cover transition-transform hover:scale-105"
          />
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[96dvh] max-w-[96vw] overflow-y-auto border-white/10 bg-black/92 p-2 shadow-2xl sm:p-3">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 z-[60] h-9 w-9 rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/85"
          onClick={() => setOpen(false)}
          aria-label="Fechar foto"
        >
          <X className="h-4 w-4" />
        </Button>
        {hasGalleryNavigation ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute left-3 top-1/2 z-[60] h-10 w-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/85"
              onClick={goPrev}
              aria-label="Foto anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-3 top-1/2 z-[60] h-10 w-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/85"
              onClick={goNext}
              aria-label="Próxima foto"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : null}
        <div className="mx-auto w-full max-w-3xl">
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <img
              src={resolveMediaUrl(currentPhotoUrl)}
              alt=""
              className="block max-h-[70dvh] w-full rounded-xl object-contain"
            />
          </div>
          {hasGalleryNavigation ? (
            <div className="mt-2 text-center text-xs text-white/75">
              Foto {currentIndex + 1} de {photos.length}
            </div>
          ) : null}
          <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3 text-white">
            <div className="mb-3 flex items-center gap-4">
              <button
                type="button"
                className={cn('flex items-center gap-2 text-sm transition-colors', likedByMe ? 'text-primary' : 'text-white/85')}
                onClick={() => void toggleLike()}
              >
                <Heart className={cn('h-4 w-4', likedByMe && 'fill-current')} />
                {likesCount}
              </button>
              <div className="flex items-center gap-2 text-sm text-white/85">
                <MessageCircle className="h-4 w-4" />
                {comments.length}
              </div>
              {isLoadingInteractions ? <span className="text-xs text-white/60">Atualizando...</span> : null}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              {PHOTO_REACTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void reactToPhoto(item.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    myReaction === item.id ? 'border-primary bg-primary/25 text-white' : 'border-white/15 bg-white/5 text-white/90'
                  )}
                >
                  <span className="mr-1">{item.emoji}</span>
                  <span>{reactionCounts[item.id] || 0}</span>
                </button>
              ))}
            </div>

            <div className="mb-3 max-h-40 space-y-2 overflow-y-auto pr-1">
              {comments.length === 0 ? <p className="text-sm text-white/70">Sem comentários ainda.</p> : null}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-white/5 p-2">
                  <p className="text-xs font-semibold text-white">{String(c.user?.name || 'Usuário')}</p>
                  <p className="text-sm text-white/85">{c.content}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendComment();
                }}
                placeholder="Comentar foto..."
                className="border-white/15 bg-white/5 text-white placeholder:text-white/50"
              />
              <Button
                type="button"
                size="icon"
                className="bg-gradient-primary hover:opacity-90"
                disabled={isSendingComment || !commentDraft.trim()}
                onClick={() => void sendComment()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function UserProfile() {
  const { userId } = useParams();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'public' | 'private' | 'testimonials'>('public');
  const [profile, setProfile] = useState<any | null>(null);
  const [publicPhotos, setPublicPhotos] = useState<Photo[]>([]);
  const [privatePhotos, setPrivatePhotos] = useState<Photo[]>([]);
  const [access, setAccess] = useState<{ status: string; requestId?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
  const [testimonialDraft, setTestimonialDraft] = useState('');
  const [isSendingTestimonial, setIsSendingTestimonial] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const lastRegisteredVisitRef = useRef<string | null>(null);

  const isSelf = !!me?.id && !!userId && me.id === userId;
  const premiumAccess = hasPremiumAccess(me);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const tab = sp.get('tab');
    if (tab === 'public' || tab === 'private' || tab === 'testimonials') setActiveTab(tab);
  }, [location.search]);

  useEffect(() => {
    if (location.hash !== '#testimonials') return;
    setActiveTab('testimonials');
    window.setTimeout(() => {
      const el = document.getElementById('testimonials');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [location.hash]);

  useEffect(() => {
    if (!userId) return;
    if (isSelf) {
      navigate('/profile', { replace: true });
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const user = await usersService.getUser(userId);
        if (cancelled) return;

        setProfile(user);

        const [photosResult, accessResult] = await Promise.allSettled([
          usersService.getUserPhotos(userId, 'public'),
          usersService.getPrivatePhotosAccess(userId),
        ]);

        if (cancelled) return;

        setPublicPhotos(
          photosResult.status === 'fulfilled' && Array.isArray(photosResult.value)
            ? photosResult.value
            : []
        );
        setAccess(
          accessResult.status === 'fulfilled' && accessResult.value
            ? accessResult.value
            : { status: 'none' }
        );

        if (lastRegisteredVisitRef.current !== userId) {
          lastRegisteredVisitRef.current = userId;
          void locationService.registerVisit(userId).catch(() => {});
        }
      } catch {
        if (cancelled) return;
        setProfile(null);
        setPublicPhotos([]);
        setAccess({ status: 'none' });
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isSelf, navigate]);

  useEffect(() => {
    if (!userId) return;
    if (activeTab !== 'private') return;
    if (!access) return;
    if (access.status !== 'approved') return;
    let cancelled = false;
    setIsLoadingPrivate(true);
    usersService
      .getUserPhotos(userId, 'private')
      .then((photos) => {
        if (cancelled) return;
        setPrivatePhotos(Array.isArray(photos) ? photos : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPrivatePhotos([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingPrivate(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, access, userId]);

  useEffect(() => {
    if (!userId) return;
    if (activeTab !== 'testimonials') return;
    let cancelled = false;
    setIsLoadingTestimonials(true);
    usersService
      .getTestimonials(userId)
      .then((list) => {
        if (cancelled) return;
        setTestimonials(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (cancelled) return;
        setTestimonials([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingTestimonials(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, userId]);

  const ageLabel = useMemo(() => buildProfileAgeLabel(profile), [profile]);
  const sexualOptionsLabel = useMemo(() => {
    if (!Array.isArray(profile?.lookingFor)) return '';
    return profile.lookingFor.filter((x: unknown) => typeof x === 'string' && x.trim()).join(' • ');
  }, [profile?.lookingFor]);
  const cityLine = useMemo(() => [profile?.city, profile?.state].filter(Boolean).join(', ') || '—', [profile?.city, profile?.state]);
  const avatarUrl = useMemo(() => resolveMediaUrl(profile?.avatar || ''), [profile?.avatar]);

  const isNewProfile = useMemo(() => {
    if (!profile?.createdAt) return false;
    const created = new Date(profile.createdAt).getTime();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return created > weekAgo;
  }, [profile?.createdAt]);

  const requestAccess = async () => {
    if (!userId) return;
    setIsRequesting(true);
    try {
      const res = await privatePhotosService.requestAccess(userId);
      setAccess({ status: String(res?.status || 'pending'), requestId: res?.id ? String(res.id) : undefined });
      toast({ title: 'Solicitação enviada', description: 'Aguarde a autorização do usuário.' });
    } catch {
      toast({ title: 'Falha ao solicitar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsRequesting(false);
    }
  };
  
  const startChat = async () => {
    if (!premiumAccess) {
      toast({ title: 'Plano necessário', description: 'Renove seu plano para conversar e navegar pelos perfis.', variant: 'destructive' });
      navigate('/subscriptions');
      return;
    }
    if (!userId) return;
    setIsStartingChat(true);
    try {
      const res = await chatService.createConversation(userId);
      const conversationId = res?.id ? String(res.id) : '';
      if (!conversationId) throw new Error('Falha ao iniciar conversa');
      navigate('/chat', { state: { conversationId } });
    } catch {
      toast({ title: 'Não foi possível iniciar o chat', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsStartingChat(false);
    }
  };

  const sendTestimonial = async () => {
    if (!userId) return;
    const content = testimonialDraft.trim();
    if (content.length < 10) {
      toast({ title: 'Depoimento muito curto', description: 'Escreva pelo menos 10 caracteres.', variant: 'destructive' });
      return;
    }
    setIsSendingTestimonial(true);
    try {
      await testimonialsService.create(userId, content);
      setTestimonialDraft('');
      toast({ title: 'Depoimento enviado', description: 'O usuário precisa aprovar para aparecer no perfil.' });
    } catch {
      toast({ title: 'Falha ao enviar depoimento', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSendingTestimonial(false);
    }
  };

  if (isLoading) {
    return <div className="max-w-2xl mx-auto w-full text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!profile) {
    return <div className="max-w-2xl mx-auto w-full text-sm text-muted-foreground">Perfil não encontrado.</div>;
  }

  const publicPhotosCount = Number(profile?.publicPhotosCount ?? publicPhotos.length ?? 0);
  const privatePhotosCount = Number(
    profile?.privatePhotosCount ?? (access?.status === 'approved' ? privatePhotos.length : 0)
  );
  const testimonialsCount = Number(
    profile?.testimonialsCount ??
      testimonials.filter((t) => String(t.status) === 'approved').length ??
      0
  );

  if (!isSelf && !premiumAccess) {
    return (
      <div className="max-w-2xl mx-auto w-full">
        <button
          type="button"
          onClick={() => navigate('/subscriptions')}
          className="glass w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-left transition-colors hover:bg-destructive/10"
        >
          <div className="flex items-center gap-3 mb-3">
            <Lock className="h-5 w-5 text-destructive" />
            <h1 className="text-2xl font-bold">Perfil bloqueado</h1>
          </div>
          <p className="text-muted-foreground">Renove seu plano para navegar pelos perfis, ver o Match e responder no chat.</p>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <UserAvatar 
              user={profile} 
              className="w-32 h-32 sm:w-40 sm:h-40 border-4 border-white shadow-xl" 
              indicatorClassName="h-6 w-6 ring-4 ring-white bottom-2 right-2"
            />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="mb-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="max-w-full break-words text-2xl font-bold leading-tight sm:text-3xl">{profile?.name}</h1>
              {profile?.isVerified && (
                <Badge className="bg-success text-white gap-1">
                  <Sparkles className="w-3 h-3" /> Verificado
                </Badge>
              )}
              {profile?.isPremium && <Badge className="bg-gold/15 text-gold border border-gold/30">Premium</Badge>}
              {isNewProfile && (
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  Perfil Novo
                </Badge>
              )}
            </div>
            
            <div className="flex flex-col gap-1 text-muted-foreground mb-4">
              <div className="flex items-center justify-center sm:justify-start gap-1">
                <MapPin className="w-4 h-4" />
                <span>{cityLine}</span>
              </div>
              <div className="flex items-center justify-center sm:justify-start gap-3 text-sm">
                <span>{profile?.gender || '—'}</span>
                {ageLabel ? (
                  <>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>{ageLabel}</span>
                  </>
                ) : null}
              {profile?.sexualOrientation ? (
                <>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span>{profile.sexualOrientation}</span>
                </>
              ) : null}
            </div>
              {sexualOptionsLabel ? (
                <div className="text-xs">
                  <span className="font-medium">Opções sexuais:</span> {sexualOptionsLabel}
                </div>
              ) : null}
              {!profile?.isOnline && profile?.lastSeenAt && (
                <div className="text-xs">
                  Visto por último em {format(new Date(profile.lastSeenAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </div>
              )}
              {profile?.isOnline && (
                <div className="text-xs text-success font-medium flex items-center justify-center sm:justify-start gap-1">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Online agora
                </div>
              )}
            </div>

            {profile?.bio ? <p className="text-muted-foreground text-sm mb-4">{profile.bio}</p> : null}
            
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <Button
                className="bg-gradient-primary hover:opacity-90"
                onClick={() => void startChat()}
                disabled={isStartingChat || String(profile?.allowMessages || 'everyone') === 'nobody'}
              >
                {String(profile?.allowMessages || 'everyone') === 'nobody' ? 'Mensagens desativadas' : isStartingChat ? 'Abrindo...' : 'Mandar mensagem'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive gap-1"
                onClick={() => setShowReportDialog(true)}
              >
                <Flag className="w-3.5 h-3.5" />
                Denunciar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        targetType="user"
        targetId={String(userId)}
        targetName={String(profile?.name || '')}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="public" className="flex-1 gap-2">
            <ImageIcon className="w-4 h-4" />
            Públicas ({publicPhotosCount})
          </TabsTrigger>
          <TabsTrigger value="private" className="flex-1 gap-2">
            <Lock className="w-4 h-4" />
            Privadas ({privatePhotosCount})
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="flex-1 gap-2">
            <Star className="w-4 h-4" />
            Depoimentos ({testimonialsCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <div className="grid grid-cols-3 gap-3">
            {publicPhotos.map((photo, index) => (
              <PhotoItem key={photo.id} photos={publicPhotos} initialIndex={index} currentUserId={me?.id} />
            ))}
            {publicPhotos.length === 0 && <div className="col-span-3 text-sm text-muted-foreground">Sem fotos públicas.</div>}
          </div>
        </TabsContent>

        <TabsContent value="private">
          {access?.status === 'approved' ? (
            <div className="grid grid-cols-3 gap-3">
              {isLoadingPrivate && <div className="col-span-3 text-sm text-muted-foreground">Carregando...</div>}
              {!isLoadingPrivate &&
                privatePhotos.map((photo, index) => (
                  <PhotoItem key={photo.id} photos={privatePhotos} initialIndex={index} currentUserId={me?.id} />
                ))}
              {!isLoadingPrivate && privatePhotos.length === 0 && <div className="col-span-3 text-sm text-muted-foreground">Sem fotos privadas.</div>}
            </div>
          ) : (
            <div className="glass rounded-xl p-8 text-center">
              <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Fotos Privadas</h3>
              <p className="text-muted-foreground text-sm mb-4">
                {access?.status === 'pending'
                  ? 'Sua solicitação já foi enviada. Aguarde a aprovação.'
                  : 'Para ver as fotos privadas, solicite permissão ao usuário.'}
              </p>
              <Button className="bg-gradient-primary hover:opacity-90 gap-2" disabled={isRequesting || access?.status === 'pending'} onClick={() => void requestAccess()}>
                <Plus className="w-4 h-4" />
                {access?.status === 'pending' ? 'Solicitação enviada' : 'Solicitar acesso'}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="testimonials">
          <div className="glass rounded-xl p-6 mb-4">
            <h3 className="font-semibold mb-2">Deixe um depoimento</h3>
            <Textarea
              value={testimonialDraft}
              onChange={(e) => setTestimonialDraft(e.target.value)}
              placeholder="Conte como foi sua experiência..."
              rows={4}
            />
            <div className="flex justify-end mt-3">
              <Button className="bg-gradient-primary hover:opacity-90" disabled={isSendingTestimonial} onClick={() => void sendTestimonial()}>
                {isSendingTestimonial ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>

          <div id="testimonials" className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Depoimentos</h3>
            {isLoadingTestimonials ? <div className="text-sm text-muted-foreground">Carregando...</div> : null}
            {!isLoadingTestimonials && testimonials.filter((t) => String(t.status) === 'approved').length === 0 ? (
              <div className="text-sm text-muted-foreground">Sem depoimentos ainda.</div>
            ) : null}
            {!isLoadingTestimonials &&
              testimonials
                .filter((t) => String(t.status) === 'approved')
                .map((t) => (
                  <div key={t.id} className="rounded-xl border p-4 mb-3 bg-secondary/10">
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={t.author.avatar ? resolveServerUrl(t.author.avatar) : undefined} />
                        <AvatarFallback>{String(t.author.name || 'U')[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{t.author.name}</div>
                        {formatProfileIdentityLine(t.author) ? (
                          <div className="text-xs text-muted-foreground">{formatProfileIdentityLine(t.author)}</div>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground ml-auto">{new Date(t.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{t.content}</div>
                  </div>
                ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
