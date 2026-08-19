import React, { useEffect, useMemo, useRef, useState } from 'react';
import { INTENTION_OPTIONS } from '@/pages/Search';
import { Camera, Edit2, MapPin, Heart, Eye, Settings, Plus, Image, Lock, Sparkles, Trash2, Crown, X, Maximize2, Users, CheckCircle2, Circle, MoreVertical, Link2, ExternalLink, Video, Loader2, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { buildProfileAgeLabel } from '@/utils/profileAgeLabel';
import { REACTION_EMOJI } from '@/lib/reactions';
import { hasPremiumAccess } from '@/utils/premium';
import ReferralPaywallModal from '@/components/ReferralPaywallModal';
import SupportChatDialog from '@/components/SupportChatDialog';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import { feedService, notificationsService, privatePhotosService, profileService, testimonialsService, usersService, interactionsService, locationService, supportService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';
import { formatProfileIdentityLine } from '@/utils/profileIdentity';
import { getUserProfileHref } from '@/utils/userProfileNavigation';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean; createdAt?: string; broken?: boolean };
type NotificationItem = { id: string; type: string; title: string; description?: string | null; isRead: boolean; createdAt: string; data?: any };
type ProfileVisitItem = { id: string; createdAt: string; visitsCount?: number; visitor: { id: string; name: string; avatar?: string | null } };
type Testimonial = { id: string; content: string; status: string; createdAt: string; author: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null } };
type PrivatePhotoAccessItem = {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt?: string;
  updatedAt?: string;
  requester: { id: string; name: string; avatar?: string | null; gender?: string | null; city?: string | null; state?: string | null };
};
const PROFILE_NOTIFICATIONS_PAGE_SIZE = 3;

const COMPLETENESS_FIELDS: Array<{ key: string; label: string; getValue: (u: { name?: string; avatar?: string; bio?: string | null; city?: string | null; birthDate?: string | null; gender?: string | null; maritalStatus?: string | null; lookingFor?: string[] | null }) => string | null | undefined }> = [
  { key: 'name',          label: 'Nome',               getValue: (u) => u.name },
  { key: 'avatar',        label: 'Foto de perfil',      getValue: (u) => u.avatar },
  { key: 'bio',           label: 'Sobre mim',           getValue: (u) => u.bio },
  { key: 'city',          label: 'Cidade',              getValue: (u) => u.city },
  { key: 'birthDate',     label: 'Data de nascimento',  getValue: (u) => u.birthDate },
  { key: 'gender',        label: 'Gênero',              getValue: (u) => u.gender },
  { key: 'maritalStatus', label: 'Estado civil',        getValue: (u) => u.maritalStatus },
  { key: 'lookingFor',    label: 'O que procuro',       getValue: (u) => u.lookingFor?.length ? u.lookingFor[0] : null },
];

function resolveMediaUrl(url: string) {
  if (!url) return url;
  return resolveServerUrl(url);
}

function visitTimeAgo(iso: string) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return 'Agora há pouco';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (diffMinutes < 1) return 'Agora há pouco';
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Há ${diffDays} d`;
}

/** Faz fetch de imagens privadas com o Bearer token e retorna um blob URL */
function usePrivateImageUrl(url: string, isPrivate: boolean): string {
  const [blobUrl, setBlobUrl] = React.useState('');
  const blobRef = React.useRef('');

  React.useEffect(() => {
    if (!isPrivate || !url) { setBlobUrl(''); return; }
    let cancelled = false;
    const controller = new AbortController();
    const token = localStorage.getItem('token');
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
      .then((blob) => {
        if (cancelled) return;
        if (blobRef.current) URL.revokeObjectURL(blobRef.current);
        const objUrl = URL.createObjectURL(blob);
        blobRef.current = objUrl;
        setBlobUrl(objUrl);
      })
      .catch(() => { if (!cancelled) setBlobUrl(''); });
    return () => { cancelled = true; controller.abort(); };
  }, [url, isPrivate]);

  React.useEffect(() => () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); }, []);

  return blobUrl;
}

function PhotoItem({
  photo,
  onSetMain,
  onDelete,
  onToggleVisibility,
  isTogglingVisibility,
  onRefreshPrivatePhotos,
}: {
  photo: Photo;
  onSetMain: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string, currentIsPrivate: boolean) => void;
  isTogglingVisibility: boolean;
  onRefreshPrivatePhotos?: () => Promise<void>;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);
  const [likes, setLikes] = React.useState<Array<{ id: string; reaction?: string | null; user: { id: string; name: string; avatar?: string | null } }>>([]);
  const [isLoadingLikes, setIsLoadingLikes] = React.useState(false);
  const [showLikes, setShowLikes] = React.useState(false);
  const privateRefreshAttemptedRef = React.useRef(false);

  const resolvedUrl = resolveMediaUrl(photo.url);
  // Don't attempt to fetch if the backend already confirmed the file is missing
  const privateImgUrl = usePrivateImageUrl(resolvedUrl, photo.isPrivate && !photo.broken);
  const imgSrc = photo.isPrivate ? privateImgUrl : resolvedUrl;

  const loadLikes = async () => {
    if (photo.isPrivate) return;
    setIsLoadingLikes(true);
    try {
      const data = await interactionsService.getLikes('photo', photo.id);
      setLikes(Array.isArray(data) ? data : []);
    } catch {
      setLikes([]);
    } finally {
      setIsLoadingLikes(false);
    }
  };

  const handleOpen = (open: boolean) => {
    setIsPreviewOpen(open);
    if (open && photo.isPrivate) void onRefreshPrivatePhotos?.();
    if (open) void loadLikes();
    if (!open) setShowLikes(false);
  };

  React.useEffect(() => {
    privateRefreshAttemptedRef.current = false;
  }, [photo.url]);

  const handlePrivateImageError = () => {
    if (!photo.isPrivate) return;
    if (privateRefreshAttemptedRef.current) return;
    privateRefreshAttemptedRef.current = true;
    void onRefreshPrivatePhotos?.();
  };

  // Broken private photo — file missing on server disk
  if (photo.broken) {
    return (
      <div className="relative aspect-square rounded-xl overflow-hidden group bg-secondary/50 border border-destructive/20">
        <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center">
          <span className="text-2xl">🖼️</span>
          <p className="text-[10px] text-muted-foreground leading-tight">Arquivo não encontrado</p>
          <button
            type="button"
            onClick={() => onDelete(photo.id)}
            className="mt-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
          >
            Remover
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-square rounded-xl overflow-hidden group">
      <Dialog open={isPreviewOpen} onOpenChange={handleOpen}>
        <DialogTrigger asChild>
          <button type="button" className="h-full w-full">
            {photo.isPrivate && !privateImgUrl ? (
              /* Loading state while blob URL is being fetched */
              <div className="flex h-full w-full items-center justify-center bg-secondary/60 animate-pulse">
                <span className="text-2xl opacity-40">🔒</span>
              </div>
            ) : (
              <img
                src={imgSrc}
                alt=""
                className="h-full w-full cursor-zoom-in bg-secondary object-contain sm:object-cover"
                onError={handlePrivateImageError}
              />
            )}
          </button>
        </DialogTrigger>
        <DialogContent className="flex flex-col max-h-[96dvh] max-w-[96vw] border-white/10 bg-black/95 p-0 shadow-2xl overflow-hidden">
          <DialogClose asChild>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-3 top-3 z-[60] h-9 w-9 rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/85"
              aria-label="Fechar foto"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>

          {/* Photo */}
          <div className="flex flex-1 items-center justify-center p-3 pb-1">
            <img
              src={imgSrc}
              alt=""
              className="block max-h-[55dvh] w-auto max-w-full rounded-xl object-contain"
              onError={handlePrivateImageError}
            />
          </div>

          {/* Likes section */}
          {!photo.isPrivate && (
            <div className="px-3 py-2">
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
                onClick={() => setShowLikes((v) => !v)}
              >
                <Heart className="w-4 h-4 text-primary" />
                {isLoadingLikes ? (
                  <span>Carregando...</span>
                ) : (
                  <span>{likes.length > 0 ? `${likes.length} curtida${likes.length > 1 ? 's' : ''}` : 'Nenhuma curtida ainda'}</span>
                )}
                {likes.length > 0 && (
                  <span className="text-xs text-white/50">{showLikes ? '▲' : '▼'}</span>
                )}
              </button>

              {showLikes && likes.length > 0 && (
                <div className="mt-2 max-h-36 overflow-y-auto space-y-2 rounded-xl bg-white/5 p-2">
                  {likes.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-white/10 text-white">
                            {String(l.user.name || 'U')[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 text-[11px]">
                          {REACTION_EMOJI[l.reaction || 'heart'] ?? '💜'}
                        </span>
                      </div>
                      <span className="text-sm text-white/90 truncate">{l.user.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="px-3 pb-3 pt-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10 flex-1 justify-center text-xs"
                disabled={photo.isMain || photo.isPrivate}
                onClick={() => {
                  if (window.confirm('Definir esta foto como sua foto de perfil?')) {
                    void onSetMain(photo.id);
                    setIsPreviewOpen(false);
                  }
                }}
              >
                {photo.isMain ? 'Principal' : 'Definir principal'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10 flex-1 justify-center text-xs"
                disabled={isTogglingVisibility}
                onClick={() => { void onToggleVisibility(photo.id, photo.isPrivate); setIsPreviewOpen(false); }}
              >
                {photo.isPrivate ? 'Tornar pública' : 'Tornar privada'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-10 w-10 shrink-0"
                    aria-label="Mais opções"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => { if (window.confirm('Excluir esta foto? Esta ação não pode ser desfeita.')) { void onDelete(photo.id); setIsPreviewOpen(false); } }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir foto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {photo.isMain && <Badge className="absolute top-2 left-2 bg-gradient-primary pointer-events-none">Principal</Badge>}

      {/* Hover overlay — desktop only */}
      <div className="absolute inset-0 bg-black/50 transition-opacity opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 pointer-events-none sm:group-hover:pointer-events-auto">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-white pointer-events-auto"
          aria-label="Definir como foto de perfil"
          onClick={() => {
            if (window.confirm('Definir esta foto como sua foto de perfil?')) void onSetMain(photo.id);
          }}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="text-white pointer-events-auto" onClick={() => { if (window.confirm('Excluir esta foto? Esta ação não pode ser desfeita.')) void onDelete(photo.id); }}>
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="text-white pointer-events-auto" disabled={isTogglingVisibility} onClick={() => void onToggleVisibility(photo.id, photo.isPrivate)}>
          {photo.isPrivate ? <Image className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="text-white pointer-events-auto" onClick={() => setIsPreviewOpen(true)}>
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>

      {/* Mobile hint */}
      <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-black/55 px-2 py-1.5 text-[11px] text-white/90 sm:hidden pointer-events-none">
        {photo.isPrivate ? 'Foto privada • toque para ver opções' : 'Foto pública • toque para ver curtidas'}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState('photos');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [myVideos, setMyVideos] = useState<Array<{ id: string; postId: string; url: string }>>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState({ likes: 0, visits: 0, matches: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profileVisits, setProfileVisits] = useState<ProfileVisitItem[]>([]);
  const [notificationsVisibleCount, setNotificationsVisibleCount] = useState(PROFILE_NOTIFICATIONS_PAGE_SIZE);
  const [busyNotifId, setBusyNotifId] = useState<string | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [busyTestimonialId, setBusyTestimonialId] = useState<string | null>(null);
  const [privatePhotoRequests, setPrivatePhotoRequests] = useState<PrivatePhotoAccessItem[]>([]);
  const [isLoadingPrivatePhotoRequests, setIsLoadingPrivatePhotoRequests] = useState(false);
  const [busyPrivatePhotoRequestId, setBusyPrivatePhotoRequestId] = useState<string | null>(null);
  const [busyMediaVisibilityId, setBusyMediaVisibilityId] = useState<string | null>(null);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(user?.bio || '');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [isUpdatingGpsLocation, setIsUpdatingGpsLocation] = useState(false);
  const subscriptionsEnabled = user?.subscriptionsEnabled !== false;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // Publica um ou VÁRIOS vídeos de uma vez (cada vídeo vira um post).
  const handleAddVideoFromProfile = async (input: File | File[] | null) => {
    const files = (input == null ? [] : Array.isArray(input) ? input : [input]).filter((f) => f.type.startsWith('video/'));
    if (files.length === 0) { toast({ title: 'Selecione um vídeo', variant: 'destructive' }); return; }
    setIsUploading(true);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      try {
        const uploaded = await profileService.uploadMedia(file, { isPrivate: false, source: 'post' });
        if (uploaded?.id) {
          await feedService.createPost({ content: '', mediaIds: [String(uploaded.id)] });
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
    }
    setIsUploading(false);
    if (videoInputRef.current) videoInputRef.current.value = '';
    await loadMyVideos();
    if (ok > 0) {
      toast({ title: `${ok} vídeo${ok > 1 ? 's' : ''} publicado${ok > 1 ? 's' : ''}!`, description: fail > 0 ? `${fail} falharam.` : 'Aparecem aqui e no feed.' });
    } else {
      toast({ title: 'Erro ao publicar vídeo', variant: 'destructive' });
    }
  };
  // Track whether the first photo load has completed so subsequent reloads
  // (after upload / delete / toggle) happen silently — no blinking "Carregando..."
  const photosInitialLoadDone = useRef(false);
  const firstAccessPhotoMode = searchParams.get('firstAccess') === 'photo';

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    if (!id) return;
    window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [location.hash]);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSupportUnread = () => {
      supportService.getUnreadCount()
        .then((data) => { if (!cancelled) setSupportUnreadCount(data.count || 0); })
        .catch(() => {});
    };
    loadSupportUnread();
    const intervalId = window.setInterval(loadSupportUnread, 30000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, []);

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await profileService.getStats();
      if (data) setStats(data);
    } catch {
      // Keep defaults
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const profileData = useMemo(() => {
    const ageLabel = buildProfileAgeLabel(user);
    const city = [user?.city, user?.state].filter(Boolean).join(', ') || '—';

    return {
      name: user?.name || 'Usuário',
      ageLabel,
      city,
      status: user?.status || '',
      bio: user?.bio || '',
      stats,
      verified: user?.isVerified ?? true,
      premium: user?.isPremium ?? false,
    };
  }, [user, stats]);

  const mainPhotoUrl = useMemo(() => {
    const main = photos.find((p) => p.isMain);
    const any = photos[0];
    return resolveMediaUrl(main?.url || any?.url || user?.avatar || '');
  }, [photos, user?.avatar]);

  // Notificações de "visitou seu perfil" já aparecem no widget de visitantes
  // recentes (com o botão "Ver visitante") — exclui daqui para não duplicar.
  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead && n.type !== 'profile.visited'),
    [notifications]
  );

  const visibleUnreadNotifications = useMemo(
    () => unreadNotifications.slice(0, notificationsVisibleCount),
    [notificationsVisibleCount, unreadNotifications]
  );

  const unreadNotificationsRemaining = Math.max(0, unreadNotifications.length - visibleUnreadNotifications.length);

  const profileCompleteness = useMemo(() => {
    if (!user) return { percent: 0, filledCount: 0, total: COMPLETENESS_FIELDS.length, fields: [], meetsThreshold: false };
    const fields = COMPLETENESS_FIELDS.map((f) => {
      const val = f.getValue(user);
      return { key: f.key, label: f.label, filled: Boolean(val && String(val).trim() !== '') };
    });
    const filledCount = fields.filter((f) => f.filled).length;
    const percent = Math.round((filledCount / fields.length) * 100);
    return { percent, filledCount, total: fields.length, fields, meetsThreshold: filledCount >= 4 };
  }, [user]);

  useEffect(() => {
    if (unreadNotifications.length === 0) {
      setNotificationsVisibleCount(PROFILE_NOTIFICATIONS_PAGE_SIZE);
      return;
    }
    setNotificationsVisibleCount((prev) => Math.min(Math.max(prev, PROFILE_NOTIFICATIONS_PAGE_SIZE), unreadNotifications.length));
  }, [unreadNotifications.length]);

  const loadPhotos = async () => {
    // Only show the loading skeleton on the very first fetch.
    // Subsequent calls (after upload/delete/toggle) update silently so the
    // grid never blanks out and flickers (the "piscando" bug).
    if (!photosInitialLoadDone.current) {
      setIsLoadingPhotos(true);
    }
    try {
      const list = await feedService.getRecentPhotos();
      setPhotos(
        Array.isArray(list)
          ? list.map((p: any) => ({
              id: String(p.id),
              url: String(p.url || ''),
              isPrivate: !!p.isPrivate,
              isMain: !!p.isMain,
              createdAt: p.createdAt ? String(p.createdAt) : undefined,
              broken: !!p.broken,
            }))
          : []
      );
    } catch {
      setPhotos([]);
    } finally {
      setIsLoadingPhotos(false);
      photosInitialLoadDone.current = true;
    }
  };

  const loadMyVideos = async () => {
    if (!user?.id) return;
    setIsLoadingVideos(true);
    try {
      const data = await usersService.getUserPosts(String(user.id), { videosOnly: true, limit: 30 });
      const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
      const vids = posts.flatMap((post: any) =>
        (post.media || [])
          .filter((m: any) => String(m.mimeType || '').startsWith('video/') && m.url)
          .map((m: any) => ({ id: String(m.id), postId: String(post.id), url: resolveMediaUrl(String(m.url || '')) }))
      );
      setMyVideos(vids);
    } catch {
      setMyVideos([]);
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const handleDeleteVideo = async (mediaId: string) => {
    setDeletingVideoId(mediaId);
    try {
      await profileService.deleteMedia(mediaId);
      setMyVideos((prev) => prev.filter((v) => v.id !== mediaId));
      toast({ title: 'Vídeo removido' });
    } catch {
      toast({ title: 'Falha ao remover', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setDeletingVideoId(null);
    }
  };

  useEffect(() => {
    void loadPhotos();
    void loadMyVideos();
  }, []);

  const loadNotifications = async () => {
    try {
      const list = await notificationsService.getNotifications();
      setNotifications(Array.isArray(list) ? list : []);
    } catch {
      setNotifications([]);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const loadProfileVisits = async () => {
    try {
      const visits = await profileService.getVisits();
      setProfileVisits(Array.isArray(visits) ? visits : []);
    } catch {
      setProfileVisits([]);
    }
  };

  useEffect(() => {
    void loadProfileVisits();
  }, []);

  useEffect(() => {
    if (!isEditingBio) setBioDraft(user?.bio || '');
  }, [isEditingBio, user?.bio]);

  const loadTestimonials = async () => {
    if (!user?.id) return;
    try {
      const list = await usersService.getTestimonials(user.id, { status: 'all' });
      setTestimonials(Array.isArray(list) ? list : []);
    } catch {
      setTestimonials([]);
    }
  };

  useEffect(() => {
    void loadTestimonials();
  }, [user?.id]);

  const loadPrivatePhotoRequests = async () => {
    setIsLoadingPrivatePhotoRequests(true);
    try {
      const list = await privatePhotosService.getRequests({ status: 'all' });
      setPrivatePhotoRequests(Array.isArray(list) ? list : []);
    } catch {
      setPrivatePhotoRequests([]);
    } finally {
      setIsLoadingPrivatePhotoRequests(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'private') return;
    void loadPhotos();
    void loadPrivatePhotoRequests();
  }, [activeTab]);

  const approvedPrivatePhotoAccessCount = privatePhotoRequests.filter((item) => item.status === 'approved').length;
  const pendingPrivatePhotoAccessCount = privatePhotoRequests.filter((item) => item.status === 'pending').length;

  useEffect(() => {
    if (!socket) return;
    const handler = (n: any) => {
      setNotifications((prev) => {
        if (!n?.id) return prev;
        if (prev.some((x) => x.id === String(n.id))) return prev;
        return [{ ...n, id: String(n.id) } as any, ...prev].slice(0, 50);
      });
    };
    socket.on('notification.created', handler);
    return () => {
      socket.off('notification.created', handler);
    };
  }, [socket]);

  const handleUpload = async (file: File) => {
    try {
      setIsUploading(true);
      await profileService.uploadMedia(file, { isPrivate: false });
      toast({ title: 'Foto enviada', description: 'Sua foto foi adicionada à galeria.' });
      await loadPhotos();
    } catch (e: any) {
      toast({ title: 'Falha ao enviar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // Colar (Ctrl+V) foto/vídeo direto na página do perfil: foto vai pra galeria,
  // vídeo é publicado. Usa ref para sempre chamar os handlers mais recentes.
  const pasteHandlersRef = useRef({ handleUpload, handleAddVideoFromProfile });
  pasteHandlersRef.current = { handleUpload, handleAddVideoFromProfile };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []);
      const media = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      if (media.length === 0) return;
      e.preventDefault();
      const f = media[0];
      const ext = f.type.split('/')[1] || (f.type.startsWith('video/') ? 'mp4' : 'png');
      const named = f.name && f.name.includes('.') ? f : new File([f], `paste-${Date.now()}.${ext}`, { type: f.type });
      if (named.type.startsWith('video/')) void pasteHandlersRef.current.handleAddVideoFromProfile(named);
      else void pasteHandlersRef.current.handleUpload(named);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const handleCancelBioEdit = () => {
    setBioDraft(user?.bio || '');
    setIsEditingBio(false);
  };

  const handleSaveBio = async () => {
    const nextBio = bioDraft.trim();
    try {
      setIsSavingBio(true);
      await profileService.updateProfile({ bio: nextBio || null });
      updateUser({ bio: nextBio || '' });
      setIsEditingBio(false);
      toast({ title: 'Descrição atualizada' });
    } catch (e: any) {
      toast({ title: 'Falha ao salvar descrição', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleUpdateLocationFromGps = async () => {
    if (!navigator.geolocation) {
      toast({
        title: 'GPS indisponível',
        description: 'Seu aparelho ou navegador não disponibiliza localização.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingGpsLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const lat = Number(position.coords.latitude);
      const lng = Number(position.coords.longitude);

      await locationService.updateLocation(lat, lng);

      let nextCity = user?.city || '';
      let nextState = user?.state || '';
      try {
        const nearest = await locationService.getNearestCity(lat, lng);
        if (nearest?.name) nextCity = String(nearest.name);
        if (nearest?.state) nextState = String(nearest.state);
      } catch {}

      updateUser({
        city: nextCity || null,
        state: nextState || null,
      });

      toast({
        title: 'Localização atualizada',
        description: nextCity && nextState ? `${nextCity}, ${nextState}` : 'Seu GPS foi atualizado com sucesso.',
      });
    } catch (error: any) {
      const code = Number(error?.code || 0);
      const description =
        code === 1
          ? 'Você negou a permissão de localização do aparelho.'
          : code === 2
            ? 'Não foi possível identificar sua posição atual.'
            : code === 3
              ? 'O GPS demorou demais para responder. Tente novamente.'
              : 'Não foi possível atualizar sua localização agora.';
      toast({
        title: 'Falha ao atualizar localização',
        description,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingGpsLocation(false);
    }
  };

  const handleUploadPrivate = async (file: File) => {
    try {
      setIsUploading(true);
      await profileService.uploadMedia(file, { isPrivate: true });
      toast({ title: 'Foto privada enviada', description: 'Sua foto privada foi enviada com sucesso.' });
      await loadPhotos();
    } catch (e: any) {
      toast({ title: 'Falha ao enviar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadAsMain = async (file: File) => {
    try {
      setIsUploading(true);
      const uploaded = await profileService.uploadMedia(file, { isPrivate: false });
      if (uploaded?.id) {
        try {
          await feedService.createPost({ content: '', mediaIds: [String(uploaded.id)] });
        } catch {}
        const resp = await profileService.setMainPhoto(String(uploaded.id));
        const nextAvatar = uploaded?.url ? resolveMediaUrl(String(uploaded.url)) : resp?.avatar ? resolveMediaUrl(String(resp.avatar)) : '';
        if (nextAvatar) updateUser({ avatar: nextAvatar });
      }
      toast({ title: 'Foto de perfil atualizada' });
      await loadPhotos();
      if (firstAccessPhotoMode && user?.id) {
        const key = `nosigilo:first-access-flow:${user.id}`;
        try {
          const raw = localStorage.getItem(key);
          const flow = raw ? JSON.parse(raw) : {};
          localStorage.setItem(key, JSON.stringify({ ...flow, needsPhoto: false, needsPost: true }));
          window.dispatchEvent(new CustomEvent('nosigilo:first-access-flow-changed'));
        } catch {}
      }
    } catch (e: any) {
      toast({ title: 'Falha ao atualizar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSetMain = async (mediaId: string) => {
    try {
      const resp = await profileService.setMainPhoto(mediaId);
      if (resp?.avatar) updateUser({ avatar: resolveMediaUrl(String(resp.avatar)) });
      await loadPhotos();
      toast({ title: 'Foto principal atualizada' });
    } catch {
      toast({ title: 'Falha ao atualizar', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleDelete = async (mediaId: string) => {
    try {
      const wasMain = photos.some((p) => p.id === mediaId && p.isMain);
      await profileService.deleteMedia(mediaId);
      await loadPhotos();
      if (wasMain) updateUser({ avatar: undefined });
      toast({ title: 'Foto removida' });
    } catch {
      toast({ title: 'Falha ao remover', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleToggleMediaVisibility = async (mediaId: string, currentIsPrivate: boolean) => {
    setBusyMediaVisibilityId(mediaId);
    try {
      await profileService.updateMediaVisibility(mediaId, !currentIsPrivate);
      await loadPhotos();
      toast({
        title: !currentIsPrivate ? 'Foto movida para privadas' : 'Foto movida para públicas',
      });
    } catch (e: any) {
      const code = String(e?.response?.data?.error || '');
      if (code === 'cannot_make_main_photo_private') {
        toast({
          title: 'Não foi possível mover',
          description: 'A foto principal precisa ser pública. Troque a foto principal antes de mover para privadas.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Falha ao atualizar foto',
          description: e?.message || 'Tente novamente.',
          variant: 'destructive',
        });
      }
    } finally {
      setBusyMediaVisibilityId(null);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    try {
      await notificationsService.markAsRead(id);
    } catch {}
  };

  const handleApprovePrivatePhotos = async (n: NotificationItem) => {
    const requestId = n?.data?.requestId ? String(n.data.requestId) : '';
    if (!requestId) return;
    setBusyNotifId(n.id);
    try {
      await privatePhotosService.approveRequest(requestId);
      await markNotificationAsRead(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      toast({ title: 'Acesso permitido', description: 'Você autorizou o acesso às fotos privadas.' });
    } catch {
      toast({ title: 'Falha ao permitir', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyNotifId(null);
    }
    await loadPrivatePhotoRequests();
  };

  const handleDenyPrivatePhotos = async (n: NotificationItem) => {
    const requestId = n?.data?.requestId ? String(n.data.requestId) : '';
    if (!requestId) return;
    setBusyNotifId(n.id);
    try {
      await privatePhotosService.denyRequest(requestId);
      await markNotificationAsRead(n.id);
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      toast({ title: 'Acesso negado' });
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyNotifId(null);
    }
    await loadPrivatePhotoRequests();
  };

  const handleApprovePrivatePhotoRequest = async (requestId: string) => {
    setBusyPrivatePhotoRequestId(requestId);
    try {
      await privatePhotosService.approveRequest(requestId);
      toast({ title: 'Acesso permitido', description: 'O usuário agora pode ver suas fotos privadas.' });
      await loadPrivatePhotoRequests();
      await loadNotifications();
    } catch {
      toast({ title: 'Falha ao permitir', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyPrivatePhotoRequestId(null);
    }
  };

  const handleDenyPrivatePhotoRequest = async (requestId: string) => {
    setBusyPrivatePhotoRequestId(requestId);
    try {
      await privatePhotosService.denyRequest(requestId);
      toast({ title: 'Acesso negado' });
      await loadPrivatePhotoRequests();
      await loadNotifications();
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyPrivatePhotoRequestId(null);
    }
  };

  const handleRevokePrivatePhotoRequest = async (requestId: string) => {
    setBusyPrivatePhotoRequestId(requestId);
    try {
      await privatePhotosService.revokeRequest(requestId);
      toast({ title: 'Acesso revogado', description: 'O usuário não poderá mais ver suas fotos privadas.' });
      await loadPrivatePhotoRequests();
    } catch {
      toast({ title: 'Falha ao revogar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyPrivatePhotoRequestId(null);
    }
  };

  const respondTestimonial = async (t: Testimonial, accept: boolean) => {
    setBusyTestimonialId(t.id);
    try {
      await testimonialsService.respond(t.id, accept);
      setTestimonials((prev) => prev.filter((x) => x.id !== t.id));
      setNotifications((prev) =>
        prev.filter((n) => !(n.type === 'testimonial.pending' && String(n.data?.testimonialId || '') === String(t.id)))
      );
      toast({ title: accept ? 'Depoimento aprovado' : 'Depoimento recusado' });
    } catch {
      toast({ title: 'Falha ao atualizar depoimento', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyTestimonialId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full min-w-0 overflow-x-hidden">
      {/* Profile Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
        {firstAccessPhotoMode ? (
          <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-primary">Primeiro passo para entrar com força no NoSigilo</p>
                <p className="text-sm text-muted-foreground">
                  Escolha agora sua foto principal. Assim que ela subir, vamos te levar para fazer sua primeira publicação.
                </p>
              </div>
              <Button type="button" className="bg-gradient-primary hover:opacity-90" disabled={isUploading} onClick={() => avatarFileInputRef.current?.click()}>
                {isUploading ? 'Enviando...' : 'Enviar foto de perfil'}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
          {/* Avatar */}
          <div id="profile-photo" className="relative">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className={cn("w-32 h-32 rounded-full overflow-hidden ring-4 shadow-glow", profileData.premium ? "ring-gold/70" : "ring-primary/30")}
                >
                  <img src={mainPhotoUrl} alt={profileData.name} className="w-full h-full object-cover" />
                </button>
              </DialogTrigger>
              <DialogContent className="p-0 max-w-3xl bg-transparent border-0 shadow-none">
                <DialogClose asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-3 top-3 z-[60] h-9 w-9 rounded-full border border-white/20 bg-black/70 text-white hover:bg-black/85"
                    aria-label="Fechar foto"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </DialogClose>
                <div className="w-full aspect-square sm:aspect-[4/3] bg-black/60 rounded-lg overflow-hidden">
                  <img src={mainPhotoUrl} alt={profileData.name} className="w-full h-full object-contain" />
                </div>
              </DialogContent>
            </Dialog>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => avatarFileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center shadow-glow disabled:opacity-60"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              <h1 className="text-xl sm:text-2xl font-bold break-words">{profileData.name}</h1>
              {profileData.verified && (
                <Badge className="bg-success text-white gap-1">
                  <Sparkles className="w-3 h-3" /> Verificado
                </Badge>
              )}
              {profileData.premium && (
                <Badge className="bg-gold/15 text-gold border border-gold/30">
                  Premium
                </Badge>
              )}
              {user?.ambassadorBadges?.includes('ambassador_elite') && (
                <Badge className="bg-purple-500/15 text-purple-500 border border-purple-500/30 gap-1">
                  🏅 Embaixador(a) Elite
                </Badge>
              )}
              {!user?.ambassadorBadges?.includes('ambassador_elite') && user?.ambassadorBadges?.includes('ambassador_gold') && (
                <Badge className="bg-yellow-500/15 text-yellow-600 border border-yellow-500/30 gap-1">
                  🥇 Embaixador(a) Gold
                </Badge>
              )}
              {!user?.ambassadorBadges?.includes('ambassador_gold') && !user?.ambassadorBadges?.includes('ambassador_elite') && user?.ambassadorBadges?.includes('ambassador') && (
                <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 gap-1">
                  🤝 Embaixador(a)
                </Badge>
              )}
            </div>
            
            <div className="flex items-center justify-center sm:justify-start gap-1 text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              <span className="break-words">{profileData.city}</span>
            </div>

            {(user?.gender || profileData.ageLabel) && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground mb-3">
                {user?.gender ? <span>{user.gender}</span> : null}
                {user?.gender && profileData.ageLabel ? <span className="w-1 h-1 rounded-full bg-muted-foreground/30" /> : null}
                {profileData.ageLabel ? <span>{profileData.ageLabel}</span> : null}
              </div>
            )}

            {(profileData as any)?.bioLink ? (
              <a
                href={String((profileData as any).bioLink)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mb-4 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{String((profileData as any).bioLink).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </a>
            ) : null}

            <div className="mb-4 rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
                  Sua descrição do perfil
                </p>
                {!isEditingBio ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-primary/30 bg-background/80 text-primary hover:bg-primary/10"
                    onClick={() => setIsEditingBio(true)}
                  >
                    Editar
                  </Button>
                ) : null}
              </div>

              {isEditingBio ? (
                <div className="space-y-2">
                  <Textarea
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    maxLength={500}
                    rows={4}
                    className="min-h-[110px] border-primary/30 bg-background/85 text-[15px] leading-relaxed text-primary placeholder:text-primary/55"
                    placeholder="Conte um pouco sobre você..."
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-primary/75">{bioDraft.length}/500</span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-primary/30 text-primary hover:bg-primary/10"
                        onClick={handleCancelBioEdit}
                        disabled={isSavingBio}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-gradient-primary hover:opacity-90"
                        onClick={() => void handleSaveBio()}
                        disabled={isSavingBio}
                      >
                        {isSavingBio ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[15px] leading-relaxed text-primary whitespace-pre-line">
                  {profileData.bio || 'Adicione uma descrição para aparecer no seu perfil.'}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center sm:justify-start gap-3">
              <NavLink to="/settings">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Edit2 className="w-4 h-4" />
                  Editar Perfil
                </Button>
              </NavLink>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => void handleUpdateLocationFromGps()}
                disabled={isUpdatingGpsLocation}
              >
                <MapPin className="w-4 h-4" />
                {isUpdatingGpsLocation ? 'Atualizando GPS...' : 'Atualizar localização pelo GPS'}
              </Button>
              <NavLink to="/settings">
                <Button variant="ghost" size="sm" className="w-full gap-2">
                  <Settings className="w-4 h-4" />
                  Configurações
                </Button>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="relative w-full gap-2"
                onClick={() => { setSupportOpen(true); setSupportUnreadCount(0); }}
              >
                <LifeBuoy className="w-4 h-4" />
                Suporte
                {supportUnreadCount > 0 && (
                  <span className="absolute -top-1 right-2 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                    {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mt-6 pt-6 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Heart className="w-4 h-4" />
              <span className="text-xl sm:text-2xl font-bold">{profileData.stats.likes}</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Curtidas</p>
          </div>
          <div className="text-center">
            <Link to="/profile/visitors">
              <div className="flex items-center justify-center gap-1 text-primary mb-1 hover:opacity-80 transition-opacity relative">
                <Eye className="w-4 h-4" />
                <span className="text-xl sm:text-2xl font-bold">{profileData.stats.visits}</span>
                {!hasPremiumAccess(user) && (
                  <Crown className="w-3 h-3 text-gold absolute -top-1 -right-2" />
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground hover:underline">Visitas</p>
            </Link>
          </div>
          <div className="text-center">
            <Link to="/notifications">
              <div className="flex items-center justify-center gap-1 text-primary mb-1 hover:opacity-80 transition-opacity">
                <Sparkles className="w-4 h-4" />
                <span className="text-xl sm:text-2xl font-bold">{profileData.stats.matches}</span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground hover:underline">Matches</p>
            </Link>
          </div>
        </div>
      </div>

      {/* Objetivos e Fetiches */}
      {(() => {
        const intentions: string[] = Array.isArray((user as any)?.intentions) ? (user as any).intentions : [];
        const fetiches: string[] = Array.isArray((user as any)?.fetiches) ? (user as any).fetiches : [];
        if (intentions.length === 0 && fetiches.length === 0) return null;
        return (
          <div className="space-y-3 mb-6">
            {intentions.length > 0 && (
              <div className="glass rounded-2xl px-4 py-3.5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Objetivos</p>
                <div className="flex flex-wrap gap-1.5">
                  {intentions.map((val) => {
                    const opt = INTENTION_OPTIONS.find((o) => o.value === val);
                    return (
                      <span key={val} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        {opt ? `${opt.emoji} ${opt.label}` : val}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {fetiches.length > 0 && (
              <div className="glass rounded-2xl px-4 py-3.5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Fetiches</p>
                <div className="flex flex-wrap gap-1.5">
                  {fetiches.map((f) => (
                    <span key={f} className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Profile Completeness Widget */}
      {profileCompleteness.percent < 100 ? (
        <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              Completude do Perfil
            </h2>
            <span className={cn('text-sm font-bold tabular-nums', profileCompleteness.meetsThreshold ? 'text-emerald-600' : 'text-amber-600')}>
              {profileCompleteness.percent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full rounded-full bg-secondary mb-1 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', profileCompleteness.meetsThreshold ? 'bg-emerald-500' : 'bg-amber-500')}
              style={{ width: `${profileCompleteness.percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            {profileCompleteness.meetsThreshold
              ? `Perfil apto para validar indicações (${profileCompleteness.filledCount} de ${profileCompleteness.total} campos preenchidos).`
              : `Preencha pelo menos 4 campos para validar suas indicações (${profileCompleteness.filledCount} de ${profileCompleteness.total} preenchidos).`}
          </p>

          {/* Field checklist */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
            {profileCompleteness.fields.map((f) => (
              <div key={f.key} className="flex items-center gap-2 text-sm min-w-0">
                {f.filled
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                <span className={cn('truncate', f.filled ? 'text-foreground' : 'text-muted-foreground')}>{f.label}</span>
              </div>
            ))}
          </div>

          <NavLink to="/settings">
            <Button size="sm" variant="outline" className="gap-2">
              <Edit2 className="w-4 h-4" />
              Completar perfil
            </Button>
          </NavLink>
        </div>
      ) : null}

      {user?.invitedBy ? (
        <div className="glass rounded-2xl p-4 sm:p-5 mb-6">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Padrinho na rede</p>
              <p className="text-sm text-muted-foreground">
                Seu acesso ao NoSigilo foi convidado por <span className="font-medium text-foreground">{user.invitedBy.name}</span>.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {unreadNotifications.length > 0 || profileVisits.length > 0 ? (
        <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold">Notificações</h2>
            <NavLink to="/notifications" className="text-sm text-primary hover:underline">
              Ver todas
            </NavLink>
          </div>
          {profileVisits.length > 0 ? (
            <div className="mb-4 space-y-3">
              <div className="rounded-2xl border border-primary/15 bg-gradient-to-r from-primary/8 via-rose-500/6 to-orange-400/8 p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Últimos visitantes</div>
                    <div className="text-sm text-muted-foreground">As 3 pessoas mais recentes que passaram pelo seu perfil.</div>
                  </div>
                  <Badge className="w-fit bg-primary/12 text-primary border border-primary/20">
                    {profileVisits.length} visitante{profileVisits.length > 1 ? 's' : ''}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {profileVisits.slice(0, 3).map((visit, index) => (
                    <div
                      key={visit.id}
                      className="rounded-2xl border border-white/60 bg-background/90 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
                              <AvatarImage src={visit.visitor?.avatar ? resolveServerUrl(visit.visitor.avatar) : undefined} />
                              <AvatarFallback>{String(visit.visitor?.name || 'U')[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="absolute -right-1 -top-1 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gradient-primary px-1 text-[10px] font-bold text-white shadow-glow">
                              {index + 1}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold">{visit.visitor?.name || 'Alguém'}</p>
                              <Badge variant="secondary" className="bg-secondary/80 text-[10px]">
                                {visitTimeAgo(visit.createdAt)}
                              </Badge>
                              {Number(visit.visitsCount || 1) > 1 ? (
                                <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                                  {Number(visit.visitsCount)} visitas
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Visitou seu perfil recentemente. Toque para ver o perfil e continuar a conversa.
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          className="self-stretch sm:self-auto bg-gradient-primary hover:opacity-90"
                          onClick={() => navigate(getUserProfileHref(visit.visitor.id, user?.id, '/profile'))}
                        >
                          Ver visitante
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button size="sm" variant="ghost" onClick={() => navigate('/profile/visitors')}>
                    Ver histórico completo
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <span className="text-xs text-muted-foreground">Atualizado com os visitantes mais recentes.</span>
              </div>
            </div>
          ) : null}
          <div className="space-y-3">
            {visibleUnreadNotifications.map((n) => {
                const isPrivateReq = n.type === 'private_photos.request';
                return (
                  <div key={n.id} className="rounded-xl border p-4 bg-secondary/10">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{n.title}</div>
                        {n.description ? <div className="text-sm text-muted-foreground">{n.description}</div> : null}
                      </div>
                      <Button size="sm" variant="ghost" className="self-stretch sm:self-auto" onClick={() => void markNotificationAsRead(n.id)}>
                        Marcar lida
                      </Button>
                    </div>
                    {isPrivateReq ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                        <Button size="sm" className="bg-gradient-primary hover:opacity-90" disabled={busyNotifId === n.id} onClick={() => void handleApprovePrivatePhotos(n)}>
                          Permitir
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyNotifId === n.id} onClick={() => void handleDenyPrivatePhotos(n)}>
                          Negar
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
          {(unreadNotificationsRemaining > 0 || notificationsVisibleCount > PROFILE_NOTIFICATIONS_PAGE_SIZE) ? (
            <div className="mt-3 flex items-center gap-2">
              {unreadNotificationsRemaining > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setNotificationsVisibleCount((prev) => prev + PROFILE_NOTIFICATIONS_PAGE_SIZE)}
                >
                  Ver mais ({unreadNotificationsRemaining})
                </Button>
              ) : null}
              {notificationsVisibleCount > PROFILE_NOTIFICATIONS_PAGE_SIZE ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNotificationsVisibleCount(PROFILE_NOTIFICATIONS_PAGE_SIZE)}
                >
                  Mostrar menos
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {testimonials.some((t) => String(t.status) === 'pending') ? (
        <div id="testimonials" className="glass rounded-2xl p-4 sm:p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Depoimentos pendentes</h2>
          <div className="space-y-3">
            {testimonials
              .filter((t) => String(t.status) === 'pending')
              .slice(0, 10)
              .map((t) => (
                <div key={t.id} className="rounded-xl border p-4 bg-secondary/10">
                  <button
                    type="button"
                    className="font-medium mb-1 hover:underline"
                    onClick={() => navigate(getUserProfileHref(t.author.id, user?.id, '/profile'))}
                  >
                    {t.author.name}
                  </button>
                  {formatProfileIdentityLine(t.author) ? (
                    <div className="text-xs text-muted-foreground mb-2">{formatProfileIdentityLine(t.author)}</div>
                  ) : null}
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{t.content}</div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3">
                    <Button size="sm" className="bg-gradient-primary hover:opacity-90" disabled={busyTestimonialId === t.id} onClick={() => void respondTestimonial(t, true)}>
                      Aceitar
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyTestimonialId === t.id} onClick={() => void respondTestimonial(t, false)}>
                      Recusar
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold">Informações Pessoais</h2>
          {profileData.status ? (
            <Badge variant="secondary" className="max-w-full sm:max-w-[60%] truncate">
              {profileData.status}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
              {/* Gênero e Idade já aparecem no topo do perfil — omitidos aqui para não duplicar */}
              <InfoRow label="Estado civil" value={user?.maritalStatus} />
          <InfoRow label="Orientação Sexual" value={user?.sexualOrientation} />
          <InfoRow label="Profissão" value={user?.profession} />
          <InfoRow label="Signo" value={user?.zodiacSign} />
          <InfoRow label="Etnia" value={user?.ethnicity} />
          <InfoRow label="Cabelos" value={user?.hair} />
          <InfoRow label="Olhos" value={user?.eyes} />
          <InfoRow label="Altura" value={user?.height} />
          <InfoRow label="Corpo" value={user?.bodyType} />
          <InfoRow label="Fuma" value={user?.smokes} />
          <InfoRow label="Bebe" value={user?.drinks} />
        </div>
      </div>

      {/* Photos Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="photos" className="flex-1 gap-2">
            <Image className="w-4 h-4" />
            Públicas
          </TabsTrigger>
          <TabsTrigger value="private" className="flex-1 gap-2">
            <Lock className="w-4 h-4" />
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">Privadas</span>
              {(approvedPrivatePhotoAccessCount > 0 || pendingPrivatePhotoAccessCount > 0) && (
                <span className="hidden sm:inline-flex items-center gap-1">
                  <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 px-2 py-0 text-[10px]">
                    {approvedPrivatePhotoAccessCount} com acesso
                  </Badge>
                  <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 border border-amber-500/30 px-2 py-0 text-[10px]">
                    {pendingPrivatePhotoAccessCount} pendentes
                  </Badge>
                </span>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="flex-1 gap-2">
            <Video className="w-4 h-4" />
            Vídeos{myVideos.length > 0 ? ` (${myVideos.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="photos">
          <div className="grid grid-cols-3 gap-3">
            {isLoadingPhotos && (
              <div className="col-span-3 text-sm text-muted-foreground">Carregando...</div>
            )}
            {!isLoadingPhotos && photos.filter((p) => !p.isPrivate).map((photo) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                onSetMain={handleSetMain}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleMediaVisibility}
                isTogglingVisibility={busyMediaVisibilityId === photo.id}
                onRefreshPrivatePhotos={loadPhotos}
              />
            ))}
            
            {/* Add Photo Button — hidden while initial load is in progress */}
            {!isLoadingPhotos && (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm">{isUploading ? 'Enviando...' : 'Adicionar'}</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              if (e.target) e.target.value = '';
            }}
          />
        </TabsContent>

        <TabsContent value="private">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {isLoadingPhotos && (
              <div className="col-span-3 text-sm text-muted-foreground">Carregando...</div>
            )}
            {!isLoadingPhotos && photos.filter((p) => p.isPrivate).map((photo) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                onSetMain={handleSetMain}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleMediaVisibility}
                isTogglingVisibility={busyMediaVisibilityId === photo.id}
                onRefreshPrivatePhotos={loadPhotos}
              />
            ))}
            {!isLoadingPhotos && (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => privateFileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm">{isUploading ? 'Enviando...' : 'Adicionar privada'}</span>
              </button>
            )}
          </div>
          <input
            ref={privateFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadPrivate(file);
              if (e.target) e.target.value = '';
            }}
          />

          <div className="mb-4 space-y-4">
            <div className="glass rounded-2xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-semibold">Controle de acesso</h3>
                  <p className="text-sm text-muted-foreground">Veja quem pediu acesso e quem já pode ver suas fotos privadas.</p>
                </div>
              </div>

              {isLoadingPrivatePhotoRequests ? (
                <div className="text-sm text-muted-foreground">Carregando acessos...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Solicitações pendentes</h4>
                    {privatePhotoRequests.filter((item) => item.status === 'pending').length === 0 ? (
                      <div className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</div>
                    ) : (
                      <div className="space-y-3">
                        {privatePhotoRequests
                          .filter((item) => item.status === 'pending')
                          .map((item) => (
                            <div key={item.id} className="rounded-xl border p-3 bg-secondary/10">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className="font-medium hover:underline"
                                    onClick={() => navigate(getUserProfileHref(item.requester.id, user?.id, '/profile'))}
                                  >
                                    {item.requester.name}
                                  </button>
                                  <div className="text-sm text-muted-foreground">
                                    {formatProfileIdentityLine(item.requester) || 'Local não informado'}
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button size="sm" className="bg-gradient-primary hover:opacity-90" disabled={busyPrivatePhotoRequestId === item.id} onClick={() => void handleApprovePrivatePhotoRequest(item.id)}>
                                    Permitir acesso
                                  </Button>
                                  <Button size="sm" variant="outline" disabled={busyPrivatePhotoRequestId === item.id} onClick={() => void handleDenyPrivatePhotoRequest(item.id)}>
                                    Negar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Usuários com acesso</h4>
                    {privatePhotoRequests.filter((item) => item.status === 'approved').length === 0 ? (
                      <div className="text-sm text-muted-foreground">Você ainda não concedeu acesso a ninguém.</div>
                    ) : (
                      <div className="space-y-3">
                        {privatePhotoRequests
                          .filter((item) => item.status === 'approved')
                          .map((item) => (
                            <div key={item.id} className="rounded-xl border p-3 bg-secondary/10">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className="font-medium hover:underline"
                                    onClick={() => navigate(getUserProfileHref(item.requester.id, user?.id, '/profile'))}
                                  >
                                    {item.requester.name}
                                  </button>
                                  <div className="text-sm text-muted-foreground">
                                    {formatProfileIdentityLine(item.requester) || 'Local não informado'}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Acesso ativo desde {new Date(String(item.updatedAt || item.createdAt || '')).toLocaleDateString('pt-BR')}
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <Button size="sm" variant="outline" disabled={busyPrivatePhotoRequestId === item.id} onClick={() => void handleApprovePrivatePhotoRequest(item.id)}>
                                    Manter acesso
                                  </Button>
                                  <Button size="sm" variant="destructive" disabled={busyPrivatePhotoRequestId === item.id} onClick={() => void handleRevokePrivatePhotoRequest(item.id)}>
                                    Revogar acesso
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

        </TabsContent>

        <TabsContent value="videos">
          {/* Botão de publicar vídeo direto do perfil */}
          <div className="mb-3 flex justify-end">
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => { void handleAddVideoFromProfile(Array.from(e.target.files ?? [])); }}
            />
            <Button
              size="sm"
              className="gap-2 bg-gradient-primary"
              disabled={isUploading}
              onClick={() => videoInputRef.current?.click()}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              {isUploading ? 'Publicando...' : 'Publicar vídeo(s)'}
            </Button>
          </div>
          {isLoadingVideos ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando vídeos...
            </div>
          ) : myVideos.length === 0 ? (
            <div className="glass rounded-xl p-8 text-center">
              <Video className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Você ainda não publicou vídeos. Toque em <strong>Publicar vídeo</strong> acima ou publique pelo feed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {myVideos.map((v) => (
                <div
                  key={v.id}
                  className="group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-xl bg-black"
                  onClick={() => setPlayingVideoId(playingVideoId === v.id ? null : v.id)}
                >
                  <video
                    src={v.url}
                    className="h-full w-full object-cover"
                    playsInline
                    muted
                    loop
                    preload="metadata"
                    ref={(el) => {
                      if (!el) return;
                      if (playingVideoId === v.id) {
                        void el.play().catch(() => {});
                      } else {
                        el.pause();
                        el.currentTime = 0;
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleDeleteVideo(v.id); }}
                    disabled={deletingVideoId === v.id}
                    aria-label="Remover vídeo"
                    className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-destructive disabled:opacity-50"
                  >
                    {deletingVideoId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadAsMain(file);
          if (e.target) e.target.value = '';
        }}
      />

      {/* Premium Upsell */}
      {!profileData.premium && subscriptionsEnabled && (
        <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-gold/20 to-primary/20 border border-gold/30">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gold flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold mb-1">Seja Premium</h3>
              <p className="text-sm text-muted-foreground">
                Desbloqueie recursos exclusivos e destaque seu perfil
              </p>
            </div>
            <Button className="w-full sm:w-auto bg-gold text-black hover:bg-gold/90" onClick={() => setPaywallOpen(true)}>
              Ver Planos
            </Button>
          </div>
        </div>
      )}

      <ReferralPaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
      <SupportChatDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2 min-w-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground min-w-0 text-right break-words">{value?.trim() ? value : '—'}</span>
    </div>
  );
}
