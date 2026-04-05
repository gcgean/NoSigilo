import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Heart, Lock, MessageCircle, Radio, ShieldCheck, Sparkles, User, UserPlus } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  accent: string;
  route?: string;
  cta?: string;
  icon: typeof Sparkles;
};

const TOUR_EVENT = 'nosigilo:start-tour';

export default function FirstAccessTutorial() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const storageKey = useMemo(() => `nosigilo:first-access-tour:${user?.id || 'anon'}`, [user?.id]);

  const steps: TutorialStep[] = useMemo(
    () => [
      {
        id: 'welcome',
        title: 'Seu espaço adulto, seguro e discreto',
        description:
          'O NoSigilo foi pensado para casais e singles +18. Aqui você entra com convite, controla sua privacidade e decide com calma como quer se apresentar.',
        accent: 'from-rose-500/20 via-primary/20 to-orange-400/20',
        icon: ShieldCheck,
      },
      {
        id: 'feed',
        title: 'Feed para se apresentar com contexto',
        description:
          'No Feed você publica fotos e atualizações para mostrar seu estilo, energia e intenção. Um perfil com contexto costuma gerar conexões melhores.',
        accent: 'from-primary/20 via-rose-500/15 to-transparent',
        route: '/feed',
        cta: 'Abrir Feed',
        icon: Sparkles,
      },
      {
        id: 'match',
        title: 'Match para descobrir quem combina com você',
        description:
          'Use o Match para conhecer casais e singles alinhados ao seu interesse. Quanto mais completo estiver seu perfil, mais úteis ficam as sugestões.',
        accent: 'from-amber-400/20 via-primary/20 to-transparent',
        route: '/match',
        cta: 'Ir para Match',
        icon: Heart,
      },
      {
        id: 'radar',
        title: 'Radar para avisar que você está na cidade',
        description:
          'O Radar serve para momentos específicos, como viagens e encontros planejados. Use com discrição, clareza e sempre com foco em consentimento.',
        accent: 'from-cyan-400/20 via-primary/20 to-transparent',
        route: '/radar',
        cta: 'Ver Radar',
        icon: Radio,
      },
      {
        id: 'chat',
        title: 'Chat para conversar com mais segurança',
        description:
          'Depois do interesse inicial, leve a conversa para o Chat. Combine limites, expectativas e detalhes sem pressa antes de qualquer encontro.',
        accent: 'from-emerald-400/20 via-primary/20 to-transparent',
        route: '/chat',
        cta: 'Abrir Chat',
        icon: MessageCircle,
      },
      {
        id: 'profile',
        title: 'Perfil e fotos privadas ficam no seu controle',
        description:
          'No Perfil você escolhe foto principal, organiza fotos públicas e decide quem pode ver suas fotos privadas. Aprovar, negar e revogar acesso fica com você.',
        accent: 'from-violet-400/20 via-primary/20 to-transparent',
        route: '/profile',
        cta: 'Ir para Perfil',
        icon: Lock,
      },
      {
        id: 'invites',
        title: 'Convites fortalecem a segurança da rede',
        description:
          'Em Gerar/Gerenciar convites você cria links únicos, acompanha quem entrou por sua indicação e aprova apenas quem realmente faz sentido para a comunidade.',
        accent: 'from-orange-400/20 via-primary/20 to-transparent',
        route: '/invites',
        cta: 'Abrir Convites',
        icon: UserPlus,
      },
      {
        id: 'notifications',
        title: 'Notificações mostram o que precisa da sua atenção',
        description:
          'Fique de olho nas notificações para aprovar convites, responder pedidos de fotos privadas e acompanhar interações importantes sem perder tempo.',
        accent: 'from-sky-400/20 via-primary/20 to-transparent',
        route: '/notifications',
        cta: 'Ver notificações',
        icon: Bell,
      },
      {
        id: 'finish',
        title: 'Pronto para começar',
        description:
          'Seu melhor começo é simples: complete o perfil, publique algo no feed, ajuste suas privacidades e convide apenas pessoas confiáveis para a rede.',
        accent: 'from-primary/20 via-rose-500/20 to-gold/20',
        route: '/feed',
        cta: 'Começar agora',
        icon: User,
      },
    ],
    []
  );

  useEffect(() => {
    if (!user?.id) return;
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      setOpen(true);
      setStepIndex(0);
    }
  }, [storageKey, user?.id]);

  useEffect(() => {
    const handler = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_EVENT, handler);
    return () => window.removeEventListener(TOUR_EVENT, handler);
  }, []);

  const step = steps[stepIndex];
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const finishTutorial = () => {
    localStorage.setItem(storageKey, 'seen');
    setOpen(false);
  };

  const goNext = () => {
    if (stepIndex >= steps.length - 1) {
      finishTutorial();
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const goPrev = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleVisitRoute = () => {
    if (!step.route) return;
    if (location.pathname !== step.route) navigate(step.route);
    goNext();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? finishTutorial() : setOpen(true))}>
      <DialogContent className="max-w-3xl overflow-hidden border-primary/20 p-0">
        <div className="relative">
          <div className={cn('absolute inset-0 bg-gradient-to-br', step.accent)} />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                    Passo {stepIndex + 1} de {steps.length}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                      <step.icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold leading-tight">{step.title}</h2>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={finishTutorial}>
                  Pular
                </Button>
              </div>

              <div className="space-y-3">
                <div className="h-2 overflow-hidden rounded-full bg-secondary/70">
                  <div className="h-full rounded-full bg-gradient-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{step.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {steps.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStepIndex(index)}
                    className={cn(
                      'rounded-2xl border p-3 text-left transition-all',
                      index === stepIndex
                        ? 'border-primary bg-background/90 shadow-glow'
                        : 'border-border/60 bg-background/60 hover:bg-background/80'
                    )}
                  >
                    <div className="text-xs text-muted-foreground">Passo {index + 1}</div>
                    <div className="mt-1 text-sm font-medium leading-tight">{item.title}</div>
                  </button>
                ))}
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={goPrev} disabled={stepIndex === 0}>
                    Voltar
                  </Button>
                  <Button variant="ghost" onClick={goNext}>
                    {stepIndex === steps.length - 1 ? 'Finalizar' : 'Próximo'}
                  </Button>
                </div>

                {step.route ? (
                  <Button className="bg-gradient-primary hover:opacity-90" onClick={handleVisitRoute}>
                    {step.cta || 'Abrir área'}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function startFirstAccessTutorial() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
