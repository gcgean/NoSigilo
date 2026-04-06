import { useEffect, useState } from 'react';
import { Copy, Crown, QrCode, Star, Zap, Radar, Video, Calendar, Lock, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { subscriptionsService, authService, profileService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Plan = {
  id: string;
  code?: string;
  name: string;
  price: number;
  amount?: number;
  interval: string;
  intervalUnit?: string;
  intervalCount?: number;
  description?: string | null;
  perks?: string[];
};

type CheckoutPayload = {
  chargeId?: string | null;
  externalChargeId?: string | null;
  status?: string | null;
  checkoutUrl?: string | null;
  pixCode?: string | null;
  pixQrCode?: string | null;
  pixPayload?: string | null;
  boletoUrl?: string | null;
  amount?: number | null;
  currency?: string | null;
  dueDate?: string | null;
};

type BillingForm = {
  billingDocument: string;
  billingPersonType: 'PF' | 'PJ';
  billingPhone: string;
  billingAddressZip: string;
  billingAddressStreet: string;
  billingAddressNumber: string;
  billingAddressDistrict: string;
  billingAddressComplement: string;
  billingAddressCity: string;
  billingAddressState: string;
};

const BILLING_REQUIRED_FIELDS: Array<{ key: keyof BillingForm; label: string }> = [
  { key: 'billingDocument', label: 'CPF/CNPJ' },
  { key: 'billingPhone', label: 'Telefone' },
  { key: 'billingAddressZip', label: 'CEP' },
  { key: 'billingAddressStreet', label: 'Rua' },
  { key: 'billingAddressNumber', label: 'Numero' },
  { key: 'billingAddressDistrict', label: 'Bairro' },
  { key: 'billingAddressCity', label: 'Cidade' },
  { key: 'billingAddressState', label: 'Estado' },
];

function daysLeft(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const diff = end - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function buildBillingForm(user: ReturnType<typeof useAuth>['user']): BillingForm {
  return {
    billingDocument: user?.billingDocument || '',
    billingPersonType: user?.billingPersonType || 'PF',
    billingPhone: user?.billingPhone || '',
    billingAddressZip: user?.billingAddressZip || '',
    billingAddressStreet: user?.billingAddressStreet || '',
    billingAddressNumber: user?.billingAddressNumber || '',
    billingAddressDistrict: user?.billingAddressDistrict || '',
    billingAddressComplement: user?.billingAddressComplement || '',
    billingAddressCity: user?.billingAddressCity || user?.city || '',
    billingAddressState: user?.billingAddressState || user?.state || '',
  };
}

function getMissingBillingFields(form: BillingForm) {
  return BILLING_REQUIRED_FIELDS.filter(({ key }) => !String(form[key] || '').trim());
}

export default function Subscriptions() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutPayload | null>(null);
  const [hubBanner, setHubBanner] = useState<string | null>(user?.hubBanner ?? null);
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingForm, setBillingForm] = useState<BillingForm>(() => buildBillingForm(user));
  const [billingPlanId, setBillingPlanId] = useState<string | null>(null);
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  useEffect(() => {
    setBillingForm(buildBillingForm(user));
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [plansData, statusData] = await Promise.allSettled([
          subscriptionsService.getPlans(),
          subscriptionsService.getStatus(),
        ]);

        if (cancelled) return;

        if (plansData.status === 'fulfilled') {
          setPlans(Array.isArray(plansData.value) ? plansData.value : []);
        } else {
          setPlans([]);
        }

        if (statusData.status === 'fulfilled') {
          setHubBanner(statusData.value?.banner ?? null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const left = daysLeft(user?.trialEndsAt ?? null);
  const trialExpired = left !== null && left <= 0 && !user?.isPremium;

  const premiumBenefits = [
    { icon: Radar, title: 'Radar Premium', desc: 'Radar completo e prioridade para conexões compatíveis' },
    { icon: Video, title: 'Vídeos', desc: 'Assistir e postar vídeos com mais liberdade' },
    { icon: Calendar, title: 'Eventos', desc: 'Criar eventos e alcançar mais pessoas' },
    { icon: Lock, title: 'Recursos Premium', desc: 'Mais privacidade, mais alcance e recursos exclusivos' },
  ] as const;

  const performCheckout = async (planId: string) => {
    try {
      setIsCheckingOut(planId);
      setCheckoutResult(null);
      const result = await subscriptionsService.checkout(planId, 'PIX');
      if (result?.checkout) {
        setCheckoutResult(result.checkout);
      }
      const me = await authService.getMe();
      updateUser(me);
      toast({
        title: 'Cobrança gerada',
        description: result?.checkout?.pixCode ? 'Seu PIX já está pronto para pagamento.' : 'Seu checkout foi gerado com sucesso.',
      });
    } catch (error: any) {
      if (error?.response?.data?.error === 'billing_data_required') {
        setBillingPlanId(planId);
        setBillingDialogOpen(true);
        toast({
          title: 'Complete seus dados de cobranca',
          description: Array.isArray(error?.response?.data?.missingFields)
            ? `Faltam: ${error.response.data.missingFields.join(', ')}.`
            : 'Preencha seus dados de cobranca para gerar o PIX.',
          variant: 'destructive',
        });
        return;
      }
      toast({
        title: 'Falha ao iniciar assinatura',
        description: error?.response?.data?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingOut(null);
    }
  };

  const handleCheckout = async (planId: string) => {
    const missing = getMissingBillingFields(billingForm);
    if (missing.length > 0) {
      setBillingPlanId(planId);
      setBillingDialogOpen(true);
      return;
    }
    await performCheckout(planId);
  };

  const handleSaveBillingAndCheckout = async () => {
    const missing = getMissingBillingFields(billingForm);
    if (missing.length > 0) {
      toast({
        title: 'Dados incompletos',
        description: `Preencha: ${missing.map((item) => item.label).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingBilling(true);
      await profileService.updateProfile({
        ...billingForm,
        billingAddressState: billingForm.billingAddressState.toUpperCase().slice(0, 2),
      });
      const me = await authService.getMe();
      updateUser(me);
      setBillingDialogOpen(false);
      if (billingPlanId) {
        await performCheckout(billingPlanId);
      }
    } catch (error: any) {
      toast({
        title: 'Falha ao salvar dados',
        description: error?.response?.data?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingBilling(false);
    }
  };

  const copyPix = async () => {
    if (!checkoutResult?.pixCode && !checkoutResult?.pixPayload) return;
    const value = checkoutResult.pixCode || checkoutResult.pixPayload || '';
    await navigator.clipboard.writeText(value);
    toast({ title: 'PIX copiado', description: 'Cole o código no app do seu banco.' });
  };

  return (
    <div className="max-w-5xl mx-auto w-full">
      <Dialog open={billingDialogOpen} onOpenChange={setBillingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete seus dados de cobranca</DialogTitle>
            <DialogDescription>
              O Hub de pagamentos precisa destes dados antes de gerar o PIX da sua assinatura.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="billingDocument">CPF/CNPJ</Label>
              <Input id="billingDocument" value={billingForm.billingDocument} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingDocument: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingPhone">Telefone</Label>
              <Input id="billingPhone" value={billingForm.billingPhone} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingPhone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressZip">CEP</Label>
              <Input id="billingAddressZip" value={billingForm.billingAddressZip} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressZip: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressState">Estado</Label>
              <Input
                id="billingAddressState"
                maxLength={2}
                value={billingForm.billingAddressState}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressState: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="billingAddressStreet">Rua</Label>
              <Input id="billingAddressStreet" value={billingForm.billingAddressStreet} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressStreet: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressNumber">Numero</Label>
              <Input id="billingAddressNumber" value={billingForm.billingAddressNumber} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressNumber: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressDistrict">Bairro</Label>
              <Input id="billingAddressDistrict" value={billingForm.billingAddressDistrict} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressDistrict: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressCity">Cidade</Label>
              <Input id="billingAddressCity" value={billingForm.billingAddressCity} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressCity: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingAddressComplement">Complemento</Label>
              <Input id="billingAddressComplement" value={billingForm.billingAddressComplement} onChange={(e) => setBillingForm((prev) => ({ ...prev, billingAddressComplement: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBillingDialogOpen(false)} disabled={isSavingBilling}>
              Agora nao
            </Button>
            <Button onClick={handleSaveBillingAndCheckout} disabled={isSavingBilling}>
              {isSavingBilling ? 'Salvando...' : 'Salvar e gerar PIX'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        {hubBanner && (
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground">
            {hubBanner}
          </div>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground">Carregando...</p>}

      {!isLoading && (
        <div className="space-y-8">
          {checkoutResult && (
            <Card className="p-5 border-primary/30 bg-primary/5">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <Badge className="bg-gradient-primary">Checkout gerado</Badge>
                <span className="text-sm text-muted-foreground">
                  Status: <strong>{checkoutResult.status || 'pending'}</strong>
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Pague com PIX</h3>
                  <p className="text-sm text-muted-foreground">
                    Use o QR Code ou copie o código PIX para concluir sua assinatura.
                  </p>
                  {(checkoutResult.pixCode || checkoutResult.pixPayload) && (
                    <div className="rounded-xl border bg-background p-3 text-sm break-all">
                      {checkoutResult.pixCode || checkoutResult.pixPayload}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {(checkoutResult.pixCode || checkoutResult.pixPayload) && (
                      <Button onClick={copyPix} className="gap-2">
                        <Copy className="w-4 h-4" /> Copiar PIX
                      </Button>
                    )}
                    {checkoutResult.checkoutUrl && (
                      <Button variant="outline" asChild>
                        <a href={checkoutResult.checkoutUrl} target="_blank" rel="noreferrer" className="gap-2">
                          <ExternalLink className="w-4 h-4" /> Abrir checkout
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border bg-background/70 p-4 flex items-center justify-center min-h-52">
                  {checkoutResult.pixQrCode ? (
                    <img src={checkoutResult.pixQrCode} alt="QR Code PIX" className="max-h-48 w-auto object-contain" />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <QrCode className="w-10 h-10 mx-auto mb-2" />
                      QR Code indisponível neste checkout
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

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
              const highlighted = plan.price > 0;
              const isRecommended = (plan.intervalCount || 1) >= 12;
              const icon = plan.price <= 0 ? (
                <Zap className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Star className="w-5 h-5 text-gold" />
              );
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
                    </div>
                    <p className="text-sm text-muted-foreground">{plan.description || 'Plano oficial do Hub Billing'}</p>
                  </div>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">R$ {plan.price.toFixed(2).replace('.', ',')}</span>
                    <span className="text-muted-foreground">/{plan.interval}</span>
                  </div>
                  {!!plan.perks?.length && (
                    <div className="mb-5 text-sm text-muted-foreground">
                      {plan.perks.slice(0, 4).join(' • ')}
                    </div>
                  )}
                  <Button
                    className={cn('w-full', highlighted ? 'bg-gradient-primary hover:opacity-90 shadow-glow' : '')}
                    variant={highlighted ? 'default' : 'outline'}
                    disabled={isCheckingOut !== null}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {isCheckingOut === plan.id ? 'Gerando PIX...' : plan.price <= 0 ? 'Plano atual' : 'Assinar com PIX'}
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
