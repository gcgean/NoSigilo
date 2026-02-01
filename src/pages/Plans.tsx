import { Check, Star, Sparkles, Crown, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const plans = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    description: 'Para começar',
    features: [
      'Perfil básico',
      '10 curtidas por dia',
      'Mensagens limitadas',
      'Ver quem visitou (últimos 5)',
    ],
    highlighted: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 49',
    period: '/mês',
    description: 'Mais popular',
    features: [
      'Curtidas ilimitadas',
      'Mensagens ilimitadas',
      'Ver todas as visitas',
      'Destaque no feed',
      'Filtros avançados',
      'Sem anúncios',
    ],
    highlighted: true,
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 'R$ 99',
    period: '/mês',
    description: 'Experiência completa',
    features: [
      'Tudo do Premium',
      'Super curtidas ilimitadas',
      'Perfil em destaque',
      'Badge exclusiva VIP',
      'Suporte prioritário',
      'Funcionalidades beta',
    ],
    highlighted: false,
  },
];

export default function Plans() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <Badge className="bg-gradient-primary mb-4">
          <Crown className="w-3 h-3 mr-1" /> Planos Premium
        </Badge>
        <h1 className="text-4xl font-bold mb-4">
          Escolha o plano ideal para você
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Desbloqueie recursos exclusivos e encontre conexões verdadeiras mais rápido.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              "p-6 relative overflow-hidden transition-all hover:-translate-y-1",
              plan.highlighted
                ? "border-2 border-primary shadow-glow bg-gradient-to-b from-primary/10 to-transparent"
                : "glass"
            )}
          >
            {plan.highlighted && (
              <div className="absolute top-0 right-0 bg-gradient-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg font-medium">
                Mais Popular
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                {plan.id === 'free' && <Zap className="w-5 h-5 text-muted-foreground" />}
                {plan.id === 'premium' && <Star className="w-5 h-5 text-gold" />}
                {plan.id === 'vip' && <Sparkles className="w-5 h-5 text-primary" />}
                <h3 className="text-xl font-bold">{plan.name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold">{plan.price}</span>
              <span className="text-muted-foreground">{plan.period}</span>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-success flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              className={cn(
                "w-full",
                plan.highlighted
                  ? "bg-gradient-primary hover:opacity-90 shadow-glow"
                  : ""
              )}
              variant={plan.highlighted ? "default" : "outline"}
            >
              {plan.id === 'free' ? 'Plano Atual' : 'Assinar Agora'}
            </Button>
          </Card>
        ))}
      </div>

      {/* Referral Discount */}
      <div className="mt-12 glass rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
          <Sparkles className="w-8 h-8 text-primary-foreground" />
        </div>
        <h3 className="text-xl font-bold mb-2">Indique e Ganhe</h3>
        <p className="text-muted-foreground mb-4">
          Convide amigos e ganhe até 50% de desconto no seu próximo mês.
        </p>
        <Button variant="outline" className="gap-2">
          <Star className="w-4 h-4" />
          Saiba Mais
        </Button>
      </div>
    </div>
  );
}
