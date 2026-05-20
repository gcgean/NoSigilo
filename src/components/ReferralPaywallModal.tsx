import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Crown, Gift, Star, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { invitesService } from '@/services/api';
import SubscribeModal from '@/components/SubscribeModal';
import InviteModal from '@/components/InviteModal';

interface Props {
  open: boolean;
  onClose: () => void;
}

const AMBASSADOR_TIER = { count: 3, days: 30 };

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
  const target = AMBASSADOR_TIER.count;
  const pct = Math.min(100, Math.round((progress / target) * 100));
  const remaining = Math.max(0, target - progress);

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
            Assine ou indique {target} amigos para ganhar {AMBASSADOR_TIER.days} dias de acesso gratuito.
          </p>
        </div>

        {/* Cards */}
        <div className="px-5 -mt-5 space-y-3 pb-6">
          {/* Option A: Subscribe */}
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
              className="w-full bg-gradient-to-r from-primary to-purple-600 text-white gap-2 hover:opacity-90"
              onClick={handleGoPlans}
            >
              Ver planos
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="flex-1 border-t" />
            ou
            <div className="flex-1 border-t" />
          </div>

          {/* Option B: Refer 3 */}
          <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-500" />
              <span className="font-semibold">Indique {target} amigos</span>
              <span className="ml-auto text-xs rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 font-medium">
                Grátis
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Cada indicado deve completar o perfil, enviar uma mensagem ou curtir um perfil nos primeiros 7 dias. Quando {target} forem validados, você ganha {AMBASSADOR_TIER.days} dias grátis!
            </p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Users className="w-3.5 h-3.5" />
                  {progress} de {target} validados
                </span>
                <span className="font-medium text-foreground">{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {remaining > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Faltam <span className="font-semibold text-foreground">{remaining}</span> indicações validadas
                </p>
              ) : (
                <p className="text-xs text-emerald-600 font-medium">Você atingiu a meta! Vá para Convites para resgatar.</p>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full gap-2 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
              onClick={handleGoInvites}
            >
              <UserPlus className="w-4 h-4" />
              {remaining > 0 ? `Convidar pessoas (faltam ${remaining})` : 'Ver meus convites'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
