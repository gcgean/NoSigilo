import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Edit2, MapPin, Heart, Eye, Settings, Plus, Image, Lock, Sparkles, Trash2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { hasPremiumAccess } from '@/utils/premium';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';
import { feedService, notificationsService, privatePhotosService, profileService, testimonialsService, usersService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { useSocket } from '@/contexts/SocketContext';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean; createdAt?: string };
type NotificationItem = { id: string; type: string; title: string; description?: string | null; isRead: boolean; createdAt: string; data?: any };
type Testimonial = { id: string; content: string; status: string; createdAt: string; author: { id: string; name: string; avatar?: string | null } };
type PrivatePhotoAccessItem = {
  id: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt?: string;
  updatedAt?: string;
  requester: { id: string; name: string; avatar?: string | null; city?: string | null; state?: string | null };
};

function resolveMediaUrl(url: string) {
  if (!url) return url;
  return resolveServerUrl(url);
}

function PhotoItem({
  photo,
  onSetMain,
  onDelete,
}: {
  photo: Photo;
  onSetMain: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="relative aspect-square rounded-xl overflow-hidden group">
      <Dialog>
        <DialogTrigger asChild>
          <img
            src={resolveMediaUrl(photo.url)}
            alt=""
            className="w-full h-full object-cover cursor-zoom-in"
          />
        </DialogTrigger>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none shadow-none flex items-center justify-center">
          <img
            src={resolveMediaUrl(photo.url)}
            alt=""
            className="w-full h-auto max-h-[90vh] object-contain"
          />
        </DialogContent>
      </Dialog>
      {photo.isMain && <Badge className="absolute top-2 left-2 bg-gradient-primary">Principal</Badge>}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-white"
          onClick={() => void onSetMain(photo.id)}
        >
          <Edit2 className="w-4 h-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-white"
          onClick={() => void onDelete(photo.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState('photos');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState({ likes: 0, visits: 0, matches: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [busyNotifId, setBusyNotifId] = useState<string | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [busyTestimonialId, setBusyTestimonialId] = useState<string | null>(null);
  const [privatePhotoRequests, setPrivatePhotoRequests] = useState<PrivatePhotoAccessItem[]>([]);
  const [isLoadingPrivatePhotoRequests, setIsLoadingPrivatePhotoRequests] = useState(false);
  const [busyPrivatePhotoRequestId, setBusyPrivatePhotoRequestId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);

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
    const age = calculateAge(user?.birthDate) ?? 28;
    const city = [user?.city, user?.state].filter(Boolean).join(', ') || '—';

    return {
      name: user?.name || 'Usuário',
      age,
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

  const loadPhotos = async () => {
    setIsLoadingPhotos(true);
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
            }))
          : []
      );
    } catch {
      setPhotos([]);
    } finally {
      setIsLoadingPhotos(false);
    }
  };

  useEffect(() => {
    void loadPhotos();
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
      toast({ title: 'Foto enviada', description: 'Sua foto foi enviada com sucesso.' });
      await loadPhotos();
    } catch (e: any) {
      toast({ title: 'Falha ao enviar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
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
        const resp = await profileService.setMainPhoto(String(uploaded.id));
        const nextAvatar = uploaded?.url ? resolveMediaUrl(String(uploaded.url)) : resp?.avatar ? resolveMediaUrl(String(resp.avatar)) : '';
        if (nextAvatar) updateUser({ avatar: nextAvatar });
      }
      toast({ title: 'Foto de perfil atualizada' });
      await loadPhotos();
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
    <div className="max-w-2xl mx-auto w-full">
      {/* Profile Header */}
      <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6">
          {/* Avatar */}
          <div className="relative">
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
              <h1 className="text-xl sm:text-2xl font-bold break-words">{profileData.name}, {profileData.age}</h1>
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
            </div>
            
            <div className="flex items-center justify-center sm:justify-start gap-1 text-muted-foreground mb-3">
              <MapPin className="w-4 h-4" />
              <span className="break-words">{profileData.city}</span>
            </div>

            <p className="text-muted-foreground text-sm mb-4">{profileData.bio}</p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center sm:justify-start gap-3">
              <NavLink to="/settings">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Edit2 className="w-4 h-4" />
                  Editar Perfil
                </Button>
              </NavLink>
              <NavLink to="/settings">
                <Button variant="ghost" size="sm" className="w-full gap-2">
                  <Settings className="w-4 h-4" />
                  Configurações
                </Button>
              </NavLink>
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
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Sparkles className="w-4 h-4" />
              <span className="text-xl sm:text-2xl font-bold">{profileData.stats.matches}</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">Matches</p>
          </div>
        </div>
      </div>

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

      {notifications.some((n) => !n.isRead) ? (
        <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold">Notificações</h2>
            <NavLink to="/notifications" className="text-sm text-primary hover:underline">
              Ver todas
            </NavLink>
          </div>
          <div className="space-y-3">
            {notifications
              .filter((n) => !n.isRead)
              .slice(0, 5)
              .map((n) => {
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
                  <div className="font-medium mb-2">{t.author.name}</div>
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
          <InfoRow label="Gênero" value={user?.gender} />
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
              />
            ))}
            
            {/* Add Photo Button */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-8 h-8" />
              <span className="text-sm">{isUploading ? 'Enviando...' : 'Adicionar'}</span>
            </button>
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
                                  <div className="font-medium">{item.requester.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {[item.requester.city, item.requester.state].filter(Boolean).join(', ') || 'Local não informado'}
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
                                  <div className="font-medium">{item.requester.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {[item.requester.city, item.requester.state].filter(Boolean).join(', ') || 'Local não informado'}
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

          <div className="grid grid-cols-3 gap-3">
            {isLoadingPhotos && (
              <div className="col-span-3 text-sm text-muted-foreground">Carregando...</div>
            )}
            {!isLoadingPhotos && photos.filter((p) => p.isPrivate).map((photo) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                onSetMain={handleSetMain}
                onDelete={handleDelete}
              />
            ))}

            <button
              type="button"
              disabled={isUploading}
              onClick={() => privateFileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-8 h-8" />
              <span className="text-sm">{isUploading ? 'Enviando...' : 'Adicionar privada'}</span>
            </button>
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
      {!profileData.premium && (
        <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-gold/20 to-primary/20 border border-gold/30">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gold flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-black" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Seja Premium</h3>
              <p className="text-sm text-muted-foreground">
                Desbloqueie recursos exclusivos e destaque seu perfil
              </p>
            </div>
            <Button className="bg-gold text-black hover:bg-gold/90">
              Ver Planos
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value?.trim() ? value : '—'}</span>
    </div>
  );
}
