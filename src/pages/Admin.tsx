import { useEffect, useMemo, useState } from 'react';
import {
  Users, Image, DollarSign, FileText, Shield, Ban, Check, X,
  Eye, Search, Filter, TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { adminService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';

type AdminPhoto = {
  id: string;
  url: string;
  userId: string;
  userName: string;
  uploadedAt?: string;
  status?: string;
};

type AdminUser = {
  id: string;
  name: string;
  email?: string;
  avatar?: string | null;
  isPremium?: boolean;
  isAdmin?: boolean;
  createdAt?: string;
  status: 'active' | 'banned';
  reports: number;
};

type FinanceSummary = {
  revenue: number;
  subscribers: number;
  newToday: number;
  churnRate: number;
};

type LogItem = {
  id?: string;
  action?: string;
  user?: string;
  details?: string;
  date?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const DEFAULT_FINANCE: FinanceSummary = {
  revenue: 0,
  subscribers: 0,
  newToday: 0,
  churnRate: 0,
};

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [finance, setFinance] = useState<FinanceSummary>(DEFAULT_FINANCE);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [rawPhotos, rawUsers, rawLogs, rawFinance] = await Promise.all([
          adminService.getPendingPhotos(),
          adminService.getUsers(),
          adminService.getLogs(),
          adminService.getFinanceSummary(),
        ]);

        if (cancelled) return;

        setPhotos(
          Array.isArray(rawPhotos)
            ? rawPhotos.map((photo) => {
                const item = isRecord(photo) ? photo : {};
                return {
                  id: String(item.id || ''),
                  url: resolveServerUrl(String(item.url || '')),
                  userId: String(item.userId || ''),
                  userName: String(item.userName || 'Usuário'),
                  uploadedAt: item.uploadedAt ? String(item.uploadedAt) : undefined,
                  status: item.status ? String(item.status) : 'pending',
                };
              })
            : []
        );

        setUsers(
          Array.isArray(rawUsers)
            ? rawUsers.map((entry) => {
                const item = isRecord(entry) ? entry : {};
                return {
                  id: String(item.id || ''),
                  name: String(item.name || 'Usuário'),
                  email: item.email ? String(item.email) : undefined,
                  avatar: item.avatar ? resolveServerUrl(String(item.avatar)) : undefined,
                  isPremium: !!item.isPremium,
                  isAdmin: !!item.isAdmin,
                  createdAt: item.createdAt ? String(item.createdAt) : undefined,
                  status: 'active' as const,
                  reports: 0,
                };
              })
            : []
        );

        setLogs(
          Array.isArray(rawLogs)
            ? rawLogs.map((entry) => {
                const item = isRecord(entry) ? entry : {};
                return {
                  id: item.id ? String(item.id) : undefined,
                  action: item.action ? String(item.action) : undefined,
                  user: item.user ? String(item.user) : undefined,
                  details: item.details ? String(item.details) : undefined,
                  date: item.date ? String(item.date) : undefined,
                };
              })
            : []
        );
        setFinance(isRecord(rawFinance) ? { ...DEFAULT_FINANCE, ...rawFinance } as FinanceSummary : DEFAULT_FINANCE);
      } catch {
        if (cancelled) return;
        toast({
          title: 'Falha ao carregar o painel',
          description: 'Não foi possível buscar os dados administrativos.',
          variant: 'destructive',
        });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        [u.name, u.email || ''].some((value) => value.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [users, searchQuery]
  );

  if (!user?.isAdmin) {
    return <Navigate to="/feed" replace />;
  }

  const handleApprovePhoto = async (photoId: string) => {
    setBusyPhotoId(photoId);
    try {
      await adminService.approvePhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast({ title: 'Foto aprovada' });
    } catch {
      toast({ title: 'Erro ao aprovar foto', variant: 'destructive' });
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleRejectPhoto = async (photoId: string) => {
    setBusyPhotoId(photoId);
    try {
      await adminService.rejectPhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      toast({ title: 'Foto rejeitada' });
    } catch {
      toast({ title: 'Erro ao rejeitar foto', variant: 'destructive' });
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.banUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'banned' } : u)));
      toast({ title: 'Usuário marcado como banido' });
    } catch {
      toast({ title: 'Erro ao banir usuário', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setBusyUserId(userId);
    try {
      await adminService.unbanUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: 'active' } : u)));
      toast({ title: 'Usuário desbanido' });
    } catch {
      toast({ title: 'Erro ao desbanir usuário', variant: 'destructive' });
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Painel Admin</h1>
          <p className="text-muted-foreground">Gerencie usuários, fotos e dados do sistema</p>
        </div>
      </div>

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
              <p className="text-xs text-muted-foreground">Fotos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">R$ {Number(finance.revenue || 0).toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Receita</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 glass">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-gold" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Number(finance.subscribers || 0)}</p>
              <p className="text-xs text-muted-foreground">Assinantes</p>
            </div>
          </div>
        </Card>
      </div>

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

        <TabsContent value="photos">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Fotos enviadas</h3>

            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Carregando...</div>
            ) : photos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Check className="w-12 h-12 mx-auto mb-4" />
                <p>Nenhuma foto disponível no momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img src={photo.url} alt={photo.userName} className="w-full aspect-square object-cover rounded-lg" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col items-center justify-center gap-2 p-3">
                      <p className="text-white text-sm font-medium text-center">{photo.userName}</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success/90"
                          disabled={busyPhotoId === photo.id}
                          onClick={() => void handleApprovePhoto(photo.id)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyPhotoId === photo.id}
                          onClick={() => void handleRejectPhoto(photo.id)}
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
              <Button variant="outline" className="gap-2" disabled>
                <Filter className="w-4 h-4" />
                Filtros
              </Button>
            </div>

            <div className="space-y-3">
              {filteredUsers.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={entry.avatar || undefined} />
                      <AvatarFallback>{entry.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{entry.name}</p>
                        {entry.isPremium && <Badge className="bg-gold text-black text-xs">Premium</Badge>}
                        {entry.isAdmin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                        {entry.status === 'banned' && <Badge variant="destructive" className="text-xs">Banido</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.email || 'Sem e-mail público'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Eye className="w-3 h-3" />
                      {entry.reports} denúncias
                    </Badge>
                    {entry.status === 'banned' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyUserId === entry.id}
                        onClick={() => void handleUnbanUser(entry.id)}
                      >
                        Desbanir
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busyUserId === entry.id}
                        onClick={() => void handleBanUser(entry.id)}
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Banir
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!isLoading && filteredUsers.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nenhum usuário encontrado.</div>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="finance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Resumo Financeiro</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Receita Total</span>
                  <span className="text-2xl font-bold text-success">
                    R$ {Number(finance.revenue || 0).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Assinantes Ativos</span>
                  <span className="font-semibold">{Number(finance.subscribers || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Novos Hoje</span>
                  <span className="font-semibold text-primary">+{Number(finance.newToday || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Taxa de Churn</span>
                  <span className="font-semibold">{Number(finance.churnRate || 0)}%</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 glass">
              <h3 className="font-semibold mb-4">Leitura atual da API</h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Usuários retornados</span>
                  <span className="font-semibold text-foreground">{users.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Fotos retornadas</span>
                  <span className="font-semibold text-foreground">{photos.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span>Logs retornados</span>
                  <span className="font-semibold text-foreground">{logs.length}</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold mb-4">Logs do Sistema</h3>
            {logs.length === 0 ? (
              <div className="text-sm text-muted-foreground">A API atual não retornou logs.</div>
            ) : (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div key={log.id || `${log.action || 'log'}-${index}`} className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 text-sm">
                    <span className="text-muted-foreground w-36">{log.date || '—'}</span>
                    <Badge variant="outline" className="font-mono">{log.action || 'log'}</Badge>
                    <span>{log.user || 'sistema'}</span>
                    {log.details ? <span className="text-muted-foreground">{log.details}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
