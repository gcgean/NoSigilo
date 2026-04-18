import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock3, Crown, Eye, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { profileService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { resolveServerUrl } from '@/utils/serverUrl';
import { getUserProfileHref } from '@/utils/userProfileNavigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Visitor = {
  id: string;
  createdAt: string;
  visitsCount?: number;
  visitor: {
    id: string;
    name: string;
    avatar?: string | null;
  };
};

export default function ProfileVisitors() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isPremium = hasPremiumAccess(user);
  const totalVisits = useMemo(
    () => visitors.reduce((acc, item) => acc + Number(item.visitsCount || 1), 0),
    [visitors]
  );
  const latestVisit = visitors[0] || null;

  useEffect(() => {
    if (!isPremium) {
      setIsLoading(false);
      return;
    }

    const loadVisitors = async () => {
      try {
        const data = await profileService.getVisits();
        setVisitors(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load visitors:', err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadVisitors();
  }, [isPremium]);

  if (!isPremium) {
    return (
      <div className="max-w-2xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Quem visitou seu perfil</h1>
        </div>

        <Card className="p-8 text-center border-gold/30 bg-gold/5">
          <div className="w-16 h-16 bg-gold/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Crown className="w-8 h-8 text-gold" />
          </div>
          <h2 className="text-xl font-bold mb-2">Recurso Premium</h2>
          <p className="text-muted-foreground mb-6">
            Assine o Premium para ver a lista completa de pessoas que visitaram seu perfil recentemente.
          </p>
          <NavLink to="/subscriptions">
            <Button className="bg-gold text-black hover:bg-gold/90 font-bold px-8">
              Ver Planos Premium
            </Button>
          </NavLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-4 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Quem visitou seu perfil</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <Card className="glass border-primary/15 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Visitantes recentes</p>
              <p className="mt-1 text-3xl font-bold text-primary">{visitors.length}</p>
              <p className="mt-2 text-sm text-muted-foreground">Pessoas diferentes que passaram pelo seu perfil.</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </Card>

        <Card className="glass border-border/70 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Última atividade</p>
              <p className="mt-1 text-base font-semibold">
                {latestVisit ? latestVisit.visitor.name : 'Sem visitas recentes'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {latestVisit
                  ? `Última visita em ${format(new Date(latestVisit.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}`
                  : 'Quando alguém visitar seu perfil, o resumo aparece aqui.'}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <Clock3 className="w-5 h-5" />
            </div>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando visitantes...</div>
      ) : visitors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Eye className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Nenhuma visita recente.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visitors.map((v) => (
            <Card key={v.id} className="p-4 flex items-center justify-between glass hover:bg-secondary/20 transition-colors">
              <NavLink to={getUserProfileHref(v.visitor.id, user?.id, '/profile/visitors')} className="flex items-center gap-4 flex-1">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={v.visitor.avatar ? resolveServerUrl(v.visitor.avatar) : undefined} />
                  <AvatarFallback>{v.visitor.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{v.visitor.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Última visita em {format(new Date(v.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {Number(v.visitsCount || 1) > 1 ? (
                    <Badge variant="secondary" className="mt-2">
                      {Number(v.visitsCount)} visitas
                    </Badge>
                  ) : null}
                </div>
              </NavLink>
              <NavLink to={getUserProfileHref(v.visitor.id, user?.id, '/profile/visitors')}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="w-4 h-4" />
                  Ver perfil
                </Button>
              </NavLink>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && visitors.length > 0 ? (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Total de visitas registradas no período exibido: {totalVisits}
        </p>
      ) : null}
    </div>
  );
}
