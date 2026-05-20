import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, QrCode, Copy, RefreshCw, Crown, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { subscriptionsService, authService } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Plan = {
  id: string;
  name: string;
  price: number;
  interval: string;
  intervalCount?: number;
  description?: string | null;
};

type CheckoutPayload = {
  status?: string | null;
  checkoutUrl?: string | null;
  pixCode?: string | null;
  pixQrCode?: string | null;
  pixPayload?: string | null;
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

function getErrorMessage(error: any) {
  const data = error?.response?.data;
  if (typeof data?.message === 'string') return data.message;
  if (typeof data?.error === 'string') return data.error;
  if (typeof error?.message === 'string') return error.message;
  return 'Tente novamente em instantes.';
}

type Props = { open: boolean; onClose: () => void };

export default function SubscribeModal({ open, onClose }: Props) {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const pixRef = useRef<HTMLDivElement>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingLegalName, setBillingLegalName] = useState('');
  const [billingDocument, setBillingDocument] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutPayload | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isPaid = String(checkout?.status || '').toLowerCase() === 'paid';
  const isPending = String(checkout?.status || '').toLowerCase() === 'pending';
  const pixCode = checkout?.pixCode || checkout?.pixPayload || '';
  const qrSrc = normalizePixQrCode(checkout?.pixQrCode);

  // Load plans when modal opens
  useEffect(() => {
    if (!open) return;
    setIsLoadingPlans(true);
    setCheckout(null);
    subscriptionsService.getPlans()
      .then((data: any) => {
        const all: Plan[] = Array.isArray(data) ? data : [];
        const paid = all.filter((p) => p.price > 0);
        setPlans(paid);
        const rec = paid.find((p) => (p.intervalCount || 1) >= 12) || paid[0];
        if (rec) setSelectedPlanId(rec.id);
      })
      .catch(() => setPlans([]))
      .finally(() => setIsLoadingPlans(false));
  }, [open]);

  // Scroll to PIX after generating
  useEffect(() => {
    if (checkout) setTimeout(() => pixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }, [!!checkout]);

  // Poll while pending
  useEffect(() => {
    if (!isPending) return;
    const id = window.setInterval(() => void refreshStatus(true), 5000);
    return () => window.clearInterval(id);
  }, [isPending]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const refreshStatus = async (silent = false) => {
    setIsRefreshing(true);
    try {
      const status = await subscriptionsService.getStatus();
      const me = await authService.getMe();
      updateUser(me);
      const normalizedStatus = String(status?.accessStatus || me?.hubAccessStatus || '').toLowerCase();
      const active = normalizedStatus === 'licensed' || status?.canAccess === true || !!me?.isPremium;
      if (active) {
        setCheckout((prev) => prev ? { ...prev, status: 'paid' } : prev);
        if (!silent) toast({ title: '🎉 Pagamento confirmado!', description: 'Sua assinatura foi ativada.' });
      } else if (!silent) {
        toast({ title: 'Pagamento ainda pendente', description: 'Aguardando confirmação do banco.' });
      }
    } catch {
      if (!silent) toast({ title: 'Falha ao verificar', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGeneratePix = async () => {
    if (!selectedPlanId || !billingLegalName.trim() || !billingDocument.trim()) {
      toast({ title: 'Preencha nome e CPF/CNPJ', variant: 'destructive' });
      return;
    }
    setIsCheckingOut(true);
    setCheckout(null);
    try {
      const result = await subscriptionsService.checkout(selectedPlanId, 'PIX', {
        billingLegalName: billingLegalName.trim(),
        billingDocument: billingDocument.trim(),
        billingPersonType: 'PF',
      });
      if (result?.checkout) setCheckout(result.checkout);
      const me = await authService.getMe();
      updateUser(me);
      toast({ title: 'PIX gerado!', description: 'Escaneie o QR Code ou copie o código.' });
    } catch (error: any) {
      toast({ title: 'Falha ao gerar PIX', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const copyPix = async () => {
    await navigator.clipboard.writeText(pixCode);
    toast({ title: '✅ PIX copiado!', description: 'Cole no app do seu banco para pagar.' });
  };

  const handlePremiumActivated = () => {
    onClose();
    navigate('/feed');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-background shadow-2xl overflow-hidden">
        {/* Gradient strip */}
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-rose-500 via-primary to-violet-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-gold" />
            <span className="font-bold text-base">Assine o Premium</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Loading */}
          {isLoadingPlans && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {/* No plans */}
          {!isLoadingPlans && plans.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">Nenhum plano disponível no momento.</p>
          )}

          {!isLoadingPlans && plans.length > 0 && (
            <>
              {/* PIX result */}
              {checkout && (
                <div ref={pixRef}>
                  {isPaid ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                      <div>
                        <h2 className="text-xl font-bold text-emerald-700">Pagamento confirmado! 🎉</h2>
                        <p className="text-sm text-muted-foreground mt-1">Sua assinatura está sendo ativada.</p>
                      </div>
                      <Button onClick={handlePremiumActivated} className="gap-2 bg-emerald-600 hover:bg-emerald-700 w-full">
                        <RefreshCw className="w-4 h-4" /> Ativar minha conta
                      </Button>
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-gradient-primary text-xs">Pix gerado</Badge>
                        <span className="text-xs text-muted-foreground">Aprovação imediata após pagamento</span>
                      </div>

                      {/* QR Code */}
                      {qrSrc && (
                        <div className="flex justify-center">
                          <img src={qrSrc} alt="QR Code PIX" className="w-48 h-48 rounded-xl border bg-white object-contain p-2" />
                        </div>
                      )}

                      {/* PIX code */}
                      {pixCode && (
                        <div className="rounded-xl border bg-background p-3 text-xs break-all leading-relaxed max-h-20 overflow-y-auto text-muted-foreground">
                          {pixCode}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="grid gap-2">
                        {pixCode && (
                          <Button onClick={copyPix} className="w-full gap-2 bg-gradient-to-r from-rose-500 via-primary to-violet-500 hover:opacity-90 font-bold">
                            <Copy className="w-4 h-4" /> Copiar código PIX
                          </Button>
                        )}
                        <Button variant="outline" onClick={() => void refreshStatus()} disabled={isRefreshing} className="w-full gap-2">
                          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
                          {isRefreshing ? 'Verificando...' : 'Já paguei — verificar'}
                        </Button>
                      </div>

                      <p className="text-xs text-muted-foreground text-center">
                        Abra o app do banco → Pix → Pagar → Cole o código ou escaneie o QR
                      </p>

                      <button
                        type="button"
                        onClick={() => setCheckout(null)}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Trocar plano ou gerar novo PIX
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Checkout form */}
              {!checkout && (
                <>
                  {/* Plan selector */}
                  {plans.length > 1 ? (
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)` }}>
                      {plans.map((plan) => {
                        const isRec = (plan.intervalCount || 1) >= 12;
                        const sel = selectedPlanId === plan.id;
                        return (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={cn(
                              'relative rounded-2xl border-2 p-3 text-left transition-all',
                              sel ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 bg-background'
                            )}
                          >
                            {isRec && (
                              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-rose-500 to-primary px-2 py-0.5 text-[9px] font-bold text-white whitespace-nowrap">
                                Melhor valor
                              </span>
                            )}
                            <p className="font-semibold text-xs">{plan.name}</p>
                            <p className="text-xl font-bold mt-0.5">
                              R$ {plan.price.toFixed(2).replace('.', ',')}
                            </p>
                            <p className="text-[10px] text-muted-foreground">/{plan.interval}</p>
                          </button>
                        );
                      })}
                    </div>
                  ) : plans.length === 1 && (
                    <div className="flex items-center justify-between rounded-2xl border-2 border-primary bg-primary/10 px-4 py-3">
                      <div>
                        <p className="font-semibold text-sm">{plans[0].name}</p>
                        <p className="text-xs text-muted-foreground">{plans[0].description || 'Acesso premium completo'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">R$ {plans[0].price.toFixed(2).replace('.', ',')}</p>
                        <p className="text-xs text-muted-foreground">/{plans[0].interval}</p>
                      </div>
                    </div>
                  )}

                  {/* Billing fields */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sb-name">Nome completo do titular</Label>
                      <Input
                        id="sb-name"
                        placeholder="Como no documento"
                        value={billingLegalName}
                        onChange={(e) => setBillingLegalName(e.target.value)}
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sb-doc">CPF ou CNPJ</Label>
                      <Input
                        id="sb-doc"
                        placeholder="000.000.000-00"
                        value={billingDocument}
                        onChange={(e) => setBillingDocument(e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                  </div>

                  {/* Generate PIX */}
                  <Button
                    className="w-full py-6 text-base font-bold bg-gradient-to-r from-rose-500 via-primary to-violet-500 hover:opacity-90 gap-2"
                    disabled={isCheckingOut || !selectedPlanId || !billingLegalName.trim() || !billingDocument.trim()}
                    onClick={() => void handleGeneratePix()}
                  >
                    {isCheckingOut ? (
                      <><RefreshCw className="w-5 h-5 animate-spin" /> Gerando PIX...</>
                    ) : (
                      <><QrCode className="w-5 h-5" /> Gerar PIX agora</>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Pagamento seguro via PIX • Aprovação imediata
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
