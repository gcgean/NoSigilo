import { useEffect, useRef, useState } from 'react';
import { Check, Coins, Copy, CreditCard, Loader2, QrCode } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { tokenService, type PacoteTokens } from '@/services/api';

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

/**
 * Comprar tokens (tela de Tokens). Tokens comprados servem para destacar
 * pedidos de contato, destacar o perfil e presentear — não viram dias grátis.
 */
export default function ComprarTokens({ aoCreditar }: { aoCreditar?: () => void }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [pacotes, setPacotes] = useState<PacoteTokens[]>([]);
  const [disponivel, setDisponivel] = useState(false);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<'PIX' | 'CREDIT_CARD'>('PIX');
  const [gerando, setGerando] = useState(false);
  const [compra, setCompra] = useState<{ id: string; pix?: string; qr?: string | null } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const ancora = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tokenService.pacotes().then((r) => {
      setDisponivel(r.disponivel);
      setPacotes(r.pacotes);
      setEscolhido(r.pacotes.find((p) => p.maisVendido)?.id ?? r.pacotes[0]?.id ?? null);
    }).catch(() => setDisponivel(false));
  }, []);

  // Voltou do pagamento com cartão (?compra=id) ou veio do "comprar" do chat.
  useEffect(() => {
    const id = params.get('compra');
    if (id) setCompra({ id });
    if (params.get('comprar')) window.setTimeout(() => ancora.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [params]);

  // Confere a compra a cada 4s até o pagamento cair.
  useEffect(() => {
    if (!compra?.id) return;
    const t = window.setInterval(async () => {
      try {
        const r = await tokenService.statusCompra(compra.id);
        if (r.status === 'paga') {
          window.clearInterval(t);
          setCompra(null);
          if (params.get('compra')) { params.delete('compra'); setParams(params, { replace: true }); }
          toast({ title: `+${r.tokens} tokens na sua conta 🪙`, description: 'Pagamento confirmado.' });
          aoCreditar?.();
        }
      } catch { /* tenta de novo */ }
    }, 4000);
    return () => window.clearInterval(t);
  }, [compra?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const comprar = async () => {
    if (!escolhido) return;
    setGerando(true);
    try {
      const r = await tokenService.comprar(escolhido, metodo);
      const pix = r.checkout?.pixCode || r.checkout?.pixPayload || '';
      const qr = normalizarQr(r.checkout?.pixQrCode);
      if (pix || qr) {
        setCompra({ id: r.compraId, pix, qr });
      } else if (r.checkout?.checkoutUrl) {
        setCompra({ id: r.compraId });
        window.location.href = r.checkout.checkoutUrl;
      } else {
        throw new Error('Não foi possível abrir o pagamento.');
      }
    } catch (e: any) {
      toast({ title: 'Não foi possível gerar o pagamento', description: e?.response?.data?.message || e?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setGerando(false);
    }
  };

  if (!disponivel || pacotes.length === 0) return null;

  return (
    <Card ref={ancora} className="space-y-4 border-amber-400/30 bg-gradient-to-br from-amber-500/10 via-background to-primary/10 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Coins className="h-5 w-5 text-amber-400" /> Comprar tokens</h2>
        <p className="text-xs text-muted-foreground">
          Use para <strong className="text-foreground">destacar pedidos de contato</strong> (20 tokens), destacar seu perfil (30) ou presentear alguém. Tokens comprados não viram dias grátis.
        </p>
      </div>

      {compra && (compra.pix || compra.qr) ? (
        <div className="space-y-3 rounded-xl border bg-background/70 p-4 text-center">
          {compra.qr && <img src={compra.qr} alt="QR Code do Pix" className="mx-auto h-52 w-52 rounded-xl bg-white p-2" />}
          {compra.pix && (
            <>
              <div className="break-all rounded-lg border bg-secondary/30 p-2 font-mono text-[11px] text-muted-foreground">{compra.pix}</div>
              <Button
                className="h-11 w-full gap-2 bg-gradient-primary"
                onClick={async () => { try { await navigator.clipboard.writeText(compra.pix!); setCopiado(true); window.setTimeout(() => setCopiado(false), 2500); } catch { /* visível para copiar */ } }}
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Código copiado!' : 'Copiar código Pix'}
              </Button>
            </>
          )}
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando o pagamento — os tokens caem sozinhos.
          </p>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setCompra(null)}>Escolher outro pacote</button>
        </div>
      ) : compra ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border bg-background/70 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirmando seu pagamento…
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {pacotes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEscolhido(p.id)}
                className={cn(
                  'relative rounded-xl border-2 p-3 text-left transition-colors',
                  escolhido === p.id ? 'border-amber-400 bg-amber-400/10' : 'border-border bg-background/60 hover:border-amber-400/50'
                )}
              >
                {p.maisVendido && (
                  <span className="absolute -top-2.5 right-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">Mais vendido</span>
                )}
                <p className="text-2xl font-extrabold text-amber-500">{p.tokens} <span className="text-sm font-semibold">tokens</span></p>
                <p className="text-sm font-semibold">{brl(p.valorCents)}</p>
                <p className="text-[11px] text-muted-foreground">{Math.floor(p.tokens / 20)} destaques de pedido</p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([['PIX', 'Pix', QrCode], ['CREDIT_CARD', 'Cartão', CreditCard]] as const).map(([v, rotulo, Icone]) => (
              <button
                key={v}
                type="button"
                onClick={() => setMetodo(v)}
                className={cn(
                  'flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 text-sm font-semibold',
                  metodo === v ? 'border-primary bg-primary/10 text-brand-pink' : 'border-border text-muted-foreground'
                )}
              >
                <Icone className="h-4 w-4" /> {rotulo}
              </button>
            ))}
          </div>

          <Button className="h-12 w-full bg-gradient-primary text-base font-bold" disabled={!escolhido || gerando} onClick={() => void comprar()}>
            {gerando ? <Loader2 className="h-5 w-5 animate-spin" /> : `Comprar ${pacotes.find((p) => p.id === escolhido)?.tokens ?? ''} tokens`}
          </Button>
        </>
      )}
    </Card>
  );
}
