import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lock, MapPin, Image as ImageIcon, Plus, Star, Flag, Heart, MessageCircle, Send, X, ChevronLeft, ChevronRight, Play, Video, Ban, ShieldOff, TrendingUp, BadgeCheck, Maximize2, BookOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usersService, privatePhotosService, chatService, testimonialsService, interactionsService, locationService, experienceService, profileService } from '@/services/api';
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
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import {
  COMMENT_ACTION_BUTTON_BASE,
  COMMENT_ACTION_DELETE_CLASS,
  COMMENT_ACTION_EDIT_CLASS,
  COMMENT_CANCEL_BUTTON_CLASS,
  COMMENT_EMOJI_CHIP_CLASS,
  COMMENT_INLINE_INPUT_CLASS,
  COMMENT_QUICK_EMOJIS,
  COMMENT_SAVE_BUTTON_CLASS,
} from '@/components/comments/commentStyles';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean; createdAt?: string };
type Testimonial = { id: string; content: string; status: string; createdAt: string; media?: Array<{ id: string; url: string; mimeType: string }>; author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null } };
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
const FULLSCREEN_VIDEO_SWIPE_THRESHOLD_PX = 36;
const FULLSCREEN_VIDEO_SWIPE_VERTICAL_DOMINANCE = 1.15;

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
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
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

  const startEditingComment = (comment: PhotoComment) => {
    setEditingCommentId(comment.id);
    setEditCommentDraft(comment.content || '');
  };

  const cancelEditingComment = () => {
    setEditingCommentId(null);
    setEditCommentDraft('');
  };

  const saveEditedComment = async (commentId: string) => {
    const content = editCommentDraft.trim();
    if (!content) return;
    try {
      await interactionsService.updateComment(commentId, content);
      setEditingCommentId(null);
      setEditCommentDraft('');
      await loadInteractions();
    } catch {
      toast({ title: 'Falha ao editar comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const removeComment = async (commentId: string) => {
    try {
      await interactionsService.deleteComment(commentId);
      await loadInteractions();
    } catch {
      toast({ title: 'Falha ao excluir comentário', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in" onClick={() => setCurrentIndex(initialIndex)}>
          <img
            src={resolveMediaUrl(currentPhotoUrl)}
            alt=""
            className="h-full w-full bg-black object-contain transition-transform hover:scale-105 sm:object-cover"
          />
        </div>
      </DialogTrigger>
      <DialogContent className="max-h-[96dvh] max-w-[96vw] overflow-y-auto border-white/10 bg-black/92 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-2xl sm:p-3">
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
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-white">{String(c.user?.name || 'Usuário')}</p>
                    {String(c.user?.id || '') === String(currentUserId || '') ? (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_EDIT_CLASS}`}
                          onClick={() => startEditingComment(c)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`${COMMENT_ACTION_BUTTON_BASE} ${COMMENT_ACTION_DELETE_CLASS}`}
                          onClick={() => void removeComment(c.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {editingCommentId === c.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        value={editCommentDraft}
                        onChange={(e) => setEditCommentDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveEditedComment(c.id);
                        }}
                        className={COMMENT_INLINE_INPUT_CLASS}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className={COMMENT_SAVE_BUTTON_CLASS}
                        onClick={() => void saveEditedComment(c.id)}
                        disabled={!editCommentDraft.trim()}
                      >
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={COMMENT_CANCEL_BUTTON_CLASS}
                        onClick={cancelEditingComment}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-white/85">{c.content}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
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
              <div className="flex flex-wrap items-center gap-1.5">
                {COMMENT_QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={`photo-emoji-${emoji}`}
                    type="button"
                    onClick={() => setCommentDraft((prev) => `${prev}${emoji}`)}
                    className={COMMENT_EMOJI_CHIP_CLASS}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
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

  const [activeTab, setActiveTab] = useState<'public' | 'private' | 'testimonials' | 'videos' | 'experiences'>('public');
  const [profile, setProfile] = useState<any | null>(null);
  const [publicPhotos, setPublicPhotos] = useState<Photo[]>([]);
  const [privatePhotos, setPrivatePhotos] = useState<Photo[]>([]);
  const [access, setAccess] = useState<{ status: string; requestId?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
  const [userVideos, setUserVideos] = useState<Array<{ id: string; postId: string; url: string; content: string; createdAt: string }>>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [userExperiences, setUserExperiences] = useState<Array<{ id: string; title: string; description: string; createdAt: string; likesCount: number; commentsCount: number; likedByMe: boolean }>>([]);
  const [isLoadingExperiences, setIsLoadingExperiences] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [maximizedVideoIndex, setMaximizedVideoIndex] = useState<number | null>(null);
  const maximizedTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [testimonialDraft, setTestimonialDraft] = useState('');
  const [isSendingTestimonial, setIsSendingTestimonial] = useState(false);
  const [testimonialPhotos, setTestimonialPhotos] = useState<File[]>([]);
  const [testimonialPhotoPreview, setTestimonialPhotoPreview] = useState<string[]>([]);
  const [testimonialPhotoIndex, setTestimonialPhotoIndex] = useState<Record<string, number>>({});
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [blockStatus, setBlockStatus] = useState<{ blocked: boolean; blockedByMe: boolean; blockedByThem: boolean } | null>(null);
  const [isBlockLoading, setIsBlockLoading] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const lastRegisteredVisitRef = useRef<string | null>(null);

  const isSelf = !!me?.id && !!userId && me.id === userId;
  const premiumAccess = hasPremiumAccess(me);

  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const tab = sp.get('tab');
    if (tab === 'public' || tab === 'private' || tab === 'testimonials' || tab === 'videos') setActiveTab(tab);
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
        const [userResult, blockResult] = await Promise.allSettled([
          usersService.getUser(userId),
          usersService.getBlockStatus(userId),
        ]);

        if (cancelled) return;

        // Handle blocked scenario — API returns 403 with error 'blocked'
        if (userResult.status === 'rejected') {
          const err = userResult.reason as any;
          if (err?.response?.status === 403 && err?.response?.data?.error === 'blocked') {
            const bStatus = blockResult.status === 'fulfilled' ? blockResult.value : { blocked: true, blockedByMe: false, blockedByThem: true };
            setBlockStatus(bStatus);
          }
          setProfile(null);
          setPublicPhotos([]);
          setAccess({ status: 'none' });
          return;
        }

        const user = userResult.value;
        setProfile(user);
        if (blockResult.status === 'fulfilled') setBlockStatus(blockResult.value);

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

  useEffect(() => {
    if (!userId) return;
    if (activeTab !== 'videos') return;
    let cancelled = false;
    setIsLoadingVideos(true);
    usersService
      .getUserPosts(userId, { videosOnly: true, limit: 30 })
      .then((data) => {
        if (cancelled) return;
        const posts = Array.isArray(data?.posts) ? data.posts : [];
        const videos = posts.flatMap((post) =>
          (post.media || [])
            .filter((m) => String(m.mimeType || '').startsWith('video/') && m.url)
            .map((m) => ({
              id: String(m.id),
              postId: String(post.id),
              url: resolveMediaUrl(m.url || ''),
              content: String(post.content || ''),
              createdAt: String(post.createdAt || ''),
            }))
        );
        setUserVideos(videos);
      })
      .catch(() => {
        if (cancelled) return;
        setUserVideos([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingVideos(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, userId]);

  useEffect(() => {
    if (!userId) return;
    if (activeTab !== 'experiences') return;
    if (userExperiences.length > 0) return;
    setIsLoadingExperiences(true);
    experienceService
      .getByUser(userId)
      .then((data) => setUserExperiences(Array.isArray(data) ? data : []))
      .catch(() => setUserExperiences([]))
      .finally(() => setIsLoadingExperiences(false));
  }, [activeTab, userId]);

  const ageLabel = useMemo(() => buildProfileAgeLabel(profile), [profile]);
  const sexualOptionsLabel = useMemo(() => {
    if (!Array.isArray(profile?.lookingFor)) return '';
    return profile.lookingFor.filter((x: unknown) => typeof x === 'string' && x.trim()).join(' • ');
  }, [profile?.lookingFor]);
  const cityLine = useMemo(() => [profile?.city, profile?.state].filter(Boolean).join(', ') || '—', [profile?.city, profile?.state]);
  const distanceLabel = useMemo(() => {
    const distance = Number(profile?.distanceKm);
    if (!Number.isFinite(distance) || distance < 0) return '';
    return `${distance.toLocaleString('pt-BR', { minimumFractionDigits: distance % 1 === 0 ? 0 : 1, maximumFractionDigits: 1 })} km de você`;
  }, [profile?.distanceKm]);
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
      setPaywallOpen(true);
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

  const handleBlock = async () => {
    if (!userId) return;
    setIsBlockLoading(true);
    try {
      await usersService.blockUser(userId);
      setBlockStatus({ blocked: true, blockedByMe: true, blockedByThem: false });
      toast({ title: 'Usuário bloqueado', description: 'Ele não poderá mais ver seu perfil ou enviar mensagens.' });
      setShowBlockConfirm(false);
    } catch {
      toast({ title: 'Falha ao bloquear', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsBlockLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!userId) return;
    setIsBlockLoading(true);
    try {
      await usersService.unblockUser(userId);
      setBlockStatus({ blocked: false, blockedByMe: false, blockedByThem: false });
      toast({ title: 'Usuário desbloqueado', description: 'O bloqueio foi removido.' });
    } catch {
      toast({ title: 'Falha ao desbloquear', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsBlockLoading(false);
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
      const mediaIds: string[] = [];
      for (const file of testimonialPhotos) {
        const uploaded = await profileService.uploadMedia(file, { source: 'post' });
        if (uploaded?.id) mediaIds.push(String(uploaded.id));
      }
      await testimonialsService.create(userId, content, mediaIds);
      setTestimonialDraft('');
      setTestimonialPhotos([]);
      setTestimonialPhotoPreview([]);
      toast({ title: 'Depoimento enviado', description: 'O usuário precisa aprovar para aparecer no perfil.' });
    } catch {
      toast({ title: 'Falha ao enviar depoimento', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSendingTestimonial(false);
    }
  };

  const closeMaximizedVideo = () => {
    setMaximizedVideoIndex(null);
  };

  const openMaximizedVideoAt = (index: number) => {
    if (index < 0 || index >= userVideos.length) return;
    setMaximizedVideoIndex(index);
  };

  const goToNextMaximizedVideo = () => {
    if (maximizedVideoIndex === null || userVideos.length <= 1) return;
    setMaximizedVideoIndex((prev) => {
      if (prev === null) return prev;
      return prev >= userVideos.length - 1 ? 0 : prev + 1;
    });
  };

  const goToPrevMaximizedVideo = () => {
    if (maximizedVideoIndex === null || userVideos.length <= 1) return;
    setMaximizedVideoIndex((prev) => {
      if (prev === null) return prev;
      return prev <= 0 ? userVideos.length - 1 : prev - 1;
    });
  };

  const handleMaximizedTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches?.[0];
    if (!touch) return;
    maximizedTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleMaximizedTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = maximizedTouchStartRef.current;
    maximizedTouchStartRef.current = null;
    const touch = e.changedTouches?.[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) < FULLSCREEN_VIDEO_SWIPE_THRESHOLD_PX) return;
    if (Math.abs(deltaY) <= Math.abs(deltaX) * FULLSCREEN_VIDEO_SWIPE_VERTICAL_DOMINANCE) return;
    if (deltaY < 0) {
      goToNextMaximizedVideo();
    } else {
      goToPrevMaximizedVideo();
    }
  };

  const maximizedVideo =
    maximizedVideoIndex !== null && maximizedVideoIndex >= 0 && maximizedVideoIndex < userVideos.length
      ? userVideos[maximizedVideoIndex]
      : null;

  if (isLoading) {
    return <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!profile) {
    // Blocked by them OR we blocked them — show appropriate message
    if (blockStatus?.blockedByThem) {
      return (
        <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <Ban className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Perfil indisponível</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Você não pode visualizar este perfil pois foi bloqueado(a) por este usuário, ou bloqueou este usuário.
          </p>
          {blockStatus?.blockedByMe && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBlockLoading}
              onClick={() => void handleUnblock()}
            >
              <ShieldOff className="w-4 h-4 mr-1.5" />
              {isBlockLoading ? 'Desbloqueando...' : 'Desbloquear'}
            </Button>
          )}
        </div>
      );
    }
    if (blockStatus?.blockedByMe) {
      return (
        <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden flex flex-col items-center justify-center gap-4 py-16 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Ban className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">Usuário bloqueado</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Você bloqueou este usuário. Desbloqueie para ver o perfil.
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={isBlockLoading}
            onClick={() => void handleUnblock()}
          >
            <ShieldOff className="w-4 h-4 mr-1.5" />
            {isBlockLoading ? 'Desbloqueando...' : 'Desbloquear'}
          </Button>
        </div>
      );
    }
    return <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden text-sm text-muted-foreground">Perfil não encontrado.</div>;
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
  const videosCount = Number(profile?.videosCount ?? userVideos.length ?? 0);
  const profileVisitsCount = Number(profile?.profileVisitsCount ?? 0);

  if (!isSelf && !premiumAccess) {
    return (
      <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden">
        <button
          type="button"
          onClick={() => setPaywallOpen(true)}
          className="glass w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-left transition-colors hover:bg-destructive/10"
        >
          <div className="flex items-center gap-3 mb-3">
            <Lock className="h-5 w-5 text-destructive" />
            <h1 className="text-2xl font-bold">Perfil bloqueado</h1>
          </div>
          <p className="text-muted-foreground">Renove seu plano para navegar pelos perfis, ver o Match e responder no chat.</p>
        </button>

        <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden">
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6 min-w-0">
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
              {profile?.ambassadorBadges?.includes('ambassador_elite') && (
                <Badge className="bg-purple-500/15 text-purple-500 border border-purple-500/30 gap-1">
                  🏅 Embaixador(a) Elite
                </Badge>
              )}
              {!profile?.ambassadorBadges?.includes('ambassador_elite') && profile?.ambassadorBadges?.includes('ambassador_gold') && (
                <Badge className="bg-yellow-500/15 text-yellow-600 border border-yellow-500/30 gap-1">
                  🥇 Embaixador(a) Gold
                </Badge>
              )}
              {!profile?.ambassadorBadges?.includes('ambassador_gold') && !profile?.ambassadorBadges?.includes('ambassador_elite') && profile?.ambassadorBadges?.includes('ambassador') && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 gap-1">
                  🤝 Embaixador(a)
                </Badge>
              )}
            </div>
            
            <div className="flex flex-col gap-1 text-muted-foreground mb-4">
              <div className="flex items-center justify-center sm:justify-start gap-1">
                <MapPin className="w-4 h-4" />
                <span>{cityLine}</span>
              </div>
              {distanceLabel ? (
                <div className="flex items-center justify-center sm:justify-start gap-1 text-xs font-medium text-primary">
                  <span>{distanceLabel}</span>
                </div>
              ) : null}
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
              {profile?.isOnline && (
                <div className="text-xs text-success font-medium flex items-center justify-center sm:justify-start gap-1">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Online agora
                </div>
              )}
            </div>

            {profile?.bio ? (
              <div className="mb-4 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3.5">
                <p className="mb-1 text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
                  {isSelf ? 'Sua descrição do perfil' : 'Leia nossa descrição antes de chamar no chat'}
                </p>
                <p className="text-[15px] leading-relaxed text-primary">{profile.bio}</p>
              </div>
            ) : null}

            {!isSelf ? (
              <div className="mb-4 rounded-xl border bg-background/70 p-3.5">
                <div className="grid grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-xl border bg-card px-3 py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span className="text-[11px] uppercase tracking-wide">Alcance</span>
                    </div>
                    <p className="text-lg font-bold leading-none">{profileVisitsCount.toLocaleString('pt-BR')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Visitas no perfil</p>
                  </div>
                  <div className="rounded-xl border bg-card px-3 py-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      <span className="text-[11px] uppercase tracking-wide">Confiança</span>
                    </div>
                    <p className="text-lg font-bold leading-none">{testimonialsCount.toLocaleString('pt-BR')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Depoimentos e indicações</p>
                  </div>
                </div>
              </div>
            ) : null}
            
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
              {blockStatus?.blockedByMe ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  disabled={isBlockLoading}
                  onClick={() => void handleUnblock()}
                >
                  <ShieldOff className="w-3.5 h-3.5" />
                  {isBlockLoading ? 'Desbloqueando...' : 'Desbloquear'}
                </Button>
              ) : (
                <>
                  {showBlockConfirm ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs">
                      <span className="text-destructive font-medium">Bloquear usuário?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 px-2 text-xs"
                        disabled={isBlockLoading}
                        onClick={() => void handleBlock()}
                      >
                        {isBlockLoading ? '...' : 'Sim'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowBlockConfirm(false)}
                      >
                        Não
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive/70 border-destructive/20 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
                      onClick={() => setShowBlockConfirm(true)}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Bloquear
                    </Button>
                  )}
                </>
              )}
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
        <TabsList className="w-full mb-4 flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="public" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Públicas ({publicPhotosCount})</span>
          </TabsTrigger>
          {(isSelf || privatePhotosCount > 0) && (
            <TabsTrigger value="private" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Privadas {privatePhotosCount > 0 ? `(${privatePhotosCount})` : ''}</span>
            </TabsTrigger>
          )}
          {(isSelf || videosCount > 0) && (
            <TabsTrigger value="videos" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Video className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Vídeos {videosCount > 0 ? `(${activeTab === 'videos' ? userVideos.length : videosCount})` : ''}</span>
            </TabsTrigger>
          )}
          {(isSelf || testimonialsCount > 0) && (
            <TabsTrigger value="testimonials" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Star className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Depoimentos {testimonialsCount > 0 ? `(${testimonialsCount})` : ''}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="experiences" className="flex-1 gap-1.5 text-xs sm:text-sm">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Experiências {userExperiences.length > 0 ? `(${userExperiences.length})` : ''}</span>
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

        <TabsContent value="videos">
          {isLoadingVideos ? (
            <div className="text-sm text-muted-foreground py-4">Carregando vídeos...</div>
          ) : userVideos.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Video className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">Nenhum vídeo publicado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {userVideos.map((video, index) => (
                <div
                  key={video.id}
                  className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black cursor-pointer group"
                  onClick={() => setPlayingVideoId(playingVideoId === video.id ? null : video.id)}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-2 z-20 h-8 w-8 rounded-full border border-white/20 bg-black/65 text-white hover:bg-black/80"
                    aria-label="Maximizar vídeo"
                    onClick={(e) => {
                      e.stopPropagation();
                      openMaximizedVideoAt(index);
                    }}
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                  <video
                    src={video.url}
                    className="h-full w-full bg-black object-contain sm:object-cover"
                    playsInline
                    muted
                    loop
                    preload="metadata"
                    ref={(el) => {
                      if (!el) return;
                      if (playingVideoId === video.id) {
                        void el.play().catch(() => {});
                      } else {
                        el.pause();
                        el.currentTime = 0;
                      }
                    }}
                  />
                  {/* Overlay gradient */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  {/* Play icon when paused */}
                  {playingVideoId !== video.id && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm group-hover:bg-black/70 transition">
                        <Play className="h-6 w-6 translate-x-0.5 text-white" />
                      </div>
                    </div>
                  )}
                  {/* Caption */}
                  {video.content ? (
                    <p className="absolute bottom-2 left-2 right-2 line-clamp-2 text-xs text-white/90 leading-4">
                      {video.content}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="testimonials">
          {/* Composer */}
          {!isSelf && (
            <div className="glass rounded-xl p-4 mb-4">
              <div className="flex gap-3">
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarImage src={me?.avatar ? resolveServerUrl(me.avatar) : undefined} />
                  <AvatarFallback>{String(me?.name || 'U')[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={testimonialDraft}
                    onChange={(e) => setTestimonialDraft(e.target.value)}
                    placeholder="Conte como foi sua experiência..."
                    rows={3}
                    className="resize-none"
                  />
                  {/* Photo previews */}
                  {testimonialPhotoPreview.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {testimonialPhotoPreview.map((src, i) => (
                        <div key={i} className="relative w-20 h-20">
                          <img src={src} className="w-20 h-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white text-xs"
                            onClick={() => {
                              setTestimonialPhotos((p) => p.filter((_, idx) => idx !== i));
                              setTestimonialPhotoPreview((p) => p.filter((_, idx) => idx !== i));
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <label className="cursor-pointer flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <ImageIcon className="w-4 h-4" />
                      <span>Foto</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []).slice(0, 5 - testimonialPhotos.length);
                          setTestimonialPhotos((p) => [...p, ...files].slice(0, 5));
                          files.forEach((f) => {
                            const reader = new FileReader();
                            reader.onload = (ev) => setTestimonialPhotoPreview((p) => [...p, ev.target?.result as string]);
                            reader.readAsDataURL(f);
                          });
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <Button size="sm" className="bg-gradient-primary hover:opacity-90" disabled={isSendingTestimonial || testimonialDraft.trim().length < 10} onClick={() => void sendTestimonial()}>
                      {isSendingTestimonial ? 'Enviando...' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* List */}
          <div id="testimonials" className="space-y-3">
            {isLoadingTestimonials && <div className="text-sm text-muted-foreground">Carregando...</div>}
            {!isLoadingTestimonials && testimonials.filter((t) => String(t.status) === 'approved').length === 0 && (
              <div className="glass rounded-xl p-6 text-center text-sm text-muted-foreground">Sem depoimentos ainda.</div>
            )}
            {!isLoadingTestimonials &&
              testimonials
                .filter((t) => String(t.status) === 'approved')
                .map((t) => {
                  const photos = t.media?.filter((m) => m.mimeType.startsWith('image/')) ?? [];
                  const photoIdx = testimonialPhotoIndex[t.id] ?? 0;
                  return (
                    <div key={t.id} className="rounded-2xl border bg-card p-4">
                      {/* Header */}
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarImage src={t.author.avatar ? resolveServerUrl(t.author.avatar) : undefined} />
                          <AvatarFallback>{String(t.author.name || 'U')[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{t.author.name}</span>
                            {formatProfileIdentityLine(t.author) ? (
                              <span className="text-xs text-muted-foreground">{formatProfileIdentityLine(t.author)}</span>
                            ) : null}
                            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                              {format(new Date(t.createdAt), "d 'de' MMM", { locale: ptBR })}
                            </span>
                          </div>
                          {/* Text */}
                          <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap">{t.content}</p>
                        </div>
                      </div>
                      {/* Photos carousel */}
                      {photos.length > 0 && (
                        <div className="relative mt-3 overflow-hidden rounded-xl">
                          <img
                            src={resolveServerUrl(photos[photoIdx].url)}
                            className="w-full max-h-72 object-cover rounded-xl"
                          />
                          {photos.length > 1 && (
                            <>
                              <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                                {photoIdx + 1}/{photos.length}
                              </span>
                              <button
                                type="button"
                                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
                                onClick={() => setTestimonialPhotoIndex((p) => ({ ...p, [t.id]: (photoIdx - 1 + photos.length) % photos.length }))}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white"
                                onClick={() => setTestimonialPhotoIndex((p) => ({ ...p, [t.id]: (photoIdx + 1) % photos.length }))}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
          </div>
        </TabsContent>

        <TabsContent value="experiences">
          {isLoadingExperiences ? (
            <p className="text-sm text-muted-foreground">Carregando experiências...</p>
          ) : userExperiences.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <BookOpen className="w-10 h-10 opacity-40" />
              <p className="text-sm">Nenhuma experiência compartilhada ainda.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {userExperiences.map((exp) => (
                <div key={exp.id} className="rounded-xl border bg-card p-4 space-y-2">
                  <h3 className="font-bold text-base">{exp.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-6">{exp.description}</p>
                  <div className="flex items-center gap-4 pt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="w-4 h-4" /> {exp.likesCount}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> {exp.commentsCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={maximizedVideoIndex !== null}
        onOpenChange={(open) => {
          if (!open) closeMaximizedVideo();
        }}
      >
        <DialogContent className="h-[100dvh] w-screen max-w-none rounded-none border-0 bg-black p-0 sm:h-[96dvh] sm:max-w-[96vw] sm:rounded-xl sm:border sm:border-white/15">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-3 top-3 z-[70] h-10 w-10 rounded-full border border-white/20 bg-black/65 text-white hover:bg-black/80"
            aria-label="Fechar vídeo"
            onClick={closeMaximizedVideo}
          >
            <X className="h-4 w-4" />
          </Button>
          {userVideos.length > 1 ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute left-3 top-1/2 z-[70] h-10 w-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/65 text-white hover:bg-black/80"
                aria-label="Vídeo anterior"
                onClick={goToPrevMaximizedVideo}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute right-3 top-1/2 z-[70] h-10 w-10 -translate-y-1/2 rounded-full border border-white/20 bg-black/65 text-white hover:bg-black/80"
                aria-label="Próximo vídeo"
                onClick={goToNextMaximizedVideo}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          ) : null}
          {maximizedVideo ? (
            <div
              className="relative flex h-full w-full items-center justify-center bg-black"
              onTouchStart={handleMaximizedTouchStart}
              onTouchEnd={handleMaximizedTouchEnd}
            >
              <video
                src={maximizedVideo.url || ''}
                className="h-full w-full bg-black object-contain"
                controls
                autoPlay
                playsInline
                preload="metadata"
              />
              {userVideos.length > 1 && maximizedVideoIndex !== null ? (
                <div className="absolute top-4 left-1/2 z-[65] -translate-x-1/2 rounded-full border border-white/20 bg-black/55 px-3 py-1 text-xs text-white/90">
                  {maximizedVideoIndex + 1}/{userVideos.length}
                </div>
              ) : null}
              {maximizedVideo.content ? (
                <div className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl border border-white/15 bg-black/55 p-2.5 backdrop-blur-sm">
                  <p className="line-clamp-3 text-sm text-white/90">{maximizedVideo.content}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </div>
  );
}
