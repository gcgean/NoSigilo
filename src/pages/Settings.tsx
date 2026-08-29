import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, Lock, Bell, Eye, Shield, Globe, Moon, Sun, LogOut,
  ChevronRight, Camera, Mail, MapPin, Calendar, Trash2, UserPlus, EyeOff, MessageSquarePlus, MessageCircle, CheckCircle2, Clock, XCircle, Lightbulb, Send, Zap, Film, Loader2
} from 'lucide-react';
import { INTENTION_OPTIONS } from '@/pages/Search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { authService, feedService, profileService, suggestionsService, usersService } from '@/services/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CitySearch } from '@/components/CitySearch';
import MySubscriptionCard from '@/components/MySubscriptionCard';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getApiErrorInfo } from '@/utils/apiError';
import { ACCOUNT_DELETION_REASONS } from '@/utils/accountDeletionReasons';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushActivationState,
} from '@/utils/pushNotifications';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean };

function resolveMediaUrl(url: string) {
  if (!url) return url;
  return resolveServerUrl(url);
}

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [myVideos, setMyVideos] = useState<Array<{ id: string; postId: string; url: string }>>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingPushState, setIsLoadingPushState] = useState(true);
  const initialSubTab = (() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'interesses' || tab === 'pessoal' || tab === 'midia') return tab;
    return 'geral';
  })();
  const [profileSubTab, setProfileSubTab] = useState<'geral' | 'pessoal' | 'interesses' | 'midia'>(initialSubTab);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);

  const [profilePerson, setProfilePerson] = useState<1 | 2>(1);

  // ── Solicitação de mudança de nome (aprovação do admin) ──────────────────
  const [nameReqOpen, setNameReqOpen] = useState(false);
  const [nameReqValue, setNameReqValue] = useState('');
  const [nameReqBusy, setNameReqBusy] = useState(false);
  const [nameReqPending, setNameReqPending] = useState<string | null>(null);
  useEffect(() => {
    profileService.getNameChangeStatus()
      .then((d) => { if (d.request?.status === 'pending') setNameReqPending(d.request.requestedName); })
      .catch(() => {});
  }, []);
  const handleRequestNameChange = async () => {
    const name = nameReqValue.trim();
    if (!name) return;
    setNameReqBusy(true);
    try {
      await profileService.requestNameChange(name);
      setNameReqPending(name);
      setNameReqOpen(false);
      setNameReqValue('');
      toast({ title: 'Solicitação enviada', description: 'Seu novo nome será aplicado após a aprovação do suporte.' });
    } catch (e: any) {
      const err = e?.response?.data?.error;
      toast({
        title: err === 'name_in_use' ? 'Nome já em uso' : err === 'already_pending' ? 'Já existe uma solicitação' : err === 'name_blacklisted' ? 'Nome indisponível' : 'Erro ao solicitar',
        description: err === 'already_pending' ? 'Você já tem uma solicitação em análise.' : 'Escolha outro nome e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setNameReqBusy(false);
    }
  };

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    birthDate: user?.birthDate || '',
    partnerBirthDate: user?.partnerBirthDate || '',
    partnerName: user?.partnerName || '',
    partnerSexualOrientation: user?.partnerSexualOrientation || '',
    partnerEthnicity: user?.partnerEthnicity || '',
    partnerHair: user?.partnerHair || '',
    partnerEyes: user?.partnerEyes || '',
    partnerHeight: user?.partnerHeight || '',
    partnerBodyType: user?.partnerBodyType || '',
    gender: user?.gender || '',
    maritalStatus: user?.maritalStatus || '',
    sexualOrientation: user?.sexualOrientation || '',
    ethnicity: user?.ethnicity || '',
    hair: user?.hair || '',
    eyes: user?.eyes || '',
    height: user?.height || '',
    bodyType: user?.bodyType || '',
    smokes: user?.smokes || '',
    drinks: user?.drinks || '',
    profession: user?.profession || '',
    zodiacSign: user?.zodiacSign || '',
    status: user?.status || '',
    bio: user?.bio || '',
    bioLink: (user as any)?.bioLink || '',
    city: user?.city || '',
    state: user?.state || '',
    lookingFor: (user?.lookingFor || []) as string[],
    intentions: ((user as any)?.intentions || []) as string[],
    fetiches: ((user as any)?.fetiches || []) as string[],
    availabilityStatus: ((user as any)?.availabilityStatus || '') as '' | 'now' | 'week' | 'month' | 'online_only' | 'not_looking',
    meetingTagline: ((user as any)?.meetingTagline || '') as string,
  });

  const FETICHE_OPTIONS = [
    'Sexo anal', 'Dotado', 'Cuckold', 'Voyerismo', 'Orgia', 'Gang Bang',
    'Sexting', 'Podolatria', 'Inversão', 'Dogging', 'Dupla penetração',
    'Sexo virtual', 'Fisting', 'Dominação', 'Submissão', 'Bondage',
    'Sadismo', 'Masoquismo', 'BBW', 'Pregnofilia', 'Bukkake',
    'Beijo grego', 'Golden shower',
  ];

  const audienceOptions = useMemo(
    () => [
      { value: 'Mulher', label: 'Mulher solteira', hint: 'single feminino' },
      { value: 'Homem', label: 'Homem solteiro', hint: 'single masculino' },
      { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)', hint: 'casal hetero' },
      { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)', hint: 'casal masculino' },
      { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)', hint: 'casal feminino' },
      { value: 'Transexual', label: 'Pessoa trans', hint: 'perfil individual' },
      { value: 'Crossdresser (CD)', label: 'Crossdresser (CD)', hint: 'perfil individual' },
      { value: 'Travesti', label: 'Travesti', hint: 'perfil individual' },
    ],
    []
  );

  const isCoupleProfile = profile.gender.startsWith('Casal');

  const [privacy, setPrivacy] = useState({
    profilePublic: true,
    showOnline: true,
    showLastSeen: true,
    showDistance: true,
    allowMessages: (user?.allowMessages || 'everyone') as any,
    blockOutsidePrefs: !!((user as any)?.blockOutsidePrefs),
  });

  const [notifications, setNotifications] = useState({
    likes: true,
    matches: true,
    messages: true,
    visits: user?.notificationVisits !== false,
    email: user?.notificationEmail !== false,
    push: true,
  });

  const hasTelegram = !!(user as any)?.telegramChatId;
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);

  // ── Alterar Senha ──────────────────────────────────────────────────────────
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showPasswords, setShowPasswords] = useState({ current: false, newPass: false, confirm: false });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    const { current, newPass, confirm } = passwords;
    if (!current) { toast({ title: 'Informe a senha atual', variant: 'destructive' }); return; }
    if (!newPass || newPass.length < 6) { toast({ title: 'Nova senha muito curta', description: 'Use pelo menos 6 caracteres.', variant: 'destructive' }); return; }
    if (newPass !== confirm) { toast({ title: 'Senhas não coincidem', description: '"Nova senha" e "Confirmar nova senha" devem ser iguais.', variant: 'destructive' }); return; }
    setIsChangingPassword(true);
    try {
      await authService.changePassword({ currentPassword: current, newPassword: newPass });
      toast({ title: '✅ Senha alterada com sucesso!' });
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Verifique a senha atual e tente novamente.';
      toast({ title: 'Erro ao alterar senha', description: msg, variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  useEffect(() => {
    setNotifications((prev) => ({
      ...prev,
      visits: user?.notificationVisits !== false,
      email: user?.notificationEmail !== false,
    }));
  }, [user?.notificationVisits, user?.notificationEmail]);

  useEffect(() => {
    let cancelled = false;
    const loadPushState = async () => {
      try {
        const state = await getPushActivationState();
        if (cancelled) return;
        setNotifications((prev) => ({ ...prev, push: state.enabled }));
      } catch {
        if (cancelled) return;
        setNotifications((prev) => ({ ...prev, push: false }));
      } finally {
        if (!cancelled) setIsLoadingPushState(false);
      }
    };
    void loadPushState();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      const profilePayload = {
        name: profile.name.trim() || undefined,
        birthDate: profile.birthDate || undefined,
        partnerBirthDate: profile.partnerBirthDate || undefined,
        partnerName: profile.partnerName.trim() || undefined,
        partnerSexualOrientation: profile.partnerSexualOrientation || undefined,
        partnerEthnicity: profile.partnerEthnicity || undefined,
        partnerHair: profile.partnerHair || undefined,
        partnerEyes: profile.partnerEyes || undefined,
        partnerHeight: profile.partnerHeight || undefined,
        partnerBodyType: profile.partnerBodyType || undefined,
        gender: profile.gender || undefined,
        maritalStatus: profile.maritalStatus || undefined,
        sexualOrientation: profile.sexualOrientation || undefined,
        ethnicity: profile.ethnicity || undefined,
        hair: profile.hair || undefined,
        eyes: profile.eyes || undefined,
        height: profile.height || undefined,
        bodyType: profile.bodyType || undefined,
        smokes: profile.smokes || undefined,
        drinks: profile.drinks || undefined,
        profession: profile.profession.trim() || undefined,
        zodiacSign: profile.zodiacSign || undefined,
        status: profile.status.trim() || undefined,
        bio: profile.bio.trim() || undefined,
        bioLink: profile.bioLink.trim(),
        city: profile.city.trim() || undefined,
        state: profile.state.trim() || undefined,
        lookingFor: profile.lookingFor,
        intentions: profile.intentions,
        fetiches: profile.fetiches,
        availabilityStatus: profile.availabilityStatus || null,
        meetingTagline: profile.meetingTagline.trim() || null,
      };

      const privacyPayload = {
        allowMessages: privacy.allowMessages,
        blockOutsidePrefs: privacy.blockOutsidePrefs,
      };

      await profileService.updateProfile(profilePayload);
      try {
        await profileService.updateProfile(privacyPayload);
      } catch {
        // privacidade: ignora falha silenciosamente para não bloquear o save principal
      }

      updateUser({ ...profilePayload, ...privacyPayload } as any);
      toast({ title: '✅ Perfil salvo!', description: 'Suas informações foram atualizadas com sucesso.' });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (Array.isArray(err?.response?.data?.errors)
          ? err.response.data.errors.map((e: any) => e.message).join(', ')
          : null) ||
        err?.message ||
        'Verifique os campos e tente novamente.';
      console.error('[handleSaveProfile]', err?.response?.data ?? err);
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsLoading(true);
    try {
      await profileService.updateProfile({ notificationVisits: notifications.visits, notificationEmail: notifications.email });
      if (notifications.push) {
        await enablePushNotifications();
      } else {
        await disablePushNotifications();
      }
      const pushState = await getPushActivationState().catch(() => ({ enabled: false }));
      updateUser({ notificationVisits: notifications.visits, notificationEmail: notifications.email });
      setNotifications((prev) => ({ ...prev, push: !!pushState.enabled }));
      toast({
        title: 'Preferências de notificação atualizadas!',
        description: notifications.push
          ? 'Este aparelho agora pode receber avisos de novas mensagens e matches.'
          : 'Os avisos push foram desligados neste aparelho.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar notificações',
        description: error?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadPhotos = async () => {
    try {
      const list = await feedService.getRecentPhotos();
      setPhotos(
        Array.isArray(list)
          ? list.map((p: any) => ({
              id: String(p.id),
              url: String(p.url || ''),
              isPrivate: !!p.isPrivate,
              isMain: !!p.isMain,
            }))
          : []
      );
    } catch {
      setPhotos([]);
    }
  };

  const loadMyVideos = async () => {
    if (!user?.id) { setLoadingVideos(false); return; }
    setLoadingVideos(true);
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
      setLoadingVideos(false);
    }
  };

  const handleDeleteVideo = async (mediaId: string) => {
    setDeletingVideoId(mediaId);
    try {
      await profileService.deleteMedia(mediaId);
      setMyVideos((prev) => prev.filter((v) => v.id !== mediaId));
      toast({ title: 'Vídeo removido', description: 'O vídeo foi excluído do seu perfil.' });
    } catch {
      toast({ title: 'Erro ao remover', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setDeletingVideoId(null);
    }
  };

  useEffect(() => {
    void loadPhotos();
    void loadMyVideos();
  }, []);

  const handleChangeAvatar = async (file: File) => {
    try {
      setIsUploading(true);
      const uploaded = await profileService.uploadMedia(file, { isPrivate: false });
      const mediaId = uploaded?.id ? String(uploaded.id) : '';
      const url = uploaded?.url ? String(uploaded.url) : '';
      if (mediaId) {
        try {
          await feedService.createPost({ content: '', mediaIds: [mediaId] });
        } catch {}
      }
      if (mediaId) await profileService.setMainPhoto(mediaId);
      if (url) updateUser({ avatar: resolveMediaUrl(url) });
      toast({ title: 'Foto de perfil atualizada' });
      await loadPhotos();
    } catch (e: any) {
      toast({ title: 'Falha ao atualizar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadPrivate = async (file: File) => {
    try {
      setIsUploading(true);
      await profileService.uploadMedia(file, { isPrivate: true });
      toast({ title: 'Foto privada enviada' });
      await loadPhotos();
    } catch (e: any) {
      toast({ title: 'Falha ao enviar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleDeactivateProfile = async () => {
    setIsDeactivating(true);
    try {
      await profileService.deactivateProfile();
      toast({
        title: 'Perfil desativado',
        description: 'Seu perfil foi ocultado. Para reativar, basta fazer login novamente.',
      });
      logout();
    } catch {
      toast({ title: 'Erro ao desativar perfil', variant: 'destructive' });
    } finally {
      setIsDeactivating(false);
    }
  };

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteReasonCode, setDeleteReasonCode] = useState<string>('');
  const [deleteReasonText, setDeleteReasonText] = useState('');

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await profileService.deleteAccount({
        reasonCode: deleteReasonCode || undefined,
        reasonText: deleteReasonText.trim() || undefined,
      });
      toast({ title: 'Conta excluída', description: 'Sua conta foi removida.' });
      logout();
    } catch (error) {
      const info = getApiErrorInfo(error, { title: 'Erro ao excluir conta', description: 'Tente novamente.' });
      toast({ title: info.title, description: info.description, variant: 'destructive' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>

      {/* Assinatura em destaque, fora das abas — é o que os usuários mais
          procuram aqui (status e cancelamento), e some se ficar dentro de uma aba. */}
      <div className="mb-6">
        <MySubscriptionCard />
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-5">
          <TabsTrigger value="profile" className="flex-col gap-0.5 py-2 sm:flex-row sm:gap-2">
            <User className="w-4 h-4" />
            <span className="text-[10px] sm:hidden">Perfil</span>
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="flex-col gap-0.5 py-2 sm:flex-row sm:gap-2">
            <Eye className="w-4 h-4" />
            <span className="text-[10px] sm:hidden">Privac.</span>
            <span className="hidden sm:inline">Privacidade</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex-col gap-0.5 py-2 sm:flex-row sm:gap-2">
            <Bell className="w-4 h-4" />
            <span className="text-[10px] sm:hidden">Notif.</span>
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex-col gap-0.5 py-2 sm:flex-row sm:gap-2">
            <Shield className="w-4 h-4" />
            <span className="text-[10px] sm:hidden">Segur.</span>
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="flex-col gap-0.5 py-2 sm:flex-row sm:gap-2">
            <Lightbulb className="w-4 h-4" />
            <span className="text-[10px] sm:hidden">Dicas</span>
            <span className="hidden sm:inline">Sugestões</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">

          {/* ── Sub-navegação Geral / Pessoal / Interesses / Mídia ── */}
          <div className="flex rounded-xl overflow-hidden border border-border">
            {(['geral', 'pessoal', 'interesses', 'midia'] as const).map((tab) => {
              const labels = { geral: 'Geral', pessoal: 'Pessoal', interesses: 'Interesses', midia: 'Mídia' };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setProfileSubTab(tab)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    profileSubTab === tab
                      ? 'bg-primary text-white'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* ══════════════ GERAL ══════════════ */}
          {profileSubTab === 'geral' && (
            <div className="glass rounded-xl p-4 sm:p-6 space-y-5">

              {/* Foto */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Foto de Perfil</h3>
                <div className="flex items-center gap-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback>{user?.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      disabled={isUploading}
                      onClick={() => avatarFileInputRef.current?.click()}
                    >
                      <Camera className="w-4 h-4" />
                      {isUploading ? 'Enviando...' : 'Alterar Foto'}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">JPG, PNG ou GIF · máx 5 MB</p>
                  </div>
                </div>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleChangeAvatar(file);
                    if (e.target) e.target.value = '';
                  }}
                />
              </div>

              <div className="border-t" />

              {/* Quem pode enviar mensagem — destacado aqui na edição do perfil,
                  além de continuar disponível na aba Privacidade. */}
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-primary">Quem pode te enviar mensagem</h3>
                </div>
                <p className="text-xs text-muted-foreground">Controle quem consegue iniciar uma conversa com você.</p>
                <Select
                  value={privacy.allowMessages}
                  onValueChange={(v) => setPrivacy({ ...privacy, allowMessages: v })}
                >
                  <SelectTrigger className="bg-background" aria-label="Quem pode te enviar mensagem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Todos</SelectItem>
                    <SelectItem value="matches">Apenas Matches</SelectItem>
                    <SelectItem value="friends">Apenas Amigos</SelectItem>
                    <SelectItem value="nobody">Ninguém</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t" />

              {/* Identidade */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identidade</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={profile.name}
                        readOnly
                        className="pl-9 cursor-not-allowed opacity-80"
                      />
                    </div>
                    {nameReqPending ? (
                      <p className="text-xs text-amber-600">
                        Solicitação em análise: <strong>"{nameReqPending}"</strong> — aguardando aprovação do suporte.
                      </p>
                    ) : nameReqOpen ? (
                      <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
                        <p className="text-xs text-muted-foreground">Digite o novo nome desejado. Ele passará por aprovação do suporte.</p>
                        <Input
                          value={nameReqValue}
                          onChange={(e) => setNameReqValue(e.target.value)}
                          placeholder="Novo nome"
                          maxLength={60}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={nameReqBusy || !nameReqValue.trim()} onClick={() => void handleRequestNameChange()}>
                            {nameReqBusy ? 'Enviando...' : 'Enviar solicitação'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setNameReqOpen(false); setNameReqValue(''); }}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setNameReqOpen(true)}
                      >
                        Solicitar mudança de nome
                      </button>
                    )}
                    <p className="text-[11px] text-muted-foreground/70">O nome só pode ser alterado com aprovação do suporte.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        value={profile.email}
                        className="pl-9"
                        disabled
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de perfil</Label>
                    <Select
                      value={profile.gender}
                      onValueChange={(v) => setProfile({ ...profile, gender: v })}
                      disabled={!!user?.gender}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Como seu perfil será exibido" />
                      </SelectTrigger>
                      <SelectContent>
                        {audienceOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!!user?.gender && (
                      <p className="text-[11px] text-muted-foreground">
                        O tipo de perfil é definido no cadastro e não pode ser alterado depois.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Estado civil</Label>
                    <Select value={profile.maritalStatus} onValueChange={(v) => setProfile({ ...profile, maritalStatus: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                        <SelectItem value="Namorando">Namorando</SelectItem>
                        <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                        <SelectItem value="Separado(a)">Separado(a)</SelectItem>
                        <SelectItem value="Liberal">Liberal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t" />

              {/* Localização */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Localização</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <CitySearch
                      value={profile.city}
                      onChange={(val) => setProfile(prev => ({ ...prev, city: val }))}
                      onSelect={(city, state) => setProfile(prev => ({ ...prev, city, state }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado (UF)</Label>
                    <Select
                      value={profile.state || ''}
                      onValueChange={(val) => setProfile((prev) => ({ ...prev, state: val }))}
                    >
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t" />

              {/* Status + Bio */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Apresentação</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status <span className="text-xs text-muted-foreground font-normal">(frase curta exibida no card)</span></Label>
                    <Input
                      id="status"
                      value={profile.status}
                      onChange={(e) => setProfile({ ...profile, status: e.target.value })}
                      placeholder="Ex.: Casal discreto em busca de conexões..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Descrição <span className="text-xs text-muted-foreground font-normal">(aparece no perfil completo)</span></Label>
                    <Textarea
                      id="bio"
                      value={profile.bio}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      placeholder="Conte sobre vocês, o que buscam e o que oferecem..."
                      rows={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bioLink">Link da bio <span className="text-xs text-muted-foreground font-normal">(aparece como botão no seu perfil)</span></Label>
                    <Input
                      id="bioLink"
                      type="url"
                      inputMode="url"
                      value={profile.bioLink}
                      onChange={(e) => setProfile({ ...profile, bioLink: e.target.value })}
                      placeholder="instagram.com/seuperfil, onlyfans.com/..., seu site..."
                    />
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ══════════════ MÍDIA ══════════════ */}
          {profileSubTab === 'midia' && (
            <div className="glass rounded-xl p-4 sm:p-6 space-y-6">
              {/* Fotos públicas */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Fotos públicas</h3>
                <p className="text-xs text-muted-foreground mb-3">Aparecem no seu perfil para todos.</p>
                {photos.filter((p) => !p.isPrivate).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    <Camera className="mx-auto mb-2 h-6 w-6 opacity-60" />
                    Nenhuma foto pública ainda. Publique pelo feed para aparecerem aqui.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {photos.filter((p) => !p.isPrivate).map((p) => (
                      <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl">
                        <img src={resolveMediaUrl(p.url)} alt="" className="h-full w-full object-cover" />
                        {p.isMain && (
                          <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">Principal</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t" />

              {/* Fotos Privadas */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Fotos Privadas</h3>
                <p className="text-xs text-muted-foreground mb-3">Visíveis apenas para quem você autorizar.</p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {photos.filter((p) => p.isPrivate).slice(0, 5).map((p) => (
                    <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden">
                      <img src={resolveMediaUrl(p.url)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="aspect-square rounded-xl border-2 border-dashed border-primary/40 flex items-center justify-center hover:border-primary/70 hover:bg-primary/5 transition-colors disabled:opacity-50"
                    disabled={isUploading}
                    onClick={() => privateFileInputRef.current?.click()}
                  >
                    <Camera className="w-5 h-5 text-primary/60" />
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
              </div>

              <div className="border-t" />

              {/* Meus vídeos */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Meus vídeos</h3>
                <p className="text-xs text-muted-foreground mb-3">Vídeos que você publicou no seu perfil.</p>
                {loadingVideos ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando vídeos...
                  </div>
                ) : myVideos.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    <Film className="mx-auto mb-2 h-6 w-6 opacity-60" />
                    Você ainda não publicou vídeos. Publique pelo feed para aparecerem aqui.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {myVideos.map((v) => (
                      <div key={v.id} className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-black">
                        <video src={v.url} className="h-full w-full object-cover" preload="metadata" playsInline controls />
                        <button
                          type="button"
                          onClick={() => void handleDeleteVideo(v.id)}
                          disabled={deletingVideoId === v.id}
                          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-destructive disabled:opacity-50"
                          aria-label="Remover vídeo"
                        >
                          {deletingVideoId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════ PESSOAL ══════════════ */}
          {profileSubTab === 'pessoal' && (
            <div className="glass rounded-xl p-4 sm:p-6 space-y-5">

              {/* Toggle Pessoa 1 / Pessoa 2 (só para casais) */}
              {isCoupleProfile && (
                <div className="flex rounded-xl overflow-hidden border border-border">
                  {([1, 2] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProfilePerson(p)}
                      className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                        profilePerson === p
                          ? 'bg-primary text-white'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {p === 1
                        ? (profile.name || 'Pessoa 1')
                        : (profile.partnerName || 'Pessoa 2')}
                    </button>
                  ))}
                </div>
              )}

              {/* Nascimento */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nascimento</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(!isCoupleProfile || profilePerson === 1) && (
                    <div className="space-y-2">
                      <Label htmlFor="birthDate">{isCoupleProfile ? `Nascimento — ${profile.name || 'Pessoa 1'}` : 'Data de nascimento'}</Label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="birthDate"
                          type="date"
                          value={profile.birthDate}
                          onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  )}
                  {isCoupleProfile && profilePerson === 2 && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="partnerName">Nome</Label>
                        <Input
                          id="partnerName"
                          value={profile.partnerName}
                          onChange={(e) => setProfile({ ...profile, partnerName: e.target.value })}
                          placeholder="Nome da pessoa 2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="partnerBirthDate">Data de nascimento</Label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="partnerBirthDate"
                            type="date"
                            value={profile.partnerBirthDate}
                            onChange={(e) => setProfile({ ...profile, partnerBirthDate: e.target.value })}
                            className="pl-9"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="border-t" />

              {/* Características físicas — Pessoa 1 ou 2 */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Características físicas</h3>
                {(!isCoupleProfile || profilePerson === 1) ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Orientação Sexual</Label>
                      <Select value={profile.sexualOrientation} onValueChange={(v) => setProfile({ ...profile, sexualOrientation: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Heterossexual">Heterossexual</SelectItem>
                          <SelectItem value="Homossexual">Homossexual</SelectItem>
                          <SelectItem value="Bissexual">Bissexual</SelectItem>
                          <SelectItem value="Pansexual">Pansexual</SelectItem>
                          <SelectItem value="Assexual">Assexual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Etnia</Label>
                      <Select value={profile.ethnicity} onValueChange={(v) => setProfile({ ...profile, ethnicity: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Branco">Branco</SelectItem>
                          <SelectItem value="Pardo">Pardo</SelectItem>
                          <SelectItem value="Preto">Preto</SelectItem>
                          <SelectItem value="Indígena">Indígena</SelectItem>
                          <SelectItem value="Amarelo">Amarelo</SelectItem>
                          <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cabelos</Label>
                      <Select value={profile.hair} onValueChange={(v) => setProfile({ ...profile, hair: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Pretos (lisos)','Pretos (cacheados)','Castanhos (lisos)','Castanhos (cacheados)','Loiros','Ruivos','Grisalhos','Careca'].map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Olhos</Label>
                      <Select value={profile.eyes} onValueChange={(v) => setProfile({ ...profile, eyes: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Castanhos','Azuis','Verdes','Pretos','Mel'].map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Altura</Label>
                      <Input value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })} placeholder="Ex.: 1,78 m" />
                    </div>
                    <div className="space-y-2">
                      <Label>Corpo</Label>
                      <Select value={profile.bodyType} onValueChange={(v) => setProfile({ ...profile, bodyType: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Atlético(a)','Magro(a)','Normal','Acima do peso','Plus size'].map((b) => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  /* Pessoa 2 */
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Orientação Sexual</Label>
                      <Select value={profile.partnerSexualOrientation} onValueChange={(v) => setProfile({ ...profile, partnerSexualOrientation: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Heterossexual">Heterossexual</SelectItem>
                          <SelectItem value="Homossexual">Homossexual</SelectItem>
                          <SelectItem value="Bissexual">Bissexual</SelectItem>
                          <SelectItem value="Pansexual">Pansexual</SelectItem>
                          <SelectItem value="Assexual">Assexual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Etnia</Label>
                      <Select value={profile.partnerEthnicity} onValueChange={(v) => setProfile({ ...profile, partnerEthnicity: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Branco">Branco</SelectItem>
                          <SelectItem value="Pardo">Pardo</SelectItem>
                          <SelectItem value="Preto">Preto</SelectItem>
                          <SelectItem value="Indígena">Indígena</SelectItem>
                          <SelectItem value="Amarelo">Amarelo</SelectItem>
                          <SelectItem value="Prefiro não informar">Prefiro não informar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Cabelos</Label>
                      <Select value={profile.partnerHair} onValueChange={(v) => setProfile({ ...profile, partnerHair: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Pretos (lisos)','Pretos (cacheados)','Castanhos (lisos)','Castanhos (cacheados)','Loiros','Ruivos','Grisalhos','Careca'].map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Olhos</Label>
                      <Select value={profile.partnerEyes} onValueChange={(v) => setProfile({ ...profile, partnerEyes: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Castanhos','Azuis','Verdes','Pretos','Mel'].map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Altura</Label>
                      <Input value={profile.partnerHeight} onChange={(e) => setProfile({ ...profile, partnerHeight: e.target.value })} placeholder="Ex.: 1,65 m" />
                    </div>
                    <div className="space-y-2">
                      <Label>Corpo</Label>
                      <Select value={profile.partnerBodyType} onValueChange={(v) => setProfile({ ...profile, partnerBodyType: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {['Atlético(a)','Magro(a)','Normal','Acima do peso','Plus size'].map((b) => (
                            <SelectItem key={b} value={b}>{b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Estilo de vida — só na Pessoa 1 */}
              {(!isCoupleProfile || profilePerson === 1) && (
                <>
                  <div className="border-t" />
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Estilo de vida</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Profissão</Label>
                        <Input value={profile.profession} onChange={(e) => setProfile({ ...profile, profession: e.target.value })} placeholder="Ex.: Empresário(a), Estudante..." />
                      </div>
                      <div className="space-y-2">
                        <Label>Signo</Label>
                        <Select value={profile.zodiacSign} onValueChange={(v) => setProfile({ ...profile, zodiacSign: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {['Áries','Touro','Gêmeos','Câncer','Leão','Virgem','Libra','Escorpião','Sagitário','Capricórnio','Aquário','Peixes'].map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Fuma</Label>
                        <Select value={profile.smokes} onValueChange={(v) => setProfile({ ...profile, smokes: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Não">Não</SelectItem>
                            <SelectItem value="Socialmente">Socialmente</SelectItem>
                            <SelectItem value="Sim">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Bebe</Label>
                        <Select value={profile.drinks} onValueChange={(v) => setProfile({ ...profile, drinks: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Não">Não</SelectItem>
                            <SelectItem value="Socialmente">Socialmente</SelectItem>
                            <SelectItem value="Sim">Sim</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>
          )}

          {/* ══════════════ INTERESSES ══════════════ */}
          {profileSubTab === 'interesses' && (
            <div className="glass rounded-xl p-4 sm:p-6 space-y-6">

              {/* Perfis que busca */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Perfis que você quer encontrar</h3>
                  <span className="text-xs text-muted-foreground">{profile.lookingFor.length} selecionado(s)</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {audienceOptions.map((option) => {
                    const checked = profile.lookingFor.includes(option.value);
                    return (
                      <label key={option.value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = !!v;
                            setProfile((prev) => ({
                              ...prev,
                              lookingFor: next
                                ? Array.from(new Set([...prev.lookingFor, option.value]))
                                : prev.lookingFor.filter((x) => x !== option.value),
                            }));
                          }}
                        />
                        <div className="space-y-0.5">
                          <span className="text-sm font-medium">{option.label}</span>
                          <p className="text-xs text-muted-foreground">{option.hint}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border-t" />

              {/* Fetiches */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fetiches</h3>
                  <span className="text-xs text-muted-foreground">{profile.fetiches.length} selecionado(s)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FETICHE_OPTIONS.map((fetiche) => {
                    const checked = profile.fetiches.includes(fetiche);
                    return (
                      <label key={fetiche} className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = !!v;
                            setProfile((prev) => ({
                              ...prev,
                              fetiches: next
                                ? Array.from(new Set([...prev.fetiches, fetiche]))
                                : prev.fetiches.filter((x) => x !== fetiche),
                            }));
                          }}
                        />
                        <span className="text-sm">{fetiche}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border-t" />

              {/* O que buscam */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">O que vocês buscam</h3>
                  <span className="text-xs text-muted-foreground">{profile.intentions.length} selecionado(s)</span>
                </div>
                <p className="text-xs text-muted-foreground">Aparece como ícones nos cards e ativa filtros na busca.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INTENTION_OPTIONS.map((opt) => {
                    const checked = profile.intentions.includes(opt.value);
                    return (
                      <label key={opt.value} className={`flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            const next = !!v;
                            setProfile((prev) => ({
                              ...prev,
                              intentions: next
                                ? Array.from(new Set([...prev.intentions, opt.value]))
                                : prev.intentions.filter((x) => x !== opt.value),
                            }));
                          }}
                        />
                        <span className="text-sm">{opt.emoji} {opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border-t" />

              {/* Disponibilidade */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Disponibilidade para encontro</h3>
                </div>
                <p className="text-xs text-muted-foreground">Badge ⚡ nos cards da busca e no modo "Encontro Hoje". Expira automaticamente.</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {([
                    { value: '',            label: 'Não definida',        emoji: '—',  hint: 'Não aparece em filtros especiais' },
                    { value: 'now',         label: 'Disponível hoje',     emoji: '⚡', hint: 'Badge verde · expira em 24h' },
                    { value: 'week',        label: 'Esta semana',         emoji: '📅', hint: 'Badge laranja · expira em 7 dias' },
                    { value: 'month',       label: 'Este mês',            emoji: '🗓️', hint: 'Badge roxo · expira em 30 dias' },
                    { value: 'online_only', label: 'Só online',           emoji: '💬', hint: 'Disponível apenas online / sexting' },
                    { value: 'not_looking', label: 'Não estou buscando',  emoji: '🔒', hint: 'Sinaliza que não quer encontros agora' },
                  ] as const).map((opt) => (
                    <label key={opt.value} className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${profile.availabilityStatus === opt.value ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'}`}>
                      <input
                        type="radio"
                        name="availabilityStatus"
                        value={opt.value}
                        checked={profile.availabilityStatus === opt.value}
                        onChange={() => setProfile({ ...profile, availabilityStatus: opt.value })}
                        className="mt-0.5 accent-primary"
                      />
                      <div>
                        <p className="text-sm font-medium">{opt.emoji} {opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.hint}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {profile.availabilityStatus && profile.availabilityStatus !== 'not_looking' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="meetingTagline" className="text-xs font-medium">Seu convite (aparece nos cards da busca)</Label>
                    <Input
                      id="meetingTagline"
                      value={profile.meetingTagline}
                      onChange={(e) => setProfile({ ...profile, meetingTagline: e.target.value.slice(0, 100) })}
                      placeholder='Ex.: "Buscamos casal para soft swing em Fortaleza 😈"'
                      maxLength={100}
                    />
                    <p className="text-right text-xs text-muted-foreground">{profile.meetingTagline.length}/100</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Botão Salvar fixo (some na aba Mídia, que salva automaticamente) */}
          {profileSubTab !== 'midia' && (
            <div className="sticky bottom-16 z-30 -mx-1 mt-2 rounded-xl border border-border/60 bg-background/95 p-2 backdrop-blur md:bottom-4">
              <Button
                onClick={handleSaveProfile}
                className="w-full gap-2 bg-gradient-primary hover:opacity-90"
                disabled={isLoading}
              >
                {isLoading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          )}

        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <div className="glass rounded-xl p-4 sm:p-6 space-y-6">
            <h3 className="font-semibold">Visibilidade do Perfil</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Perfil Público</p>
                <p className="text-sm text-muted-foreground">Permitir que outros vejam seu perfil</p>
              </div>
              <Switch
                checked={privacy.profilePublic}
                onCheckedChange={(v) => setPrivacy({ ...privacy, profilePublic: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mostrar Status Online</p>
                <p className="text-sm text-muted-foreground">Outros podem ver quando você está online</p>
              </div>
              <Switch
                checked={privacy.showOnline}
                onCheckedChange={(v) => setPrivacy({ ...privacy, showOnline: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mostrar Última Visita</p>
                <p className="text-sm text-muted-foreground">Exibir quando esteve online por último</p>
              </div>
              <Switch
                checked={privacy.showLastSeen}
                onCheckedChange={(v) => setPrivacy({ ...privacy, showLastSeen: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mostrar Distância</p>
                <p className="text-sm text-muted-foreground">Exibir distância para outros usuários</p>
              </div>
              <Switch
                checked={privacy.showDistance}
                onCheckedChange={(v) => setPrivacy({ ...privacy, showDistance: v })}
              />
            </div>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold">Quem pode enviar mensagens</h3>
            <Select
              value={privacy.allowMessages}
              onValueChange={(v) => setPrivacy({ ...privacy, allowMessages: v })}
            >
              <SelectTrigger aria-label="Quem pode enviar mensagens">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Todos</SelectItem>
                <SelectItem value="matches">Apenas Matches</SelectItem>
                <SelectItem value="friends">Apenas Amigos</SelectItem>
                <SelectItem value="nobody">Ninguém</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-start justify-between gap-4 pt-2 border-t border-border/50">
              <div>
                <p className="font-medium">Bloquear fora do meu interesse</p>
                <p className="text-sm text-muted-foreground">
                  Somente perfis do tipo que você busca podem enviar mensagens.
                  Baseado em "Perfis que você quer encontrar".
                </p>
              </div>
              <Switch
                checked={privacy.blockOutsidePrefs}
                onCheckedChange={(v) => setPrivacy({ ...privacy, blockOutsidePrefs: v })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveProfile} disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar privacidade'}
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="glass rounded-xl p-4 sm:p-6 space-y-6">
            <h3 className="font-semibold">Notificações no App</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Curtidas</p>
                <p className="text-sm text-muted-foreground">Quando alguém curtir seu perfil</p>
              </div>
              <Switch
                checked={notifications.likes}
                onCheckedChange={(v) => setNotifications({ ...notifications, likes: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Matches</p>
                <p className="text-sm text-muted-foreground">Quando você der match com alguém</p>
              </div>
              <Switch
                checked={notifications.matches}
                onCheckedChange={(v) => setNotifications({ ...notifications, matches: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mensagens</p>
                <p className="text-sm text-muted-foreground">Quando receber novas mensagens</p>
              </div>
              <Switch
                checked={notifications.messages}
                onCheckedChange={(v) => setNotifications({ ...notifications, messages: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Visitas ao Perfil</p>
                <p className="text-sm text-muted-foreground">Quando alguém visitar seu perfil</p>
              </div>
              <Switch
                checked={notifications.visits}
                onCheckedChange={(v) => setNotifications({ ...notifications, visits: v })}
              />
            </div>
          </div>

          {/* Appearance */}
          <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold">Aparência</h3>
            <p className="text-sm text-muted-foreground">Escolha como o NoSigilo aparece para você.</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  theme === 'light'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Sun className="h-5 w-5 text-amber-500" />
                </div>
                <span className="text-sm font-medium">Claro</span>
                {theme === 'light' && (
                  <span className="text-[10px] font-semibold text-primary">Ativo</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  theme === 'dark'
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800">
                  <Moon className="h-5 w-5 text-slate-300" />
                </div>
                <span className="text-sm font-medium">Escuro</span>
                {theme === 'dark' && (
                  <span className="text-[10px] font-semibold text-primary">Ativo</span>
                )}
              </button>
            </div>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-6">
            <h3 className="font-semibold">Notificações Externas</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">E-mail</p>
                <p className="text-sm text-muted-foreground">Receber resumos por e-mail</p>
              </div>
              <Switch
                checked={notifications.email}
                onCheckedChange={(v) => setNotifications({ ...notifications, email: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push</p>
                <p className="text-sm text-muted-foreground">
                  Avisos no celular instalado como app para novas mensagens e matches
                </p>
              </div>
              <Switch
                checked={notifications.push}
                onCheckedChange={(v) => setNotifications({ ...notifications, push: v })}
                disabled={isLoadingPushState}
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#229ED9]/15 text-xl">
                    ✈️
                  </div>
                  <div>
                    <p className="font-medium">Telegram</p>
                    <p className="text-sm text-muted-foreground">
                      Receba notificações de radar e matches direto no seu Telegram
                    </p>
                    {hasTelegram && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                        ✓ Conectado
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {hasTelegram ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={telegramTesting}
                        onClick={async () => {
                          setTelegramTesting(true);
                          try {
                            await profileService.testTelegram();
                            toast({ title: '✅ Mensagem de teste enviada', description: 'Confira seu Telegram.' });
                          } catch (error) {
                            const info = getApiErrorInfo(error, { title: 'Erro ao enviar teste', description: 'Tente novamente.' });
                            toast({ title: info.title, description: info.description, variant: 'destructive' });
                          } finally {
                            setTelegramTesting(false);
                          }
                        }}
                      >
                        {telegramTesting ? 'Enviando...' : 'Testar'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={telegramLoading}
                        onClick={async () => {
                          setTelegramLoading(true);
                          try {
                            await profileService.disconnectTelegram();
                            updateUser({ ...(user as any), telegramChatId: null });
                            toast({ title: 'Telegram desconectado' });
                          } catch {
                            toast({ title: 'Erro ao desconectar', variant: 'destructive' });
                          } finally {
                            setTelegramLoading(false);
                          }
                        }}
                      >
                        Desconectar
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-[#229ED9] hover:bg-[#1a8bc4] text-white"
                      disabled={telegramLoading}
                      onClick={async () => {
                        setTelegramLoading(true);
                        try {
                          const { url } = await profileService.generateTelegramLink();
                          window.open(url, '_blank');
                          toast({ title: 'Abrindo Telegram...', description: 'Clique em Iniciar no bot para conectar sua conta.' });
                          // Detecta conexão quando o usuário volta para a aba
                          const onVisible = async () => {
                            if (document.hidden) return;
                            document.removeEventListener('visibilitychange', onVisible);
                            try {
                              const me = await authService.getMe();
                              if (me?.telegramChatId) {
                                updateUser({ telegramChatId: me.telegramChatId });
                                toast({ title: '✅ Telegram conectado!', description: 'Você receberá notificações de match e radar direto no Telegram.' });
                              }
                            } catch {}
                          };
                          document.addEventListener('visibilitychange', onVisible);
                          setTimeout(() => document.removeEventListener('visibilitychange', onVisible), 5 * 60 * 1000);
                        } catch {
                          toast({ title: 'Erro ao gerar link', variant: 'destructive' });
                        } finally {
                          setTelegramLoading(false);
                        }
                      }}
                    >
                      Conectar Telegram
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSaveNotifications}
              className="w-full sm:w-auto bg-gradient-primary hover:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? 'Salvando...' : 'Salvar preferências'}
            </Button>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold">Convites e padrinhos</h3>
                <p className="text-sm text-muted-foreground">
                  O acesso ao NoSigilo acontece por indicação. Gere links únicos e aprove apenas quem você realmente quer trazer para a rede.
                </p>
              </div>
              <NavLink to="/invites" className="w-full sm:w-auto">
                <Button type="button" className="w-full bg-gradient-primary hover:opacity-90 gap-2">
                  <UserPlus className="w-4 h-4" />
                  Abrir Gerar/Gerenciar convites
                </Button>
              </NavLink>
            </div>

            {user?.invitedBy ? (
              <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
                Você entrou por convite de <span className="font-semibold">{user.invitedBy.name}</span>.
              </div>
            ) : null}

            <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
              Use a tela exclusiva de convites para gerar links, aprovar novos cadastros, negar acessos e acompanhar quem entrou por sua indicação.
            </div>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold">Alterar Senha</h3>

            <div className="space-y-4">
              {/* Senha atual */}
              <div className="space-y-2">
                <Label>Senha Atual</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.current ? 'text' : 'password'}
                    placeholder="Sua senha atual"
                    value={passwords.current}
                    onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                    className="pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPasswords((s) => ({ ...s, current: !s.current }))}
                    aria-label={showPasswords.current ? 'Ocultar senha atual' : 'Mostrar senha atual'}>
                    {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Nova senha */}
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.newPass ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={passwords.newPass}
                    onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
                    className={`pr-10 ${passwords.newPass && passwords.newPass.length < 6 ? 'border-destructive' : ''}`}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPasswords((s) => ({ ...s, newPass: !s.newPass }))}
                    aria-label={showPasswords.newPass ? 'Ocultar nova senha' : 'Mostrar nova senha'}>
                    {showPasswords.newPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwords.newPass && passwords.newPass.length < 6 && (
                  <p className="text-xs text-destructive">Mínimo 6 caracteres</p>
                )}
              </div>

              {/* Confirmar nova senha */}
              <div className="space-y-2">
                <Label>Confirmar Nova Senha</Label>
                <div className="relative">
                  <Input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    placeholder="Repita a nova senha"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                    className={`pr-10 ${passwords.confirm && passwords.confirm !== passwords.newPass ? 'border-destructive' : passwords.confirm && passwords.confirm === passwords.newPass ? 'border-success' : ''}`}
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPasswords((s) => ({ ...s, confirm: !s.confirm }))}
                    aria-label={showPasswords.confirm ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}>
                    {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwords.confirm && passwords.confirm !== passwords.newPass && (
                  <p className="text-xs text-destructive">As senhas não coincidem</p>
                )}
                {passwords.confirm && passwords.confirm === passwords.newPass && passwords.newPass.length >= 6 && (
                  <p className="text-xs text-success">Senhas coincidem ✓</p>
                )}
              </div>

              <Button
                variant="outline"
                onClick={() => void handleChangePassword()}
                disabled={isChangingPassword || !passwords.current || !passwords.newPass || !passwords.confirm}
              >
                {isChangingPassword ? 'Alterando...' : 'Alterar Senha'}
              </Button>
            </div>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
            <h3 className="font-semibold">Sessões Ativas</h3>
            <p className="text-sm text-muted-foreground">
              Você está logado neste dispositivo. Clique abaixo para sair de todas as sessões.
            </p>
            <Button variant="outline" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sair de Todas as Sessões
            </Button>
          </div>

          <div className="glass rounded-xl p-4 sm:p-6 space-y-6 border border-destructive/20">
            <h3 className="font-semibold text-destructive">Zona de Perigo</h3>

            {/* Deactivate profile */}
            <div className="space-y-3 pb-5 border-b border-border/50">
              <div>
                <p className="font-medium">Desativar perfil</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seu perfil ficará oculto para outros usuários enquanto estiver desativado. Suas conversas, fotos e dados são preservados. Para reativar, basta fazer login novamente.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 border-orange-400/40 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                    disabled={isDeactivating}
                  >
                    <EyeOff className="w-4 h-4" />
                    {isDeactivating ? 'Desativando...' : 'Desativar Perfil'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desativar seu perfil?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">Enquanto desativado, seu perfil:</span>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>Não aparece nas buscas e no feed de outros usuários</li>
                        <li>Não recebe novas mensagens</li>
                        <li>Tem fotos e dados preservados</li>
                      </ul>
                      <span className="block mt-2 font-medium text-foreground">Para reativar, basta fazer login novamente.</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeactivateProfile}
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      Sim, desativar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Delete account */}
            <div className="space-y-3">
              <div>
                <p className="font-medium">Excluir conta</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seu perfil é desativado e seus dados de identificação (nome, e-mail, foto, bio) são apagados. Essa ação não pode ser desfeita — você não consegue mais acessar essa conta, nem com Google.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="gap-2"
                    disabled={isDeletingAccount}
                  >
                    <Trash2 className="w-4 h-4" />
                    {isDeletingAccount ? 'Excluindo...' : 'Excluir Minha Conta'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span className="block">Esta ação é definitiva:</span>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>Seu nome, e-mail, foto e bio são apagados</li>
                        <li>Seu perfil some de buscas, feed e chat</li>
                        <li>Você não consegue mais entrar nessa conta, nem com Google</li>
                      </ul>
                      <span className="block mt-2 font-medium text-foreground">Não é possível desfazer nem recuperar depois.</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  {/* Motivo da saída — opcional, mas ajuda a melhorar a plataforma */}
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-medium">
                      Antes de ir, o que te fez sair? <span className="font-normal text-muted-foreground">(opcional)</span>
                    </p>
                    <div className="space-y-1">
                      {ACCOUNT_DELETION_REASONS.map((r) => (
                        <label
                          key={r.code}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary/60"
                        >
                          <input
                            type="radio"
                            name="delete-reason"
                            className="accent-destructive"
                            checked={deleteReasonCode === r.code}
                            onChange={() => setDeleteReasonCode(r.code)}
                          />
                          <span>{r.label}</span>
                        </label>
                      ))}
                    </div>
                    <Textarea
                      value={deleteReasonText}
                      onChange={(e) => setDeleteReasonText(e.target.value.slice(0, 500))}
                      placeholder="Quer contar mais? Escreva aqui (opcional)"
                      rows={2}
                      className="text-sm"
                    />
                    <p className="text-right text-xs text-muted-foreground">{deleteReasonText.length}/500</p>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    >
                      Sim, excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </TabsContent>

        {/* Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-6">
          <SuggestionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SUGGESTION_CATEGORIES = [
  { value: 'feature', label: 'Nova funcionalidade' },
  { value: 'improvement', label: 'Melhoria' },
  { value: 'bug', label: 'Problema / Bug' },
  { value: 'general', label: 'Geral' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  new:      { label: 'Recebida',  color: 'bg-blue-500/10 text-blue-600',   icon: <Clock className="w-3.5 h-3.5" /> },
  read:     { label: 'Lida',      color: 'bg-muted text-muted-foreground',  icon: <Eye className="w-3.5 h-3.5" /> },
  planned:  { label: 'Planejada', color: 'bg-purple-500/10 text-purple-600',icon: <Lightbulb className="w-3.5 h-3.5" /> },
  done:     { label: 'Concluída', color: 'bg-green-500/10 text-green-600',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: 'Não aplicável', color: 'bg-red-500/10 text-red-500', icon: <XCircle className="w-3.5 h-3.5" /> },
};

function SuggestionsTab() {
  const { toast } = useToast();
  const [category, setCategory] = useState('general');
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  useEffect(() => {
    suggestionsService.getMine()
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setIsLoadingHistory(false));
  }, []);

  const handleSend = async () => {
    if (content.trim().length < 10) {
      toast({ title: 'Mensagem muito curta', description: 'Escreva pelo menos 10 caracteres.', variant: 'destructive' });
      return;
    }
    setIsSending(true);
    try {
      await suggestionsService.submit({ category, content: content.trim() });
      toast({ title: 'Sugestão enviada!', description: 'Obrigado pelo feedback. Vamos analisar em breve.' });
      setContent('');
      const data = await suggestionsService.getMine();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: 'Erro ao enviar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Composer */}
      <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Enviar sugestão ou feedback</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Tem uma ideia, encontrou um problema ou quer sugerir uma melhoria? Conta pra gente!
        </p>
        <div className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Categoria</Label>
            <div className="flex flex-wrap gap-2">
              {SUGGESTION_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    category === c.value
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Mensagem</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Descreva sua sugestão ou problema com o máximo de detalhes..."
              rows={5}
              maxLength={2000}
              className="resize-none"
            />
            <div className="mt-1 text-right text-xs text-muted-foreground">{content.length}/2000</div>
          </div>
          <div className="flex justify-end">
            <Button
              className="bg-gradient-primary hover:opacity-90 gap-2"
              disabled={isSending || content.trim().length < 10}
              onClick={() => void handleSend()}
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Enviando...' : 'Enviar'}
            </Button>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
        <h3 className="font-semibold">Minhas sugestões</h3>
        {isLoadingHistory && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoadingHistory && history.length === 0 && (
          <p className="text-sm text-muted-foreground">Você ainda não enviou nenhuma sugestão.</p>
        )}
        {!isLoadingHistory && history.map((s) => {
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.new;
          const catLabel = SUGGESTION_CATEGORIES.find((c) => c.value === s.category)?.label ?? s.category;
          return (
            <div key={s.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-medium text-muted-foreground">{catLabel}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                  {cfg.icon}{cfg.label}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{s.content}</p>
              {s.adminReply && (
                <div className="mt-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
                  <p className="text-xs font-semibold text-primary mb-1">Resposta da equipe</p>
                  <p className="text-sm text-muted-foreground">{s.adminReply}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
