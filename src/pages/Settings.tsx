import { useEffect, useMemo, useRef, useState } from 'react';
import { 
  User, Lock, Bell, Eye, Shield, Globe, Moon, LogOut, 
  ChevronRight, Camera, Mail, MapPin, Calendar, Trash2
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
import { feedService, profileService } from '@/services/api';
import { CitySearch } from '@/components/CitySearch';
import { resolveServerUrl } from '@/utils/serverUrl';

type Photo = { id: string; url: string; isPrivate: boolean; isMain: boolean };

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

  const interestOptions = useMemo(
    () => [
      'Homem',
      'Mulher',
      'Casal (Ele/Ela)',
      'Casal (Ele/Ele)',
      'Casal (Ela/Ela)',
      'Transexual',
      'Crossdresser (CD)',
      'Travesti',
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
                <Label>Gênero</Label>
                <Select value={profile.gender} onValueChange={(v) => setProfile({ ...profile, gender: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Homem">Homem</SelectItem>
                    <SelectItem value="Mulher">Mulher</SelectItem>
                    <SelectItem value="Casal (Ele/Ela)">Casal (Ele/Ela)</SelectItem>
                    <SelectItem value="Casal (Ele/Ele)">Casal (Ele/Ele)</SelectItem>
                    <SelectItem value="Casal (Ela/Ela)">Casal (Ela/Ela)</SelectItem>
                    <SelectItem value="Transexual">Transexual</SelectItem>
                    <SelectItem value="Crossdresser (CD)">Crossdresser (CD)</SelectItem>
                    <SelectItem value="Travesti">Travesti</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label>Você tem interesse em</Label>
                <span className="text-xs text-muted-foreground">{profile.lookingFor.length} selecionado(s)</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {interestOptions.map((opt) => {
                  const checked = profile.lookingFor.includes(opt);
                  return (
                    <label key={opt} className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = !!v;
                          setProfile((prev) => ({
                            ...prev,
                            lookingFor: next ? Array.from(new Set([...prev.lookingFor, opt])) : prev.lookingFor.filter((x) => x !== opt),
                          }));
                        }}
                      />
                      <span className="text-sm">{opt}</span>
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
