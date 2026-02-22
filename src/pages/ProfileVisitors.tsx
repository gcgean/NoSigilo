import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, Crown, Eye, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { profileService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasPremiumAccess } from '@/utils/premium';
import { resolveServerUrl } from '@/utils/serverUrl';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Visitor = {
  id: string;
  createdAt: string;
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
              <NavLink to={`/users/${v.visitor.id}`} className="flex items-center gap-4 flex-1">
                <Avatar className="h-12 w-12 border-2 border-background">
                  <AvatarImage src={v.visitor.avatar ? resolveServerUrl(v.visitor.avatar) : undefined} />
                  <AvatarFallback>{v.visitor.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{v.visitor.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Visitou em {format(new Date(v.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </NavLink>
              <NavLink to={`/users/${v.visitor.id}`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="w-4 h-4" />
                  Ver perfil
                </Button>
              </NavLink>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
