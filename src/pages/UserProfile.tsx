import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lock, MapPin, Image as ImageIcon, Plus, Star } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { usersService, privatePhotosService, chatService, testimonialsService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { calculateAge } from '@/utils/age';
import { useAuth } from '@/contexts/AuthContext';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserAvatar } from '@/components/UserAvatar';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sparkles } from 'lucide-react';
import { resolveServerUrl } from '@/utils/serverUrl';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean; createdAt?: string };
type Testimonial = { id: string; content: string; status: string; createdAt: string; author: { id: string; name: string; avatar?: string | null } };

const SERVER_ORIGIN = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:4001';
function resolveMediaUrl(url: string) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${SERVER_ORIGIN}${url}`;
  return `${SERVER_ORIGIN}/${url}`;
}

function PhotoItem({ url }: { url: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="relative aspect-square rounded-xl overflow-hidden cursor-zoom-in">
          <img
            src={resolveMediaUrl(url)}
            alt=""
            className="w-full h-full object-cover transition-transform hover:scale-105"
          />
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border-none shadow-none flex items-center justify-center">
        <img
          src={resolveMediaUrl(url)}
          alt=""
          className="w-full h-auto max-h-[90vh] object-contain"
        />
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

  const isSelf = !!me?.id && !!userId && me.id === userId;

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
    Promise.all([usersService.getUser(userId), usersService.getUserPhotos(userId, 'public'), usersService.getPrivatePhotosAccess(userId)])
      .then(([u, photos, acc]) => {
        if (cancelled) return;
        setProfile(u);
        setPublicPhotos(Array.isArray(photos) ? photos : []);
        setAccess(acc || { status: 'none' });
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setPublicPhotos([]);
        setAccess({ status: 'none' });
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
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

  const age = useMemo(() => calculateAge(profile?.birthDate) ?? null, [profile?.birthDate]);
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

          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <h1 className="text-3xl font-bold">
                {profile?.name}
                {age !== null ? `, ${age}` : ''}
              </h1>
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
                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                <span>{profile?.sexualOrientation || '—'}</span>
              </div>
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
            
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <Button
                className="bg-gradient-primary hover:opacity-90"
                onClick={() => void startChat()}
                disabled={isStartingChat || String(profile?.allowMessages || 'everyone') === 'nobody'}
              >
                {String(profile?.allowMessages || 'everyone') === 'nobody' ? 'Mensagens desativadas' : isStartingChat ? 'Abrindo...' : 'Mandar mensagem'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="w-full mb-4">
          <TabsTrigger value="public" className="flex-1 gap-2">
            <ImageIcon className="w-4 h-4" />
            Públicas
          </TabsTrigger>
          <TabsTrigger value="private" className="flex-1 gap-2">
            <Lock className="w-4 h-4" />
            Privadas
          </TabsTrigger>
          <TabsTrigger value="testimonials" className="flex-1 gap-2">
            <Star className="w-4 h-4" />
            Depoimentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public">
          <div className="grid grid-cols-3 gap-3">
            {publicPhotos.map((photo) => (
              <PhotoItem key={photo.id} url={photo.url} />
            ))}
            {publicPhotos.length === 0 && <div className="col-span-3 text-sm text-muted-foreground">Sem fotos públicas.</div>}
          </div>
        </TabsContent>

        <TabsContent value="private">
          {access?.status === 'approved' ? (
            <div className="grid grid-cols-3 gap-3">
              {isLoadingPrivate && <div className="col-span-3 text-sm text-muted-foreground">Carregando...</div>}
              {!isLoadingPrivate &&
                privatePhotos.map((photo) => (
                  <PhotoItem key={photo.id} url={photo.url} />
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
                      <div className="font-medium">{t.author.name}</div>
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
