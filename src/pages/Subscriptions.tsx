import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Crown, Gift, QrCode, Star, Users, Zap, Radar, Video, Calendar, Lock, ExternalLink, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { subscriptionsService, authService, invitesService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { hasPremiumAccess } from '@/utils/premium';
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

function normalizePixQrCode(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw.replace(/\s+/g, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^<svg[\s\S]*<\/svg>$/i.test(raw)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
  const compact = raw.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(compact)) return `data:image/png;base64,${compact}`;
  return raw;
}

function getCheckoutErrorMessage(error: any) {
  const data = error?.response?.data;
  if (typeof data === 'string' && data.trim()) {
    const raw = data.trim();
    if (/<!DOCTYPE html/i.test(raw) || /<html[\s>]/i.test(raw)) {
      if (/502/i.test(raw) || /bad gateway/i.test(raw)) return 'O servidor retornou 502 Bad Gateway ao iniciar a assinatura.';
      return 'O servidor retornou uma resposta inesperada ao iniciar a assinatura.';
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  if (typeof error?.message === 'string' && error.message.trim()) return error.message;
  return 'Tente novamente em instantes.';
}

const premiumBenefits = [
  { icon: Radar, title: 'Radar Premium', desc: 'Avise quem está na cidade e receba alertas compatíveis' },
  { icon: Video, title: 'Vídeos', desc: 'Assista e publique vídeos com mais liberdade' },
  { icon: Calendar, title: 'Eventos', desc: 'Crie eventos e alcance mais pessoas' },
  { icon: Lock, title: 'Privacidade+', desc: 'Mais controle, mais alcance e recursos exclusivos' },
] as const;

export default function Subscriptions() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const pixCardRef = useRef<HTMLDivElement>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutPayload | null>(null);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState<boolean | null>(null);
  const [referralValidated, setReferralValidated] = useState<number | null>(null);
  const [hubBanner, setHubBanner] = useState<string | null>(user?.hubBanner ?? null);
  const preCheckoutLicenseRef = useRef<string | null>(null);

  // Billing form (inline, no dialog)
  const [billingLegalName, setBillingLegalName] = useState('');
  const [billingDocument, setBillingDocument] = useState('');

  const isPaid = String(checkoutResult?.status || '').toLowerCase() === 'paid';
  const isPending = String(checkoutResult?.status || '').toLowerCase() === 'pending';
  const qrImageSrc = normalizePixQrCode(checkoutResult?.pixQrCode);
  const hasPixCode = !!(checkoutResult?.pixCode || checkoutResult?.pixPayload);
  const pixCodeValue = checkoutResult?.pixCode || checkoutResult?.pixPayload || '';
  // Gateways de checkout hospedado (ex.: LivePix) não retornam PIX inline — só a URL
  // para onde o cliente é redirecionado. Nesses casos exibimos o botão "Pagar agora"
  // em vez do QR/código.
  const hostedCheckoutUrl = String(checkoutResult?.checkoutUrl || '').trim();
  const useHostedCheckout = !hasPixCode && !qrImageSrc && !!hostedCheckoutUrl;

  // Load plans and status
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
          const allPlans = Array.isArray(plansData.value) ? plansData.value : [];
          setPlans(allPlans);
          // Auto-select recommended plan (longest interval or first paid)
          const paid = allPlans.filter((p) => p.price > 0);
          const recommended = paid.find((p) => (p.intervalCount || 1) >= 12) || paid[0];
          if (recommended) setSelectedPlanId(recommended.id);
        }

        if (statusData.status === 'fulfilled') {
          const status = statusData.value;
          setHubBanner(status?.banner ?? null);
          if (typeof status?.subscriptionsEnabled === 'boolean') {
            setSubscriptionsEnabled(status.subscriptionsEnabled);
            updateUser({ subscriptionsEnabled: status.subscriptionsEnabled });
          } else {
            setSubscriptionsEnabled(true);
          }
          const me = await authService.getMe();
          if (!cancelled) updateUser(me);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  // Referral progress
  useEffect(() => {
    invitesService.getRewardProgress()
      .then((d) => setReferralValidated(d.validatedCount))
      .catch(() => setReferralValidated(0));
  }, []);

  // Poll payment status every 5s while pending
  useEffect(() => {
    if (!isPending) return;
    const id = window.setInterval(() => void refreshPaymentStatus(true), 5000);
    return () => window.clearInterval(id);
  }, [isPending]);

  // Re-check on tab focus while pending
  useEffect(() => {
    if (!isPending) return;
    const handler = () => { if (document.visibilityState === 'visible') void refreshPaymentStatus(true); };
    window.addEventListener('focus', handler);
    document.addEventListener('visibilitychange', handler);
    return () => { window.removeEventListener('focus', handler); document.removeEventListener('visibilitychange', handler); };
  }, [isPending]);

  // Scroll to PIX card after checkout
  useEffect(() => {
    if (checkoutResult) {
      setTimeout(() => pixCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, [!!checkoutResult]);

  const refreshPaymentStatus = async (silent = false) => {
    try {
      setIsRefreshingStatus(true);
      const status = await subscriptionsService.getStatus();
      setHubBanner(status?.banner ?? null);
      const me = await authService.getMe();
      updateUser(me);

      const newLicenseEnd = status?.licenseEndAt || me?.hubLicenseEndAt || null;
      const preLicense = preCheckoutLicenseRef.current;
      const licenseExtended = !!newLicenseEnd && (!preLicense || new Date(newLicenseEnd) > new Date(preLicense));

      const normalizedAccessStatus = String(status?.accessStatus || me?.hubAccessStatus || '').toLowerCase();
      const isLicensed = normalizedAccessStatus === 'licensed' || status?.canAccess === true;
      const hasNewPayment = isLicensed && licenseExtended;

      if (hasNewPayment) {
        preCheckoutLicenseRef.current = newLicenseEnd;
        setCheckoutResult((prev) => prev ? { ...prev, status: 'paid' } : prev);
        if (!silent) toast({ title: 'Pagamento confirmado! 🎉', description: 'Sua assinatura foi ativada com sucesso.' });
      } else if (!silent) {
        toast({ title: 'Pagamento ainda pendente', description: 'Ainda não recebemos a confirmação. Tente novamente.' });
      }
    } catch {
      if (!silent) toast({ title: 'Falha ao atualizar status', variant: 'destructive' });
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleGeneratePix = async () => {
    if (!selectedPlanId) return;
    if (!billingLegalName.trim() || !billingDocument.trim()) {
      toast({ title: 'Preencha nome e CPF/CNPJ', variant: 'destructive' });
      return;
    }
    setIsCheckingOut(true);
    setCheckoutResult(null);
    preCheckoutLicenseRef.current = user?.hubLicenseEndAt ?? null;
    try {
      const result = await subscriptionsService.checkout(selectedPlanId, 'PIX', {
        billingLegalName: billingLegalName.trim(),
        billingDocument: billingDocument.trim(),
        billingPersonType: 'PF',
      });
      if (result?.checkout) setCheckoutResult(result.checkout);
      const me = await authService.getMe();
      updateUser(me);
      toast({ title: 'PIX gerado!', description: 'Escaneie o QR Code ou copie o código.' });
    } catch (error: any) {
      if (error?.response?.data?.error === 'subscriptions_disabled') updateUser({ subscriptionsEnabled: false });
      toast({ title: 'Falha ao gerar PIX', description: getCheckoutErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const copyPix = async () => {
    await navigator.clipboard.writeText(pixCodeValue);
    toast({ title: '✅ PIX copiado!', description: 'Cole o código no app do seu banco para pagar.' });
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const paidPlans = plans.filter((p) => p.price > 0);

  // Preço mensal de destaque — menor preço por mês entre os planos (fallback 9,90).
  const monthlyPrices = paidPlans
    .map((p) => p.price / Math.max(1, p.intervalCount || 1))
    .filter((v) => v > 0);
  const headlinePrice = monthlyPrices.length ? Math.min(...monthlyPrices) : 9.9;
  const headlinePriceLabel = headlinePrice.toFixed(2).replace('.', ',');

  // Premium ATIVO = pago e ainda não vencido. Um assinante vencido (is_premium=1
  // mas licença expirada) deixa de ser "ativo" → mostra "Regularize", não "Você já é Premium".
  const isPremiumActive = !!user?.isPremium && hasPremiumAccess(user);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6 pb-10">

      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <Badge className="bg-gradient-primary gap-1">
          <Crown className="w-3 h-3" /> Premium
        </Badge>
        <h1 className="text-2xl font-bold">
          {isPremiumActive ? 'Renove seu NoSigilo Premium' : 'Assine o NoSigilo Premium'}
        </h1>
        <p className="text-sm text-muted-foreground">Desbloqueie radar, vídeos, eventos e muito mais</p>
      </div>

      {/* Destaque de preço — "custa somente R$ 9,90" */}
      {!isLoading && subscriptionsEnabled === true && (
        <div className="rounded-2xl border-2 border-gold/40 bg-gradient-to-r from-gold/15 via-primary/5 to-violet-500/10 px-5 py-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Acesso completo por apenas
          </p>
          <p className="mt-0.5 text-4xl font-extrabold text-foreground">
            R$ {headlinePriceLabel}
            <span className="text-base font-medium text-muted-foreground">/mês</span>
          </p>
          <p className="mt-1 text-sm font-medium text-primary">
            Menos que um lanche — cancele quando quiser, sem fidelidade.
          </p>
        </div>
      )}

      {/* Status premium ativo — pode renovar/estender mesmo já sendo Premium */}
      {!isLoading && isPremiumActive && (
        <Card className="border-gold/40 bg-gold/10 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/20 text-2xl">👑</div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">Você já é Premium!</p>
              <p className="text-xs text-muted-foreground">
                {user?.hubLicenseEndAt
                  ? <>Ativo até <strong>{new Date(user.hubLicenseEndAt).toLocaleDateString('pt-BR')}</strong>. Renove a qualquer momento para estender.</>
                  : 'Aproveite todos os recursos. Você pode renovar quando quiser.'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/feed')} className="shrink-0 gap-1">
              Feed <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Banner */}
      {hubBanner && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">{hubBanner}</div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && subscriptionsEnabled === false && (
        <Card className="border-emerald-300/60 bg-emerald-50/80 p-6 text-center">
          <Badge className="mb-3 bg-emerald-600 text-white">Acesso livre</Badge>
          <p className="text-sm text-emerald-700">As assinaturas estão desativadas no momento. Todos têm acesso premium gratuito.</p>
        </Card>
      )}

      {!isLoading && subscriptionsEnabled === true && (
        <>
          {/* ── PIX Card (shown after generating) ────────────────────────── */}
          {checkoutResult && (
            <div ref={pixCardRef}>
              <Card className={cn(
                'p-5 border-2',
                isPaid ? 'border-emerald-400/60 bg-emerald-50/60' : 'border-primary/30 bg-primary/5'
              )}>
                {isPaid ? (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                    <div>
                      <h2 className="text-xl font-bold text-emerald-700">Pagamento confirmado! 🎉</h2>
                      <p className="text-sm text-muted-foreground mt-1">Sua assinatura está sendo ativada. Atualize a página em instantes.</p>
                    </div>
                    <Button onClick={() => void refreshPaymentStatus()} disabled={isRefreshingStatus} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                      <RefreshCw className={cn('w-4 h-4', isRefreshingStatus && 'animate-spin')} />
                      Ativar minha conta
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Badge className="bg-gradient-primary">Pague com PIX</Badge>
                      <span className="text-sm text-muted-foreground">Aprovação em segundos</span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                      {/* Left: code + buttons */}
                      <div className="space-y-3">
                        {hasPixCode && (
                          <div className="rounded-xl border bg-background p-3 text-xs break-all leading-relaxed max-h-28 overflow-y-auto">
                            {pixCodeValue}
                          </div>
                        )}
                        {useHostedCheckout && (
                          <Button
                            onClick={() => window.open(hostedCheckoutUrl, '_blank', 'noopener,noreferrer')}
                            className="w-full gap-2 h-12 text-base font-bold bg-gradient-to-r from-rose-500 via-primary to-violet-500 hover:opacity-90"
                          >
                            <ExternalLink className="w-5 h-5" /> Pagar agora
                          </Button>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {hasPixCode && (
                            <Button onClick={copyPix} className="gap-2 bg-gradient-primary flex-1 sm:flex-none">
                              <Copy className="w-4 h-4" /> Copiar código PIX
                            </Button>
                          )}
                          <Button variant="outline" onClick={() => void refreshPaymentStatus()} disabled={isRefreshingStatus} className="gap-2 flex-1 sm:flex-none">
                            <RefreshCw className={cn('w-4 h-4', isRefreshingStatus && 'animate-spin')} />
                            {isRefreshingStatus ? 'Verificando...' : 'Já paguei'}
                          </Button>
                        </div>
                        {!useHostedCheckout && checkoutResult.checkoutUrl && (
                          <a href={checkoutResult.checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                            <ExternalLink className="w-3 h-3" /> Abrir página de checkout
                          </a>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {useHostedCheckout
                            ? 'Clique em "Pagar agora" para abrir a página segura de pagamento. Depois volte aqui e clique em "Já paguei".'
                            : 'Abra o app do seu banco → Pix → Pagar → Cole o código ou escaneie o QR Code.'}
                        </p>
                      </div>

                      {/* Right: QR Code — oculto no checkout hospedado (sem QR inline) */}
                      {!useHostedCheckout && (
                        <div className="flex items-center justify-center sm:justify-end">
                          {qrImageSrc ? (
                            <img src={qrImageSrc} alt="QR Code PIX" className="w-40 h-40 rounded-xl border bg-white object-contain p-1" />
                          ) : (
                            <div className="w-40 h-40 rounded-xl border bg-background flex flex-col items-center justify-center gap-2 text-muted-foreground">
                              <QrCode className="w-10 h-10" />
                              <span className="text-xs text-center">QR indisponível</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Card>
            </div>
          )}

          {/* ── Checkout form ────────────────────────────────────────────── */}
          {!checkoutResult && (
            <Card className="p-6 border-2 border-primary/20 space-y-5">
              <div className="space-y-1">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Crown className="w-5 h-5 text-gold" /> Gerar PIX de pagamento
                </h2>
                <p className="text-sm text-muted-foreground">Escolha o plano, preencha seus dados e gere o PIX. Aprovação imediata.</p>
              </div>

              {/* Plan selector */}
              {paidPlans.length > 1 && (
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${paidPlans.length}, 1fr)` }}>
                  {paidPlans.map((plan) => {
                    const isRec = (plan.intervalCount || 1) >= 12;
                    const sel = selectedPlanId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={cn(
                          'relative rounded-2xl border-2 p-4 text-left transition-all',
                          sel ? 'border-primary bg-primary/10 shadow-glow' : 'border-border hover:border-primary/50 bg-background'
                        )}
                      >
                        {isRec && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-rose-500 to-primary px-2.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
                            Melhor valor
                          </span>
                        )}
                        <p className="font-semibold text-sm">{plan.name}</p>
                        <p className="text-2xl font-bold mt-1">
                          R$ {plan.price.toFixed(2).replace('.', ',')}
                          <span className="text-xs font-normal text-muted-foreground">/{plan.interval}</span>
                        </p>
                        {sel && <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Single plan display */}
              {paidPlans.length === 1 && selectedPlan && (
                <div className="flex items-center justify-between rounded-2xl border-2 border-primary bg-primary/10 px-5 py-4">
                  <div>
                    <p className="font-semibold">{selectedPlan.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedPlan.description || 'Acesso premium completo'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">R$ {selectedPlan.price.toFixed(2).replace('.', ',')}</p>
                    <p className="text-xs text-muted-foreground">/{selectedPlan.interval}</p>
                  </div>
                </div>
              )}

              {/* Billing fields */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="billingLegalName">Nome completo</Label>
                  <Input
                    id="billingLegalName"
                    placeholder="Como no documento"
                    value={billingLegalName}
                    onChange={(e) => setBillingLegalName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billingDocument">CPF ou CNPJ</Label>
                  <Input
                    id="billingDocument"
                    placeholder="000.000.000-00"
                    value={billingDocument}
                    onChange={(e) => setBillingDocument(e.target.value)}
                  />
                </div>
              </div>

              {/* Generate PIX button */}
              <Button
                className="w-full py-6 text-base font-bold bg-gradient-to-r from-rose-500 via-primary to-violet-500 hover:opacity-90 shadow-glow gap-2"
                disabled={isCheckingOut || !selectedPlanId || !billingLegalName.trim() || !billingDocument.trim()}
                onClick={() => void handleGeneratePix()}
              >
                {isCheckingOut ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Gerando PIX...</>
                ) : (
                  <><QrCode className="w-5 h-5" /> Gerar PIX agora</>
                )}
              </Button>
            </Card>
          )}

          {/* New checkout button (after PIX generated) */}
          {checkoutResult && !isPaid && (
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setCheckoutResult(null)}>
              Trocar plano ou gerar novo PIX
            </Button>
          )}

          {/* Benefits */}
          <div className="grid grid-cols-2 gap-3">
            {premiumBenefits.map((b) => (
              <div key={b.title} className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <b.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{b.title}</p>
                  <p className="text-xs text-muted-foreground leading-snug">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Referral alternative */}
          {referralValidated !== null && (
            <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 p-4 flex items-center gap-4">
              <Gift className="w-8 h-8 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Prefere de graça? Convide 3 amigos</p>
                <p className="text-xs text-muted-foreground">
                  {referralValidated >= 3 ? '🎉 Meta atingida! Resgate seu prêmio.' : `${referralValidated}/3 validados — faltam ${3 - referralValidated}`}
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0 border-emerald-400/40 text-emerald-600 hover:bg-emerald-500/10" onClick={() => navigate('/invites')}>
                <Users className="w-3.5 h-3.5 mr-1" />
                {referralValidated >= 3 ? 'Resgatar' : 'Convidar'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
