import { useState } from 'react';
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

export default function Settings() {
  const { user, updateUser, logout } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: user?.bio || '',
    city: user?.city || '',
    state: user?.state || '',
  });

  const [privacy, setPrivacy] = useState({
    profilePublic: true,
    showOnline: true,
    showLastSeen: true,
    showDistance: false,
    allowMessages: 'everyone',
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
      updateUser(profile);
      toast({ title: 'Perfil atualizado com sucesso!' });
    } catch {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.')) {
      toast({ title: 'Conta excluída', description: 'Sua conta foi removida.' });
      logout();
    }
  };

  return (
    <div className="max-w-3xl mx-auto md:ml-64">
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
                <Button variant="outline" size="sm" className="gap-2">
                  <Camera className="w-4 h-4" />
                  Alterar Foto
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  JPG, PNG ou GIF. Máximo 5MB.
                </p>
              </div>
            </div>
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
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="city"
                    value={profile.city}
                    onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <Select value={profile.state} onValueChange={(v) => setProfile({ ...profile, state: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SP">São Paulo</SelectItem>
                    <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                    <SelectItem value="MG">Minas Gerais</SelectItem>
                    <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                    <SelectItem value="PR">Paraná</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Sobre Mim</Label>
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
