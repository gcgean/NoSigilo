import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Crown, Flame, Gift, Heart, Lock, MessageCircle, ShieldCheck, Sparkles, Star, UserPlus, Users, Zap } from 'lucide-react';
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

function WelcomeInvitePreview() {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => (p + 1) % 3), 1200);
    return () => clearInterval(t);
  }, []);

  const nodes = [
    { label: 'Você', angle: 0, dist: 0, main: true },
    { label: 'Ana', angle: 0, dist: 72 },
    { label: 'Carlos', angle: 72, dist: 72 },
    { label: 'Julia', angle: 144, dist: 72 },
    { label: 'Rafael', angle: 216, dist: 72 },
    { label: 'Bia', angle: 288, dist: 72 },
  ];

  return (
    <div className="space-y-3">
      {/* Network visualization */}
      <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950/60 via-primary/20 to-orange-950/40">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 260 176" fill="none">
          {nodes.slice(1).map((node, i) => {
            const rad = (node.angle * Math.PI) / 180;
            const x2 = 130 + Math.cos(rad) * node.dist;
            const y2 = 88 + Math.sin(rad) * node.dist;
            return (
              <line
                key={i}
                x1="130" y1="88"
                x2={x2} y2={y2}
                stroke="rgba(236,72,153,0.35)"
                strokeWidth="1.5"
                strokeDasharray="4 3"
                className={cn('transition-all duration-700', i === pulse && 'stroke-primary')}
              />
            );
          })}
          {nodes.map((node, i) => {
            const rad = (node.angle * Math.PI) / 180;
            const cx = 130 + Math.cos(rad) * node.dist;
            const cy = 88 + Math.sin(rad) * node.dist;
            const isActive = node.main || (i - 1) === pulse;
            return (
              <g key={i}>
                <circle
                  cx={cx} cy={cy}
                  r={node.main ? 20 : 14}
                  fill={node.main ? 'rgba(236,72,153,0.9)' : 'rgba(30,10,20,0.8)'}
                  stroke={isActive ? '#ec4899' : 'rgba(236,72,153,0.25)'}
                  strokeWidth={isActive ? 2 : 1}
                />
                {node.main && (
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="bold">
                    Você
                  </text>
                )}
                {!node.main && (
                  <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.75)" fontSize="7.5">
                    {node.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-medium text-rose-300 backdrop-blur">
          ✦ Rede crescendo agora
        </div>
      </div>

      {/* Invite link preview */}
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
        <Gift className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">nosigilo.com/invite/<span className="text-primary font-semibold">seu-link-único</span></span>
        <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">Copiar</span>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Crown, label: 'Você escolhe quem entra', color: 'text-amber-400' },
          { icon: Zap, label: 'Convite exclusivo & pessoal', color: 'text-primary' },
          { icon: Star, label: 'Fortalece sua reputação', color: 'text-orange-400' },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border bg-secondary/20 p-2.5 text-center">
            <Icon className={cn('h-4 w-4', color)} />
            <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TutorialPreview({ stepId }: { stepId: string }) {
  switch (stepId) {
    case 'welcome':
      return <WelcomeInvitePreview />;
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

  const steps: TutorialStep[] = useMemo(
    () => [
      {
        id: 'welcome',
        title: 'Você chegou. Agora expanda o círculo.',
        description:
          'Você foi convidado por alguém de confiança — isso já te coloca num grupo seleto. Agora é a sua vez: cada pessoa que você trouxer fortalece a rede e aumenta sua reputação aqui dentro.',
        accent: 'from-rose-500/20 via-primary/20 to-orange-400/20',
        route: '/invites',
        cta: '🎁 Gerar meus convites',
        icon: Users,
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
    setOpen(true);
    setStepIndex(0);
  }, [user?.id]);

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

  const isWelcome = step.id === 'welcome';

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? finishTutorial() : setOpen(true))}>
      <DialogContent className="max-h-[92dvh] max-w-lg overflow-hidden border-primary/20 p-0 sm:max-w-2xl">
        <div className="relative">
          <div className={cn('absolute inset-0 bg-gradient-to-br', step.accent)} />
          <div className="relative flex max-h-[92dvh] flex-col overflow-hidden p-4 sm:p-6">

            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                    Passo {stepIndex + 1} de {steps.length}
                  </div>
                  {isWelcome && (
                    <div className="inline-flex animate-pulse items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-400">
                      <Flame className="h-3 w-3" /> Exclusivo por convite
                    </div>
                  )}
                </div>
                <h2 className="text-xl font-bold leading-tight sm:text-2xl">{step.title}</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={finishTutorial}>
                Pular
              </Button>
            </div>

            {/* Progress bar */}
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-secondary/70">
              <div className="h-full rounded-full bg-gradient-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>

            {/* Content */}
            <div className="overflow-y-auto pr-1">
              <div className="space-y-4">
                {isWelcome ? (
                  <div className="space-y-3">
                    <p className="text-sm leading-7 text-muted-foreground sm:text-base">{step.description}</p>
                    {/* Social proof strip */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { icon: Users, text: 'Rede cresce por indicação', color: 'text-primary' },
                        { icon: ShieldCheck, text: 'Você garante a qualidade', color: 'text-emerald-400' },
                        { icon: Sparkles, text: 'Seu nome fica associado', color: 'text-amber-400' },
                      ].map(({ icon: Icon, text, color }) => (
                        <span key={text} className={cn('inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium backdrop-blur', color)}>
                          <Icon className="h-3 w-3" /> {text}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-7 text-muted-foreground sm:text-base">{step.description}</p>
                )}
                {step.preview}
              </div>
            </div>

            {/* Footer */}
            <div className={cn('mt-5 border-t border-white/40 pt-4', isWelcome ? 'flex flex-col gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
              {isWelcome ? (
                <>
                  <Button
                    className="w-full bg-gradient-primary py-5 text-base font-bold hover:opacity-90"
                    onClick={handleVisitRoute}
                  >
                    🎁 Gerar meus convites agora
                  </Button>
                  <Button variant="ghost" className="w-full text-muted-foreground" onClick={goNext}>
                    Explorar a plataforma primeiro →
                  </Button>
                </>
              ) : (
                <>
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
                </>
              )}
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
