import { useEffect, useState } from 'react';
import { Coins, Gift, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { tokenService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const QUICK_AMOUNTS = [10, 25, 50, 100];

export default function GiftTokensModal({
  open,
  onClose,
  recipientId,
  recipientName,
}: {
  open: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
}) {
  const { toast } = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setMessage('');
    tokenService.me().then((s) => setBalance(s.points)).catch(() => setBalance(null));
  }, [open]);

  const amountNum = Math.floor(Number(amount) || 0);
  const canSend =
    amountNum > 0 &&
    balance !== null &&
    amountNum <= balance &&
    !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await tokenService.gift(recipientId, amountNum, message);
      setBalance(res.balance);
      // Atualiza o saldo no header (TokenBadge) em outras partes do app
      window.dispatchEvent(new Event('nosigilo:tokens-updated'));
      toast({
        title: '🎁 Presente enviado!',
        description: `Você presenteou ${recipientName || 'o perfil'} com ${amountNum} token${amountNum > 1 ? 's' : ''}.`,
      });
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Não foi possível enviar o presente.';
      toast({ title: 'Erro ao presentear', description: msg, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Presentear tokens
          </DialogTitle>
          <DialogDescription>
            Envie tokens para <strong className="text-foreground">{recipientName || 'este perfil'}</strong>.
            Ele recebe uma notificação com seu presente e mensagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Saldo */}
          <div className="flex items-center justify-between rounded-lg bg-amber-400/10 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Seu saldo</span>
            <span className="flex items-center gap-1 font-bold text-amber-400">
              <Coins className="h-4 w-4" />
              {balance === null ? '...' : `${balance} pts`}
            </span>
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Quantos tokens?</label>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(String(q))}
                  disabled={balance !== null && q > balance}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                    amountNum === q
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="Outro valor"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {balance !== null && amountNum > balance && (
              <p className="text-xs text-destructive">Saldo insuficiente.</p>
            )}
          </div>

          {/* Mensagem */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Mensagem (opcional)</label>
            <Textarea
              placeholder="Escreva algo para acompanhar o presente..."
              value={message}
              maxLength={280}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="text-right text-[11px] text-muted-foreground">{message.length}/280</p>
          </div>

          <Button className="w-full gap-2" disabled={!canSend} onClick={() => void handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            {sending ? 'Enviando...' : `Presentear${amountNum > 0 ? ` ${amountNum}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
