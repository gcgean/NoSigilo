import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, Lock, Bell, Eye, Shield, Globe, Moon, LogOut,
  ChevronRight, Camera, Mail, MapPin, Calendar, Trash2, UserPlus, EyeOff, MessageSquarePlus, CheckCircle2, Clock, XCircle, Lightbulb, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { feedService, profileService, suggestionsService } from '@/services/api';
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
    birthDate: user?.birthDate || '',
    partnerBirthDate: user?.partnerBirthDate || '',
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

  const isCoupleProfile = profile.gender.startsWith('Casal');

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
    visits: user?.notificationVisits !== false,
    email: false,
    push: true,
  });

  useEffect(() => {
    setNotifications((prev) => ({
      ...prev,
      visits: user?.notificationVisits !== false,
    }));
  }, [user?.notificationVisits]);

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

  const handleSaveNotifications = async () => {
    setIsLoading(true);
    try {
      await profileService.updateProfile({ notificationVisits: notifications.visits });
      updateUser({ notificationVisits: notifications.visits });
      toast({ title: 'Preferências de notificação atualizadas!' });
    } catch {
      toast({ title: 'Erro ao salvar notificações', variant: 'destructive' });
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
        <TabsList className="w-full grid grid-cols-5">
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
          <TabsTrigger value="suggestions" className="gap-2">
            <Lightbulb className="w-4 h-4" />
            <span className="hidden sm:inline">Sugestões</span>
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
                <Label htmlFor="birthDate">{isCoupleProfile ? 'Nascimento da pessoa 1' : 'Data de nascimento'}</Label>
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

              {isCoupleProfile ? (
                <div className="space-y-2">
                  <Label htmlFor="partnerBirthDate">Nascimento da pessoa 2</Label>
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
              ) : null}

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
          <div className="glass rounded-xl p-6 space-y-4">
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

          <div className="glass rounded-xl p-6 space-y-6 border border-destructive/20">
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
                  Ao excluir sua conta, todos os seus dados serão permanentemente removidos e não poderão ser recuperados.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Minha Conta
              </Button>
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
      <div className="glass rounded-xl p-6 space-y-4">
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
      <div className="glass rounded-xl p-6 space-y-4">
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
