import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Crown, Gift, Star, UserPlus, Users, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { invitesService } from '@/services/api';
import SubscribeModal from '@/components/SubscribeModal';
import InviteModal from '@/components/InviteModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Steps 1→10d, 2→20d, 3→30d (each tier grants +10d, accumulates)
const INVITE_STEPS = [
  { invites: 1, totalDays: 10 },
  { invites: 2, totalDays: 20 },
  { invites: 3, totalDays: 30 },
];

export default function ReferralPaywallModal({ open, onClose }: Props) {
  const [validatedCount, setValidatedCount] = useState<number | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    if (!open) return;
    invitesService
      .getRewardProgress()
      .then((data) => setValidatedCount(data.validatedCount))
      .catch(() => setValidatedCount(0));
  }, [open]);

  const handleGoPlans = () => {
    onClose();
    setShowSubscribeModal(true);
  };

  const handleGoInvites = () => {
    onClose();
    setShowInviteModal(true);
  };

  const progress = validatedCount ?? 0;
  const target = 3;
  const pct = Math.min(100, Math.round((progress / target) * 100));
  const remaining = Math.max(0, target - progress);

  // Which step the user is currently on (0-based index)
  const currentStepIdx = INVITE_STEPS.findIndex((s) => progress < s.invites);
  const nextStep = currentStepIdx >= 0 ? INVITE_STEPS[currentStepIdx] : null;

  return (
    <>
      <SubscribeModal open={showSubscribeModal} onClose={() => setShowSubscribeModal(false)} />
      <InviteModal open={showInviteModal} onClose={() => setShowInviteModal(false)} />
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-md w-full p-0 overflow-hidden rounded-2xl border-0">
          {/* Header gradient */}
          <div className="relative bg-gradient-to-br from-primary/90 via-primary to-purple-600 px-6 pt-8 pb-10 text-white">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 rounded-full bg-white/20 p-1.5 text-white/80 hover:bg-white/30 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-3">
              <Crown className="w-5 h-5 text-yellow-300" />
              <span className="text-sm font-semibold text-white/90 uppercase tracking-wide">Premium bloqueado</span>
            </div>
            <h2 className="text-2xl font-bold mb-1">Desbloqueie o acesso</h2>
            <p className="text-white/80 text-sm">
              Indique amigos e ganhe dias grátis — ou assine um plano Premium.
            </p>
          </div>

          {/* Cards */}
          <div className="px-5 -mt-5 space-y-3 pb-6">

            {/* ── Option A: Invite (DESTAQUE) ── */}
            <div className="relative rounded-2xl border-2 border-emerald-500 bg-card shadow-lg p-4 space-y-3">
              {/* Badge Recomendado */}
              <div className="absolute -top-3 left-4 flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-bold text-white shadow">
                <Zap className="w-3 h-3" />
                Recomendado — 100% grátis
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Gift className="w-5 h-5 text-emerald-500" />
                <span className="font-bold text-base">Indique amigos e ganhe dias grátis</span>
              </div>

              {/* Steps de recompensa */}
              <div className="grid grid-cols-3 gap-2">
                {INVITE_STEPS.map((step) => {
                  const reached = progress >= step.invites;
                  return (
                    <div
                      key={step.invites}
                      className={`rounded-xl border p-2.5 text-center transition-colors ${
                        reached
                          ? 'border-emerald-500/60 bg-emerald-500/10'
                          : progress === step.invites - 1
                          ? 'border-emerald-400/50 bg-emerald-500/5'
                          : 'border-border bg-secondary/30'
                      }`}
                    >
                      <div className="flex justify-center mb-1">
                        {reached ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <UserPlus className={`w-4 h-4 ${progress === step.invites - 1 ? 'text-emerald-500' : 'text-muted-foreground/50'}`} />
                        )}
                      </div>
                      <p className={`text-xs font-bold ${reached ? 'text-emerald-600' : 'text-foreground'}`}>
                        {step.invites} convite{step.invites > 1 ? 's' : ''}
                      </p>
                      <p className={`text-[11px] font-semibold ${reached ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        +{step.totalDays} dias
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Cada indicado precisa completar o perfil, enviar mensagem ou curtir um perfil nos primeiros 7 dias.
              </p>

              {/* Progress bar */}
              {progress < target && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {progress} de {target} validados
                    </span>
                    <span className="font-semibold text-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {nextStep && (
                    <p className="text-xs text-muted-foreground">
                      Falta{remaining > 1 ? 'm' : ''}{' '}
                      <span className="font-semibold text-foreground">{remaining}</span>{' '}
                      indicaç{remaining > 1 ? 'ões' : 'ão'} para ganhar{' '}
                      <span className="font-semibold text-emerald-600">+{nextStep.totalDays} dias grátis</span>
                    </p>
                  )}
                </div>
              )}
              {progress >= target && (
                <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Você atingiu a meta! Acesse Convites para resgatar.
                </p>
              )}

              <Button
                className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={handleGoInvites}
              >
                <UserPlus className="w-4 h-4" />
                {remaining > 0 ? `Convidar agora (faltam ${remaining})` : 'Ver meus convites'}
              </Button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 border-t" />
              ou prefira assinar
              <div className="flex-1 border-t" />
            </div>

            {/* ── Option B: Subscribe ── */}
            <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">Assinar o Premium</span>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {['Mensagens ilimitadas', 'Radar "Estou Aqui"', 'Ver quem visitou seu perfil', 'Fotos e vídeos exclusivos'].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleGoPlans}
              >
                Ver planos
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
