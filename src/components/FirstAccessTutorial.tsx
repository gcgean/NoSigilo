import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Heart, Lock, MessageCircle, Radio, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
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
  preview: React.ReactNode;
};

const TOUR_EVENT = 'nosigilo:start-tour';

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[24px] border border-white/60 bg-white/85 p-3 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
      </div>
      <div className="overflow-hidden rounded-[18px] border bg-background/95 p-3">{children}</div>
    </div>
  );
}

function MiniCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border bg-secondary/20 p-3">
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
    </div>
  );
}

function TutorialPreview({ stepId }: { stepId: string }) {
  switch (stepId) {
    case 'welcome':
      return (
        <PreviewShell>
          <div className="space-y-3">
            <div className="rounded-2xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-white">Rede +18 por convite</div>
            <MiniCard title="Privacidade no seu controle" subtitle="Fotos privadas, aprovação e revogação" />
            <MiniCard title="Ambiente adulto e discreto" subtitle="Consentimento e segurança em primeiro lugar" />
          </div>
        </PreviewShell>
      );
    case 'discover':
      return (
        <PreviewShell>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="h-20 flex-1 rounded-2xl bg-gradient-to-br from-primary/25 to-rose-400/20" />
              <div className="h-20 flex-1 rounded-2xl bg-gradient-to-br from-amber-300/20 to-primary/15" />
            </div>
            <MiniCard title="Feed" subtitle="Publique fotos e se apresente com contexto" />
            <MiniCard title="Match" subtitle="Descubra casais e singles compatíveis" />
          </div>
        </PreviewShell>
      );
    case 'contact':
      return (
        <PreviewShell>
          <div className="space-y-3">
            <MiniCard title="Radar" subtitle="Avise que você está na cidade" />
            <div className="rounded-2xl border bg-secondary/20 p-3">
              <div className="mb-2 flex justify-end">
                <div className="max-w-[75%] rounded-2xl bg-primary px-3 py-2 text-xs text-white">Oi, vi seu perfil e gostei da proposta.</div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-2xl bg-secondary px-3 py-2 text-xs text-foreground">Vamos conversar com calma e alinhar expectativas.</div>
              </div>
            </div>
          </div>
        </PreviewShell>
      );
    case 'privacy':
      return (
        <PreviewShell>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-rose-300/20" />
              <div className="aspect-square rounded-2xl bg-secondary/40" />
              <div className="aspect-square rounded-2xl bg-secondary/40" />
            </div>
            <MiniCard title="Fotos privadas" subtitle="Permitir, negar ou revogar acesso" />
            <MiniCard title="Perfil" subtitle="Complete seus dados para sugestões melhores" />
          </div>
        </PreviewShell>
      );
    case 'safety':
      return (
        <PreviewShell>
          <div className="space-y-3">
            <MiniCard title="Gerar/Gerenciar convites" subtitle="Links únicos para novos acessos" />
            <MiniCard title="Notificações" subtitle="Aprove convites e acompanhe pedidos importantes" />
            <div className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">Seu convite está aguardando aprovação</div>
          </div>
        </PreviewShell>
      );
    default:
      return null;
  }
}

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
        title: 'Bem-vindo ao NoSigilo',
        description:
          'Aqui a entrada é por convite, o ambiente é adulto e você mantém o controle da sua privacidade desde o começo.',
        accent: 'from-rose-500/20 via-primary/20 to-orange-400/20',
        icon: ShieldCheck,
        preview: <TutorialPreview stepId="welcome" />,
      },
      {
        id: 'discover',
        title: 'Feed e Match',
        description:
          'Use o Feed para se apresentar e o Match para descobrir casais e singles que realmente combinam com o seu perfil.',
        accent: 'from-primary/20 via-rose-500/15 to-transparent',
        route: '/feed',
        cta: 'Abrir Feed',
        icon: Heart,
        preview: <TutorialPreview stepId="discover" />,
      },
      {
        id: 'contact',
        title: 'Radar e Chat',
        description:
          'O Radar ajuda quando você quer sinalizar presença. O Chat é o espaço para conversar com calma antes de qualquer encontro.',
        accent: 'from-cyan-400/20 via-primary/20 to-transparent',
        route: '/chat',
        cta: 'Abrir Chat',
        icon: MessageCircle,
        preview: <TutorialPreview stepId="contact" />,
      },
      {
        id: 'privacy',
        title: 'Perfil e fotos privadas',
        description:
          'Complete seu perfil, organize suas fotos e decida quem pode ver sua área privada. Aprovar ou revogar acesso fica sempre com você.',
        accent: 'from-violet-400/20 via-primary/20 to-transparent',
        route: '/profile',
        cta: 'Ir para Perfil',
        icon: Lock,
        preview: <TutorialPreview stepId="privacy" />,
      },
      {
        id: 'safety',
        title: 'Convites e segurança',
        description:
          'Em Gerar/Gerenciar convites você traz novos membros com mais segurança. Nas notificações, aprova convites e pedidos sem complicação.',
        accent: 'from-orange-400/20 via-primary/20 to-gold/20',
        route: '/invites',
        cta: 'Abrir Convites',
        icon: UserPlus,
        preview: <TutorialPreview stepId="safety" />,
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
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-hidden border-primary/20 p-0 sm:max-w-2xl">
        <div className="relative">
          <div className={cn('absolute inset-0 bg-gradient-to-br', step.accent)} />
          <div className="relative flex max-h-[92dvh] flex-col overflow-hidden p-4 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                  Passo {stepIndex + 1} de {steps.length}
                </div>
                <h2 className="text-xl font-bold leading-tight sm:text-2xl">{step.title}</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={finishTutorial}>
                Pular
              </Button>
            </div>

            <div className="mb-4 h-2 overflow-hidden rounded-full bg-secondary/70">
              <div className="h-full rounded-full bg-gradient-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            <div className="overflow-y-auto pr-1">
              <div className="space-y-4">
                <p className="text-sm leading-7 text-muted-foreground sm:text-base">{step.description}</p>
                {step.preview}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-white/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
      </DialogContent>
    </Dialog>
  );
}

export function startFirstAccessTutorial() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
