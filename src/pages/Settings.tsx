import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  User, Lock, Bell, Eye, Shield, Globe, Moon, LogOut, 
  ChevronRight, Camera, Mail, MapPin, Calendar, Trash2, Copy, UserPlus, CheckCircle2, XCircle, Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { feedService, invitesService, profileService } from '@/services/api';
import { CitySearch } from '@/components/CitySearch';
import { resolveServerUrl } from '@/utils/serverUrl';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean };
type InviteItem = {
  id: string;
  token: string;
  status: 'created' | 'pending_approval' | 'approved' | 'denied' | 'revoked';
  createdAt: string;
  updatedAt?: string;
  inviteeEmail?: string | null;
  invitee?: { id: string; name?: string | null; avatar?: string | null } | null;
};

function resolveMediaUrl(url: string) {
  if (!url) return url;
  return resolveServerUrl(url);
}

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [inviteItems, setInviteItems] = useState<InviteItem[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const privateFileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
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
    city: user?.city || '',
    state: user?.state || '',
    lookingFor: (user?.lookingFor || []) as string[],
  });

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

  const [privacy, setPrivacy] = useState({
    profilePublic: true,
    showOnline: true,
    showLastSeen: true,
    showDistance: false,
    allowMessages: (user?.allowMessages || 'everyone') as any,
  });

  const [notifications, setNotifications] = useState({
    likes: true,
    matches: true,
    messages: true,
    visits: true,
    email: false,
    push: true,
  });

  const handleSaveProfile = async () => {
    setIsLoading(true);
    try {
      updateUser({ ...(profile as any), allowMessages: privacy.allowMessages });
      toast({ title: 'Perfil atualizado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
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

  useEffect(() => {
    void loadPhotos();
  }, []);

  const loadInvites = async () => {
    setIsLoadingInvites(true);
    try {
      const list = await invitesService.listMine();
      setInviteItems(Array.isArray(list) ? list : []);
    } catch {
      setInviteItems([]);
    } finally {
      setIsLoadingInvites(false);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const handleChangeAvatar = async (file: File) => {
    try {
      setIsUploading(true);
      const uploaded = await profileService.uploadMedia(file, { isPrivate: false });
      const mediaId = uploaded?.id ? String(uploaded.id) : '';
      const url = uploaded?.url ? String(uploaded.url) : '';
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

  const handleDeleteAccount = () => {
    if (confirm('Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.')) {
      toast({ title: 'Conta excluída', description: 'Sua conta foi removida.' });
      logout();
    }
  };

  const handleCreateInvite = async () => {
    try {
      const created = await invitesService.create();
      if (created?.url && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(created.url));
      }
      toast({
        title: 'Convite criado',
        description: created?.url ? 'O link foi criado e copiado para a área de transferência.' : 'Seu link de convite está pronto.',
      });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao criar convite', description: 'Tente novamente.', variant: 'destructive' });
    }
  };

  const handleCopyInvite = async (invite: InviteItem) => {
    try {
      const url = `${window.location.origin}/register?invite=${encodeURIComponent(invite.token)}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copiado', description: 'Envie este link apenas para quem você realmente deseja indicar.' });
    } catch {
      toast({ title: 'Falha ao copiar', description: 'Copie o link manualmente mais tarde.', variant: 'destructive' });
    }
  };

  const handleApproveInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.approve(inviteId);
      toast({ title: 'Convite aprovado', description: 'O novo perfil já pode entrar na rede.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao aprovar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleDenyInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.deny(inviteId);
      toast({ title: 'Convite negado', description: 'Esse cadastro não foi aprovado por você.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao negar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      await invitesService.revoke(inviteId);
      toast({ title: 'Link revogado', description: 'Esse convite não poderá mais ser usado.' });
      await loadInvites();
    } catch {
      toast({ title: 'Falha ao revogar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-6">Configurações</h1>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="profile" className="gap-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Perfil</span>
          </TabsTrigger>
          <TabsTrigger value="privacy" className="gap-2">
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">Privacidade</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Segurança</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Foto de Perfil</h3>
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
                <p className="text-xs text-muted-foreground mt-2">
                  JPG, PNG ou GIF. Máximo 5MB.
                </p>
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

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-semibold mb-4">Informações Pessoais</h3>
            
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="pl-9"
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Perfil principal</Label>
                <Select value={profile.gender} onValueChange={(v) => setProfile({ ...profile, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione como seu perfil será exibido" />
                  </SelectTrigger>
                  <SelectContent>
                    {audienceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Seu perfil pode representar casal, mulher solteira, homem solteiro ou outros perfis adultos aceitos na plataforma.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Estado civil</Label>
                <Select
                  value={profile.maritalStatus}
                  onValueChange={(v) => setProfile({ ...profile, maritalStatus: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
                    <SelectItem value="Namorando">Namorando</SelectItem>
                    <SelectItem value="Casado(a)">Casado(a)</SelectItem>
                    <SelectItem value="Separado(a)">Separado(a)</SelectItem>
                    <SelectItem value="Liberal">Liberal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Orientação Sexual</Label>
                <Select
                  value={profile.sexualOrientation}
                  onValueChange={(v) => setProfile({ ...profile, sexualOrientation: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
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
                <Label>Profissão</Label>
                <Input
                  value={profile.profession}
                  onChange={(e) => setProfile({ ...profile, profession: e.target.value })}
                  placeholder="Ex.: Empresário(a), Estudante..."
                />
              </div>

              <div className="space-y-2">
                <Label>Signo</Label>
                <Select value={profile.zodiacSign} onValueChange={(v) => setProfile({ ...profile, zodiacSign: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Áries">Áries</SelectItem>
                    <SelectItem value="Touro">Touro</SelectItem>
                    <SelectItem value="Gêmeos">Gêmeos</SelectItem>
                    <SelectItem value="Câncer">Câncer</SelectItem>
                    <SelectItem value="Leão">Leão</SelectItem>
                    <SelectItem value="Virgem">Virgem</SelectItem>
                    <SelectItem value="Libra">Libra</SelectItem>
                    <SelectItem value="Escorpião">Escorpião</SelectItem>
                    <SelectItem value="Sagitário">Sagitário</SelectItem>
                    <SelectItem value="Capricórnio">Capricórnio</SelectItem>
                    <SelectItem value="Aquário">Aquário</SelectItem>
                    <SelectItem value="Peixes">Peixes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Etnia</Label>
                <Select value={profile.ethnicity} onValueChange={(v) => setProfile({ ...profile, ethnicity: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pretos (lisos)">Pretos (lisos)</SelectItem>
                    <SelectItem value="Pretos (cacheados)">Pretos (cacheados)</SelectItem>
                    <SelectItem value="Castanhos (lisos)">Castanhos (lisos)</SelectItem>
                    <SelectItem value="Castanhos (cacheados)">Castanhos (cacheados)</SelectItem>
                    <SelectItem value="Loiros">Loiros</SelectItem>
                    <SelectItem value="Ruivos">Ruivos</SelectItem>
                    <SelectItem value="Grisalhos">Grisalhos</SelectItem>
                    <SelectItem value="Careca">Careca</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Olhos</Label>
                <Select value={profile.eyes} onValueChange={(v) => setProfile({ ...profile, eyes: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Castanhos">Castanhos</SelectItem>
                    <SelectItem value="Azuis">Azuis</SelectItem>
                    <SelectItem value="Verdes">Verdes</SelectItem>
                    <SelectItem value="Pretos">Pretos</SelectItem>
                    <SelectItem value="Mel">Mel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Altura</Label>
                <Input
                  value={profile.height}
                  onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                  placeholder="Ex.: 1.78 m"
                />
              </div>

              <div className="space-y-2">
                <Label>Corpo</Label>
                <Select value={profile.bodyType} onValueChange={(v) => setProfile({ ...profile, bodyType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Atlético(a)">Atlético(a)</SelectItem>
                    <SelectItem value="Magro(a)">Magro(a)</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Acima do peso">Acima do peso</SelectItem>
                    <SelectItem value="Plus size">Plus size</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fuma</Label>
                <Select value={profile.smokes} onValueChange={(v) => setProfile({ ...profile, smokes: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Não">Não</SelectItem>
                    <SelectItem value="Socialmente">Socialmente</SelectItem>
                    <SelectItem value="Sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <CitySearch 
                  value={profile.city} 
                  onChange={(val) => setProfile(prev => ({ ...prev, city: val }))}
                  onSelect={(city, state) => {
                    setProfile(prev => ({ ...prev, city, state }));
                  }} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado (UF)</Label>
                <Input
                  id="state"
                  value={profile.state}
                  onChange={(e) => setProfile({ ...profile, state: e.target.value.toUpperCase().slice(0, 2) })}
                  placeholder="Ex.: SP"
                  className="uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input
                id="status"
                value={profile.status}
                onChange={(e) => setProfile({ ...profile, status: e.target.value })}
                placeholder="Ex.: Procurando novas conexões..."
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Perfis que você quer priorizar</Label>
                <span className="text-xs text-muted-foreground">{profile.lookingFor.length} selecionado(s)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Essas preferências ajudam o NoSigilo a priorizar casais, mulheres solteiras, homens solteiros e outros perfis adultos compatíveis com o que você procura.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {audienceOptions.map((option) => {
                  const checked = profile.lookingFor.includes(option.value);
                  return (
                    <label key={option.value} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
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
                      <div className="space-y-1">
                        <span className="text-sm font-medium">{option.label}</span>
                        <p className="text-xs text-muted-foreground">{option.hint}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Descrição</Label>
              <Textarea
                id="bio"
                value={profile.bio}
                onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                placeholder="Conte um pouco sobre você..."
                rows={4}
              />
            </div>

            <Button 
              onClick={handleSaveProfile} 
              className="w-full sm:w-auto bg-gradient-primary hover:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-semibold">Fotos Privadas</h3>
            <p className="text-sm text-muted-foreground">
              Suas fotos privadas só são visíveis para quem você autorizar.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {photos.filter((p) => p.isPrivate).slice(0, 5).map((p) => (
                <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden">
                  <img src={resolveMediaUrl(p.url)} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              <Button type="button" className="aspect-square h-auto bg-gradient-primary hover:opacity-90" disabled={isUploading} onClick={() => privateFileInputRef.current?.click()}>
                <Camera className="w-5 h-5" />
              </Button>
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
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-6">
          <div className="glass rounded-xl p-6 space-y-6">
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

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-semibold">Quem pode enviar mensagens</h3>
            <Select 
              value={privacy.allowMessages} 
              onValueChange={(v) => setPrivacy({ ...privacy, allowMessages: v })}
            >
              <SelectTrigger>
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
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="glass rounded-xl p-6 space-y-6">
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

          <div className="glass rounded-xl p-6 space-y-6">
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
                <p className="text-sm text-muted-foreground">Notificações no navegador</p>
              </div>
              <Switch
                checked={notifications.push}
                onCheckedChange={(v) => setNotifications({ ...notifications, push: v })}
              />
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-semibold">Convites e padrinhos</h3>
                <p className="text-sm text-muted-foreground">
                  O acesso ao NoSigilo acontece por indicação. Gere links únicos e aprove apenas quem você realmente quer trazer para a rede.
                </p>
              </div>
              <Button type="button" className="bg-gradient-primary hover:opacity-90 gap-2" onClick={handleCreateInvite}>
                <UserPlus className="w-4 h-4" />
                Gerar link de convite
              </Button>
            </div>

            {user?.invitedBy ? (
              <div className="rounded-xl border bg-secondary/30 p-4 text-sm">
                Você entrou por convite de <span className="font-semibold">{user.invitedBy.name}</span>.
              </div>
            ) : null}

            <div className="space-y-3">
              {isLoadingInvites ? (
                <p className="text-sm text-muted-foreground">Carregando convites...</p>
              ) : inviteItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Você ainda não gerou nenhum convite.
                </div>
              ) : (
                inviteItems.map((invite) => {
                  const shareUrl = `${window.location.origin}/register?invite=${encodeURIComponent(invite.token)}`;
                  const isBusy = busyInviteId === invite.id;
                  return (
                    <div key={invite.id} className="rounded-xl border p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">Convite de acesso</span>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                              {invite.status === 'created'
                                ? 'Aguardando uso'
                                : invite.status === 'pending_approval'
                                  ? 'Aguardando sua aprovação'
                                  : invite.status === 'approved'
                                    ? 'Aprovado'
                                    : invite.status === 'denied'
                                      ? 'Negado'
                                      : 'Revogado'}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground break-all">{shareUrl}</p>
                          {invite.invitee?.name || invite.inviteeEmail ? (
                            <p className="text-sm text-muted-foreground">
                              Cadastro vinculado a <span className="font-medium text-foreground">{invite.invitee?.name || invite.inviteeEmail}</span>
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Nenhum cadastro iniciado com este link ainda.</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {invite.status === 'created' ? (
                            <>
                              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void handleCopyInvite(invite)}>
                                <Copy className="w-4 h-4" />
                                Copiar link
                              </Button>
                              <Button type="button" variant="ghost" size="sm" className="gap-2" disabled={isBusy} onClick={() => void handleRevokeInvite(invite.id)}>
                                <XCircle className="w-4 h-4" />
                                Revogar
                              </Button>
                            </>
                          ) : null}
                          {invite.status === 'pending_approval' ? (
                            <>
                              <Button type="button" size="sm" className="gap-2 bg-gradient-primary hover:opacity-90" disabled={isBusy} onClick={() => void handleApproveInvite(invite.id)}>
                                <CheckCircle2 className="w-4 h-4" />
                                Aprovar
                              </Button>
                              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={isBusy} onClick={() => void handleDenyInvite(invite.id)}>
                                <XCircle className="w-4 h-4" />
                                Negar
                              </Button>
                            </>
                          ) : null}
                          {invite.status === 'approved' ? (
                            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                              <CheckCircle2 className="w-4 h-4" />
                              Membro liberado por você
                            </div>
                          ) : null}
                          {invite.status === 'denied' ? (
                            <div className="inline-flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                              <XCircle className="w-4 h-4" />
                              Cadastro recusado
                            </div>
                          ) : null}
                          {invite.status === 'revoked' ? (
                            <div className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                              <Link2 className="w-4 h-4" />
                              Link encerrado
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-semibold">Alterar Senha</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Senha Atual</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>Confirmar Nova Senha</Label>
                <Input type="password" />
              </div>
              <Button variant="outline">Alterar Senha</Button>
            </div>
          </div>

          <div className="glass rounded-xl p-6 space-y-4">
            <h3 className="font-semibold">Sessões Ativas</h3>
            <p className="text-sm text-muted-foreground">
              Você está logado neste dispositivo. Clique abaixo para sair de todas as sessões.
            </p>
            <Button variant="outline" onClick={logout} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sair de Todas as Sessões
            </Button>
          </div>

          <div className="glass rounded-xl p-6 space-y-4 border-destructive/30">
            <h3 className="font-semibold text-destructive">Zona de Perigo</h3>
            <p className="text-sm text-muted-foreground">
              Ao excluir sua conta, todos os seus dados serão permanentemente removidos.
            </p>
            <Button 
              variant="destructive" 
              onClick={handleDeleteAccount}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Minha Conta
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
