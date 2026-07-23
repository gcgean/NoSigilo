import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Send, Loader2, LifeBuoy } from 'lucide-react';
import { supportService, type SupportMessage } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Preenche o campo de mensagem ao abrir (usuário revisa/edita antes de enviar). */
  initialMessage?: string;
};

/**
 * Chat de suporte disponível para qualquer usuário (ex.: dúvida de pagamento no
 * PIX). Fala com o mesmo canal admin↔usuário de promoter_support_messages.
 * Overlay custom (não Radix Dialog) para evitar o freeze mobile conhecido e para
 * empilhar acima do modal do PIX (z-[90] > z-[80]).
 */
export default function SupportChatDialog({ open, onClose, initialMessage }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await supportService.getMessages();
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void load();
      if (initialMessage) setInput(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      await supportService.sendMessage(text);
      setInput('');
      await load();
    } catch {
      toast({ title: 'Não foi possível enviar', description: 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="flex h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border bg-background sm:h-[70vh] sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-tight">Falar com o suporte</p>
              <p className="text-[11px] text-muted-foreground">Respondemos por aqui assim que possível.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-2 overflow-y-auto bg-secondary/10 p-3">
          {isLoading && messages.length === 0 && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && messages.length === 0 && (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nenhuma mensagem ainda. Descreva sua dúvida — sobre pagamento ou qualquer outra coisa — que a equipe responde por aqui.
            </p>
          )}
          {messages.map((m) => {
            const fromSupport = m.senderType === 'admin';
            return (
              <div key={m.id} className={cn('flex', fromSupport ? 'justify-start' : 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                    fromSupport ? 'rounded-bl-sm border bg-card' : 'rounded-br-sm bg-primary text-primary-foreground'
                  )}
                >
                  {fromSupport && <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">Suporte NoSigilo</p>}
                  <p className="whitespace-pre-wrap break-words">{m.message}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="flex shrink-0 items-end gap-2 border-t bg-background p-3">
          <textarea
            className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Escreva sua mensagem..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); }
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isSending}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
