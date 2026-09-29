import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Copy, CreditCard, Loader2 } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { Button } from '@/components/ui/button';

type Info = {
  nome: string;
  licencaAte: string | null;
  ativo: boolean;
  precoCents: number;
  podePix: boolean;
  tokensCartao: number;
};

type Checkout = {
  checkoutUrl?: string | null;
  pixCode?: string | null;
  pixPayload?: string | null;
  pixQrCode?: string | null;
};

function normalizarQr(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^data:image\//i.test(raw)) return raw.replace(/\s+/g, '');
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^<svg[\s\S]*<\/svg>$/i.test(raw)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
  const compact = raw.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/=]+$/.test(compact)) return `data:image/png;base64,${compact}`;
  return raw;
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Página aberta pelo botão "Renovar com Pix" dos e-mails de renovação. Não
 * pede login: o link assinado só serve para gerar o Pix daquela conta. Gera o
 * Pix na hora e avisa quando o pagamento cai.
 */
export default function Renovar() {
  const [params] = useSearchParams();
  const t = params.get('t') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [renovadoAte, setRenovadoAte] = useState<string | null>(null);
  const licencaInicial = useRef<string | null>(null);
  const gerouUmaVez = useRef(false);

  const gerarPix = async () => {
    setGerando(true);
    setErro(null);
    try {
      const { data } = await apiClient.post('/public/renovar', { t });
      setCheckout(data.checkout || null);
    } catch (e: any) {
      const codigo = e?.response?.data?.error;
      setErro(
        codigo === 'precisa_entrar'
          ? 'precisa_entrar'
          : e?.response?.data?.message || 'Não conseguimos gerar o Pix agora. Tente de novo em instantes.'
      );
    } finally {
      setGerando(false);
    }
  };

  // Carrega quem é e, se fizer sentido, já gera o Pix.
  useEffect(() => {
    if (!t) { setErro('link_invalido'); return; }
    apiClient.get('/public/renovar', { params: { t } })
      .then(({ data }) => {
        setInfo(data);
        licencaInicial.current = data.licencaAte;
        const jaRenovou = data.ativo && data.licencaAte && new Date(data.licencaAte).getTime() > Date.now() + 7 * 86_400_000;
        if (jaRenovou) { setRenovadoAte(data.licencaAte); return; }
        if (!data.podePix) { setErro('precisa_entrar'); return; }
        if (!gerouUmaVez.current) { gerouUmaVez.current = true; void gerarPix(); }
      })
      .catch(() => setErro('link_invalido'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Enquanto o Pix está na tela, confere a cada 5s se o pagamento caiu.
  useEffect(() => {
    if (!checkout || renovadoAte) return;
    const id = window.setInterval(async () => {
      try {
        const { data } = await apiClient.get('/public/renovar', { params: { t } });
        const mudou = data.licencaAte && data.licencaAte !== licencaInicial.current;
        if (data.ativo && mudou) setRenovadoAte(data.licencaAte);
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 5000);
    return () => window.clearInterval(id);
  }, [checkout, renovadoAte, t]);

  const pixCode = checkout?.pixCode || checkout?.pixPayload || '';
  const qr = normalizarQr(checkout?.pixQrCode);
  const hosted = !pixCode && !qr && checkout?.checkoutUrl ? checkout.checkoutUrl : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch { /* navegador sem permissão: o código está visível para copiar à mão */ }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="flex justify-center">
          <img src="/icon-96.png" alt="NoSigilo.net" width={64} height={64} className="rounded-2xl shadow-[0_0_24px_rgba(236,72,153,0.4)]" />
        </div>

        {erro === 'link_invalido' ? (
          <div className="glass space-y-3 rounded-2xl p-6 text-center">
            <h1 className="text-xl font-bold">Este link expirou</h1>
            <p className="text-sm text-muted-foreground">Entre na sua conta para renovar o Premium — leva menos de um minuto.</p>
            <Button asChild className="h-12 w-full rounded-xl bg-gradient-primary text-base font-bold">
              <Link to="/login?next=/subscriptions">Entrar e renovar</Link>
            </Button>
          </div>
        ) : erro === 'precisa_entrar' ? (
          <div className="glass space-y-3 rounded-2xl p-6 text-center">
            <h1 className="text-xl font-bold">Falta só entrar na conta</h1>
            <p className="text-sm text-muted-foreground">Para este pagamento precisamos que você entre no NoSigilo.</p>
            <Button asChild className="h-12 w-full rounded-xl bg-gradient-primary text-base font-bold">
              <Link to="/login?next=/subscriptions">Entrar e renovar</Link>
            </Button>
          </div>
        ) : renovadoAte ? (
          <div className="glass space-y-3 rounded-2xl p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-7 w-7 text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold">Premium renovado! 🎉</h1>
            <p className="text-sm text-muted-foreground">Seu acesso vale até <strong className="text-foreground">{dataCurta(renovadoAte)}</strong>.</p>
            <Button asChild className="h-12 w-full rounded-xl bg-gradient-primary text-base font-bold">
              <Link to="/feed">Abrir o NoSigilo</Link>
            </Button>
          </div>
        ) : !info ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold">Renovar Premium</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {info.nome ? `${info.nome}, ` : ''}
                {info.ativo && info.licencaAte
                  ? `seu acesso vale até ${dataCurta(info.licencaAte)}.`
                  : 'seu Premium venceu.'}{' '}
                Pague {brl(info.precoCents)} no Pix e continue de onde parou.
              </p>
            </div>

            <div className="glass space-y-4 rounded-2xl p-5">
              {gerando || (!checkout && !erro) ? (
                <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-7 w-7 animate-spin" /> Gerando seu Pix…
                </div>
              ) : erro ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-destructive">{erro}</p>
                  <Button onClick={() => void gerarPix()} className="h-11 w-full rounded-xl">Tentar de novo</Button>
                </div>
              ) : hosted ? (
                <Button asChild className="h-12 w-full rounded-xl bg-gradient-primary text-base font-bold">
                  <a href={hosted}>Pagar {brl(info.precoCents)} agora</a>
                </Button>
              ) : (
                <>
                  {qr && (
                    <div className="flex justify-center">
                      <img src={qr} alt="QR Code do Pix" className="h-56 w-56 rounded-xl bg-white p-2" />
                    </div>
                  )}
                  {pixCode && (
                    <div className="space-y-2">
                      <p className="text-center text-xs text-muted-foreground">Ou copie o código e cole no app do seu banco:</p>
                      <div className="break-all rounded-xl border bg-secondary/30 p-3 font-mono text-[11px] text-muted-foreground">{pixCode}</div>
                      <Button onClick={() => void copiar()} className="h-12 w-full gap-2 rounded-xl bg-gradient-primary text-base font-bold">
                        {copiado ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                        {copiado ? 'Código copiado!' : 'Copiar código Pix'}
                      </Button>
                    </div>
                  )}
                  <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando o pagamento — esta tela avisa quando cair.
                  </p>
                </>
              )}
            </div>

            <Link
              to="/subscriptions"
              className="flex items-center gap-3 rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm"
            >
              <CreditCard className="h-6 w-6 shrink-0 text-violet-400" />
              <span>
                <strong className="block">Cansou de lembrar todo mês?</strong>
                <span className="text-muted-foreground">Pague no cartão: renova sozinho e você ganha {info.tokensCartao} tokens no primeiro pagamento.</span>
              </span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
