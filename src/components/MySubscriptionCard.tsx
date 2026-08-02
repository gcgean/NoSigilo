import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CreditCard, Crown, QrCode, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { subscriptionsService, authService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hasPremiumAccess } from '@/utils/premium';

function getErrorMessage(error: any) {
  const data = error?.response?.data;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return 'Tente novamente em instantes.';
}

export default function MySubscriptionCard() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    subscriptionsService
      .getStatus()
      .then((status: any) => {
        if (!cancelled) setSubscriptionId(status?.subscriptionId ?? null);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionId(null);
      });
    return () => { cancelled = true; };
  }, []);

  const isPremiumActive = !!user?.isPremium && hasPremiumAccess(user);
  // Só existe hub_subscription_id quando o pagamento foi no cartão com
  // recorrência nativa — PIX e boleto são cobranças avulsas por ciclo.
  const isRecurring = !!subscriptionId;

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await subscriptionsService.cancel();
      setSubscriptionId(null);
      setShowCancelConfirm(false);
      toast({
        title: 'Assinatura cancelada',
        description: 'A cobrança automática no cartão foi encerrada. Seu acesso Premium continua até o fim do período já pago.',
      });
      const me = await authService.getMe();
      updateUser(me);
    } catch (error: any) {
      toast({ title: 'Falha ao cancelar assinatura', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <div className="glass rounded-xl p-4 sm:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Minha assinatura</h3>

      {isPremiumActive ? (
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/20 text-xl">👑</div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Premium ativo</p>
              <p className="text-xs text-muted-foreground">
                {user?.hubLicenseEndAt
                  ? <>Válido até <strong>{new Date(user.hubLicenseEndAt).toLocaleDateString('pt-BR')}</strong></>
                  : 'Acesso liberado a todos os recursos'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border bg-background/50 p-3">
            {isRecurring ? <CreditCard className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> : <QrCode className="w-4 h-4 mt-0.5 shrink-0 text-primary" />}
            <div className="min-w-0 text-xs">
              <p className="font-medium text-foreground">
                {isRecurring ? 'Cartão — renovação automática' : 'Pagamento avulso'}
              </p>
              <p className="text-muted-foreground mt-0.5">
                {isRecurring
                  ? 'Cobramos no seu cartão todo mês, sem precisar fazer nada.'
                  : 'Não há cobrança automática. Renove manualmente antes do vencimento para não perder o acesso.'}
              </p>
            </div>
          </div>

          {isRecurring && !showCancelConfirm && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-muted-foreground hover:text-destructive hover:border-destructive/40"
              onClick={() => setShowCancelConfirm(true)}
            >
              Cancelar cobrança automática
            </Button>
          )}

          {isRecurring && showCancelConfirm && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2.5">
              <p className="text-xs text-foreground">
                Isso encerra a cobrança automática mensal no seu cartão. Você continua Premium até{' '}
                <strong>{user?.hubLicenseEndAt ? new Date(user.hubLicenseEndAt).toLocaleDateString('pt-BR') : 'o fim do período já pago'}</strong>.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1" onClick={handleCancel} disabled={isCanceling}>
                  {isCanceling ? 'Cancelando…' : 'Confirmar cancelamento'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowCancelConfirm(false)} disabled={isCanceling}>
                  Voltar
                </Button>
              </div>
            </div>
          )}

          {!isRecurring && (
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => navigate('/subscriptions')}>
              <Repeat className="w-4 h-4" /> Ativar renovação automática
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted">
              <Crown className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Você não tem assinatura ativa</p>
              <p className="text-xs text-muted-foreground">Assine o Premium para liberar radar, vídeos, eventos e mais.</p>
            </div>
          </div>
          <Button
            className="w-full gap-2 bg-gradient-to-r from-rose-500 via-primary to-violet-500 hover:opacity-90 font-bold"
            onClick={() => navigate('/subscriptions')}
          >
            Ver planos <ArrowRight className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}
