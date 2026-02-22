import { useState } from 'react';
import { 
  Users, Image, DollarSign, FileText, Shield, Ban, Check, X, 
  Eye, Trash2, Search, Filter, AlertTriangle, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const mockPendingPhotos = [
  {
    id: '1',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300',
    userId: 'user-1',
    userName: 'Marina Santos',
    uploadedAt: '2025-02-01',
    status: 'pending',
  },
  {
    id: '2',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=300',
    userId: 'user-2',
    userName: 'Carolina Lima',
    uploadedAt: '2025-02-01',
    status: 'pending',
  },
];

const mockUsers = [
  {
    id: 'user-1',
    name: 'Marina Santos',
    email: 'marina@email.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    status: 'active',
    isPremium: true,
    createdAt: '2025-01-15',
    reports: 0,
  },
  {
    id: 'user-2',
    name: 'Carolina Lima',
    email: 'carolina@email.com',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100',
    status: 'active',
    isPremium: false,
    createdAt: '2025-01-20',
    reports: 2,
  },
  {
    id: 'user-3',
    name: 'João Silva',
    email: 'joao@email.com',
    avatar: undefined,
    status: 'banned',
    isPremium: false,
    createdAt: '2025-01-10',
    reports: 5,
  },
];

const mockLogs = [
  { id: '1', action: 'user.login', user: 'marina@email.com', ip: '192.168.1.1', date: '2025-02-01 14:30' },
  { id: '2', action: 'photo.approved', user: 'admin@nosigilo.com', details: 'Photo #123', date: '2025-02-01 14:25' },
  { id: '3', action: 'user.banned', user: 'admin@nosigilo.com', details: 'User: joao@email.com', date: '2025-02-01 14:20' },
  { id: '4', action: 'report.created', user: 'carolina@email.com', details: 'Report #45', date: '2025-02-01 14:15' },
];

const mockFinance = {
  revenue: 15890.50,
  subscribers: 234,
  newToday: 12,
  churnRate: 2.3,
};

export default function Admin() {
  const { user } = useAuth();
  const [photos, setPhotos] = useState(mockPendingPhotos);
  const [users, setUsers] = useState(mockUsers);
  const [searchQuery, setSearchQuery] = useState('');

  // Redirect if not admin
  if (!user?.isAdmin) {
    return <Navigate to="/feed" replace />;
  }

  const handleApprovePhoto = (photoId: string) => {
    setPhotos(photos.filter(p => p.id !== photoId));
  };

  const handleRejectPhoto = (photoId: string) => {
    setPhotos(photos.filter(p => p.id !== photoId));
  };

  const handleBanUser = (userId: string) => {
    setUsers(users.map(u => 
      u.id === userId ? { ...u, status: 'banned' } : u
    ));
  };

  const handleUnbanUser = (userId: string) => {
    setUsers(users.map(u => 
      u.id === userId ? { ...u, status: 'active' } : u
    ));
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Painel Admin</h1>
          <p className="text-muted-foreground">Gerencie usuários, fotos e mais</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">Usuários</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Image className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{photos.length}</p>
              <p className="text-xs text-muted-foreground">Fotos Pendentes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">R$ {mockFinance.revenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Receita Mensal</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold">{mockFinance.subscribers}</p>
              <p className="text-xs text-muted-foreground">Assinantes</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="photos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="photos" className="gap-2">
            <Image className="w-4 h-4" />
            Moderação de Fotos
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-2">
            <DollarSign className="w-4 h-4" />
            Finanças
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <FileText className="w-4 h-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        {/* Photos Tab */}
        <TabsContent value="photos">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Fotos Aguardando Aprovação</h3>
            
            {photos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-4" />
                <p>Nenhuma foto pendente de aprovação!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img 
                      src={photo.url} 
                      alt="" 
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2">
                      <p className="text-white text-sm font-medium">{photo.userName}</p>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          className="bg-success hover:bg-success/90"
                          onClick={() => handleApprovePhoto(photo.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleRejectPhoto(photo.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <div className="glass rounded-xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuário..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" className="gap-2">
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
            </div>

            <div className="space-y-3">
              {filteredUsers.map((u) => (
                <div 
                  key={u.id} 
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback>{u.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{u.name}</p>
                        {u.isPremium && (
                          <Badge className="bg-gold text-black text-xs">Premium</Badge>
                        )}
                        {u.status === 'banned' && (
                          <Badge variant="destructive" className="text-xs">Banido</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {u.reports > 0 && (
                      <Badge variant="outline" className="gap-1 text-warning border-warning">
                        <AlertTriangle className="w-3 h-3" />
                        {u.reports} denúncias
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon">
                      <Eye className="w-4 h-4" />
                    </Button>
                    {u.status === 'banned' ? (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleUnbanUser(u.id)}
                      >
                        Desbanir
                      </Button>
                    ) : (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleBanUser(u.id)}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Banir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Finance Tab */}
        <TabsContent value="finance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Resumo Financeiro</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Receita Total (mês)</span>
                  <span className="text-2xl font-bold text-success">
                    R$ {mockFinance.revenue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assinantes Ativos</span>
                  <span className="font-semibold">{mockFinance.subscribers}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Novos Hoje</span>
                  <span className="font-semibold text-primary">+{mockFinance.newToday}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Taxa de Churn</span>
                  <span className="font-semibold">{mockFinance.churnRate}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Planos Populares</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Premium Mensal</span>
                  <span className="font-semibold">156 assinantes</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>VIP Mensal</span>
                  <span className="font-semibold">78 assinantes</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Logs do Sistema</h3>
            <div className="space-y-2">
              {mockLogs.map((log) => (
                <div 
                  key={log.id}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 text-sm"
                >
                  <span className="text-muted-foreground w-36">{log.date}</span>
                  <Badge variant="outline" className="font-mono">{log.action}</Badge>
                  <span>{log.user}</span>
                  {log.details && (
                    <span className="text-muted-foreground">{log.details}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
