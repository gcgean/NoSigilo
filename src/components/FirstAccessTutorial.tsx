import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, CheckCircle2, Copy, Crown, ExternalLink, Flame, Gift, Heart, Lock, MessageCircle, Send, ShieldCheck, Sparkles, Star, UserPlus, Users, Zap } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { invitesService } from '@/services/api';

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

const INVITE_TIERS = [
  {
    count: 3,
    label: 'Embaixador(a)',
    icon: '🥉',
    days: 30,
    color: 'from-orange-400/20 to-amber-300/10',
    text: 'text-orange-400',
    border: 'border-orange-400/30',
    perks: ['30 dias Premium grátis', 'Perfil em destaque no feed', 'Título no perfil'],
  },
  {
    count: 10,
    label: 'Embaixador(a) Gold',
    icon: '🥇',
    days: 90,
    color: 'from-yellow-400/20 to-amber-400/10',
    text: 'text-yellow-400',
    border: 'border-yellow-400/30',
    perks: ['90 dias Premium grátis', 'Visibilidade 2× maior', 'Título Gold no perfil'],
  },
  {
    count: 30,
    label: 'Embaixador(a) Elite',
    icon: '👑',
    days: 365,
    color: 'from-violet-400/20 to-fuchsia-400/10',
    text: 'text-violet-400',
    border: 'border-violet-400/30',
    perks: ['365 dias Premium grátis', 'Topo das sugestões', 'Título Elite exclusivo'],
  },
];

type WelcomeStep = 'idle' | 'generating' | 'success' | 'error';

interface WelcomeInvitePreviewProps {
  onGenerate: () => Promise<{ url: string } | { errorCode: string } | null>;
  onSendWhatsApp: (link: string) => void;
  onSendSms: (link: string) => void;
  onGoToInvites: () => void;
}

function WelcomeInvitePreview({ onGenerate, onSendWhatsApp, onSendSms, onGoToInvites }: WelcomeInvitePreviewProps) {
  const [pulse, setPulse] = useState(0);
  const [step, setStep] = useState<WelcomeStep>('idle');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => (p + 1) % 5), 900);
    return () => clearInterval(t);
  }, []);

  const nodes = [
    { label: 'Você', angle: 0,   dist: 0,  main: true },
    { label: 'Ana',    angle: 0,   dist: 70 },
    { label: 'Carlos', angle: 72,  dist: 70 },
    { label: 'Julia',  angle: 144, dist: 70 },
    { label: 'Rafael', angle: 216, dist: 70 },
    { label: 'Bia',    angle: 288, dist: 70 },
  ];

  const handleGenerate = async () => {
    setStep('generating');
    const result = await onGenerate();
    if (result && 'url' in result) {
      setGeneratedLink(result.url);
      await navigator.clipboard.writeText(result.url).catch(() => {});
      setStep('success');
    } else if (result && 'errorCode' in result) {
      if (result.errorCode === 'too_many_active_invites') {
        setErrorMsg('Você já tem 5 convites ativos. Acesse a página de convites para gerenciá-los.');
      } else {
        setErrorMsg('Não foi possível gerar o convite. Tente novamente.');
      }
      setStep('error');
    } else {
      setErrorMsg('Não foi possível gerar o convite. Tente novamente.');
      setStep('error');
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;
    await navigator.clipboard.writeText(generatedLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── ERROR SCREEN ───────────────────────────────────────────────────────────
  if (step === 'error') {
    const isTooMany = errorMsg.includes('5 convites ativos');
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 py-6 text-center">
          <span className="text-3xl">{isTooMany ? '🔗' : '⚠️'}</span>
          <p className="text-sm font-semibold text-amber-400">
            {isTooMany ? 'Você já tem convites ativos!' : 'Ops! Algo deu errado'}
          </p>
          <p className="px-4 text-xs text-muted-foreground">{errorMsg}</p>
        </div>
        {isTooMany ? (
          <button
            onClick={onGoToInvites}
            className="w-full rounded-xl bg-gradient-to-r from-primary to-rose-500 py-3 text-sm font-bold text-white shadow transition hover:opacity-90"
          >
            🔗 Ver meus convites ativos
          </button>
        ) : (
          <button
            onClick={() => setStep('idle')}
            className="w-full rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (step === 'success' && generatedLink) {
    return (
      <div className="space-y-4">
        {/* Confetti-like success header */}
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-500/15 to-primary/10 py-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">
            🎉
          </div>
          <p className="text-base font-bold text-emerald-400">Convite gerado e copiado!</p>
          <p className="text-xs text-muted-foreground">O link já está na sua área de transferência</p>
        </div>

        {/* Link box — mostra só o path, botão copiar em destaque */}
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-primary/5">
          <div className="flex items-center gap-2 px-3 py-2">
            <Gift className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-primary">
              {generatedLink.replace(/^https?:\/\//, '')}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 border-t border-primary/20 bg-primary/10 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '✓ Link copiado!' : 'Copiar link'}
          </button>
        </div>

        {/* Send options */}
        <div>
          <p className="mb-2 text-center text-xs font-medium text-muted-foreground">Deseja enviar para alguém agora?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSendWhatsApp(generatedLink)}
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <span className="text-base">💬</span> WhatsApp
            </button>
            <button
              onClick={() => onSendSms(generatedLink)}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 py-3 text-xs font-semibold text-primary transition hover:bg-primary/20"
            >
              <Send className="h-3.5 w-3.5" /> SMS / Outro app
            </button>
          </div>
        </div>

        {/* Next tier teaser */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
          <p className="mb-1.5 text-center text-xs font-semibold text-foreground">
            🥉 Convide mais <span className="text-primary font-bold">2 pessoas</span> e desbloqueie:
          </p>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
            {['30 dias Premium grátis', 'Perfil em destaque', 'Título Embaixador(a)'].map((b) => (
              <span key={b} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="text-emerald-400">✓</span> {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── IDLE / GENERATING SCREEN ────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Network animation */}
      <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-950/60 via-primary/20 to-orange-950/40">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 260 144" fill="none">
          {nodes.slice(1).map((node, i) => {
            const rad = (node.angle * Math.PI) / 180;
            const x2 = 130 + Math.cos(rad) * node.dist;
            const y2 = 72 + Math.sin(rad) * node.dist;
            return (
              <line key={i} x1="130" y1="72" x2={x2} y2={y2}
                stroke={i === pulse ? '#ec4899' : 'rgba(236,72,153,0.25)'}
                strokeWidth={i === pulse ? 2 : 1.5}
                strokeDasharray="4 3"
                className="transition-all duration-500"
              />
            );
          })}
          {nodes.map((node, i) => {
            const rad = (node.angle * Math.PI) / 180;
            const cx = 130 + Math.cos(rad) * node.dist;
            const cy = 72 + Math.sin(rad) * node.dist;
            const isActive = node.main || (i - 1) === pulse;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={node.main ? 18 : 13}
                  fill={node.main ? 'rgba(236,72,153,0.9)' : 'rgba(20,5,15,0.85)'}
                  stroke={isActive ? '#ec4899' : 'rgba(236,72,153,0.2)'}
                  strokeWidth={isActive ? 2 : 1}
                />
                <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={node.main ? 'white' : 'rgba(255,255,255,0.7)'} fontSize={node.main ? '8' : '7'} fontWeight={node.main ? 'bold' : 'normal'}>
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-rose-300 backdrop-blur">
          ✦ Rede crescendo agora
        </div>
      </div>

      {/* Reward tiers */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recompensas por convite</p>
        <div className="grid grid-cols-3 gap-1.5">
          {INVITE_TIERS.map((tier) => (
            <div key={tier.label} className={cn('flex flex-col items-center gap-1.5 rounded-xl border bg-gradient-to-br p-2.5 text-center', tier.color, tier.border)}>
              <span className="text-xl leading-none">{tier.icon}</span>
              <span className={cn('text-[9px] font-bold leading-tight', tier.text)}>{tier.count} convites</span>
              <div className="w-full space-y-0.5">
                {tier.perks.map((perk) => (
                  <div key={perk} className="flex items-center gap-1">
                    <span className="text-[8px] text-emerald-400">✓</span>
                    <span className="text-[8px] leading-tight text-muted-foreground">{perk}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Generate CTA inside preview */}
      <button
        disabled={step === 'generating'}
        onClick={handleGenerate}
        className="w-full rounded-xl bg-gradient-to-r from-primary to-rose-500 py-3 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
      >
        {step === 'generating' ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Gerando seu convite...
          </span>
        ) : (
          '🎁 Gerar e copiar meu link de convite'
        )}
      </button>
    </div>
  );
}

function TutorialPreview({ stepId }: { stepId: string }) {
  switch (stepId) {
    case 'welcome':
      return null; // rendered separately with callbacks in parent
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

  const handleGenerateInvite = async (): Promise<{ url: string } | { errorCode: string } | null> => {
    try {
      const data = await invitesService.create();
      const url: string = data?.url ?? (data?.token ? `${window.location.origin}/invite/${data.token}` : '');
      if (!url) return { errorCode: 'unknown' };
      return { url };
    } catch (err: any) {
      const code = err?.response?.data?.error ?? 'unknown';
      return { errorCode: code };
    }
  };

  const handleSendWhatsApp = (link: string) => {
    const text = encodeURIComponent(`Ei! Te convido para o NoSigilo — uma rede adulta e discreta, só por convite. Acessa aqui: ${link}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSendSms = (link: string) => {
    const text = encodeURIComponent(`Te convido para o NoSigilo: ${link}`);
    window.open(`sms:?body=${text}`, '_blank');
  };

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
                  <WelcomeInvitePreview
                    onGenerate={handleGenerateInvite}
                    onSendWhatsApp={handleSendWhatsApp}
                    onSendSms={handleSendSms}
                    onGoToInvites={() => { finishTutorial(); navigate('/invites'); }}
                  />
                ) : (
                  <>
                    <p className="text-sm leading-7 text-muted-foreground sm:text-base">{step.description}</p>
                    {step.preview}
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className={cn('mt-5 border-t border-white/40 pt-4', isWelcome ? 'flex flex-col gap-3' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between')}>
              {isWelcome ? (
                <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={goNext}>
                  Explorar a plataforma primeiro →
                </Button>
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
