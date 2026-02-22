import { useEffect, useState } from 'react';
import { Crown, Star, Zap, Radar, Video, Calendar, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { subscriptionsService, authService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Plan = {
  id: string;
  name: string;
  price: number;
  interval: string;
  perks: string[];
};

function daysLeft(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function Subscriptions() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    subscriptionsService
      .getPlans()
      .then((data) => {
        if (cancelled) return;
        setPlans(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPlans([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const left = daysLeft(user?.trialEndsAt ?? null);
  const trialExpired = left !== null && left <= 0 && !user?.isPremium;

  const premiumBenefits = [
    { icon: Radar, title: 'Radar Premium', desc: 'Notificar “estou aqui” e aparecer para mais pessoas' },
    { icon: Video, title: 'Vídeos', desc: 'Assistir e postar vídeos após o teste grátis' },
    { icon: Calendar, title: 'Eventos', desc: 'Criar eventos e alcançar mais pessoas' },
    { icon: Lock, title: 'Recursos Premium', desc: 'Desbloqueios e recursos exclusivos do app' },
  ] as const;

  const planMeta: Record<string, { badge?: string; billed?: string }> = {
    premium_monthly: { badge: 'Flexível', billed: 'Cobrança mensal' },
    premium_semiannual: { badge: 'Economize', billed: 'Cobrança semestral (6 meses)' },
    premium_annual: { badge: 'Melhor preço', billed: 'Cobrança anual (12 meses)' },
  };

  const handleCheckout = async (planId: string) => {
    try {
      setIsCheckingOut(planId);
      await subscriptionsService.checkout(planId);
      const me = await authService.getMe();
      updateUser(me);
      toast({ title: 'Plano atualizado', description: 'Seu plano foi atualizado com sucesso.' });
    } catch {
      toast({ title: 'Falha ao assinar', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsCheckingOut(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <Badge className="bg-gradient-primary mb-4">
          <Crown className="w-3 h-3 mr-1" /> Assinatura
        </Badge>
        <h1 className="text-3xl font-bold">Planos</h1>
        {left !== null && !user?.isPremium && (
          <p className={cn('mt-2 text-sm', trialExpired ? 'text-destructive' : 'text-muted-foreground')}>
            {trialExpired ? 'Seu teste grátis expirou. Assine para continuar.' : `Teste grátis: ${left} dia(s) restantes`}
          </p>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      {!isLoading && (
        <div className="space-y-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {premiumBenefits.map((b) => (
              <Card key={b.title} className="p-4 glass">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <b.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{b.title}</p>
                    <p className="text-sm text-muted-foreground">{b.desc}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan) => {
            const highlighted = plan.id !== 'basic';
            const isRecommended = plan.id === 'premium_annual';
            const icon = plan.id === 'basic' ? <Zap className="w-5 h-5 text-muted-foreground" /> : <Star className="w-5 h-5 text-gold" />;
            const meta = planMeta[plan.id] || {};
            return (
              <Card
                key={plan.id}
                className={cn(
                  'p-6 relative overflow-hidden transition-all hover:-translate-y-1',
                  highlighted ? 'border-2 border-primary shadow-glow bg-gradient-to-b from-primary/10 to-transparent' : 'glass'
                )}
              >
                {isRecommended && (
                  <div className="absolute top-0 right-0 bg-gradient-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">
                    Recomendado
                  </div>
                )}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    {meta.badge && <Badge variant="secondary" className="ml-auto">{meta.badge}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.perks?.length ? plan.perks.join(' • ') : 'Plano básico'}</p>
                </div>
                <div className="mb-6">
                  <span className="text-4xl font-bold">
                    R$ {plan.price.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-muted-foreground">/{plan.interval}</span>
                  {meta.billed && <p className="text-xs text-muted-foreground mt-2">{meta.billed}</p>}
                </div>
                <Button
                  className={cn('w-full', highlighted ? 'bg-gradient-primary hover:opacity-90 shadow-glow' : '')}
                  variant={highlighted ? 'default' : 'outline'}
                  disabled={isCheckingOut !== null}
                  onClick={() => handleCheckout(plan.id)}
                >
                  {isCheckingOut === plan.id ? 'Processando...' : plan.id === 'basic' ? 'Usar básico' : 'Assinar'}
                </Button>
              </Card>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
