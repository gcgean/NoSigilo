import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { notaDoAppService } from '@/services/api';
import { cn } from '@/lib/utils';

const CHAVE_ADIADO = 'nosigilo:nota-adiada-em';
const DIAS_ADIAMENTO = 14;

/**
 * "De 0 a 10, quanto você indicaria o NoSigilo?" com campo de sugestão.
 *
 * Aparece no rodapé, sem travar a tela. Só para contas com mais de 7 dias, no
 * máximo uma vez a cada 90 dias, e quem dispensa só é perguntado de novo daqui
 * a duas semanas.
 */
export default function NotaDoApp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [sugestao, setSugestao] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const adiado = localStorage.getItem(CHAVE_ADIADO);
      if (adiado && Date.now() - new Date(adiado).getTime() < DIAS_ADIAMENTO * 24 * 60 * 60 * 1000) return;
    } catch { /* segue */ }
    const t = window.setTimeout(() => {
      void notaDoAppService.pendente()
        .then((r) => { if (r?.perguntar) setAberto(true); })
        .catch(() => undefined);
    }, 20_000); // deixa a pessoa usar antes de perguntar
    return () => window.clearTimeout(t);
  }, [user?.id]);

  const adiar = () => {
    try { localStorage.setItem(CHAVE_ADIADO, new Date().toISOString()); } catch { /* ok */ }
    setAberto(false);
  };

  const enviar = async () => {
    if (nota === null) return;
    setEnviando(true);
    try {
      await notaDoAppService.enviar(nota, sugestao.trim() || undefined);
      try { localStorage.setItem(CHAVE_ADIADO, new Date().toISOString()); } catch { /* ok */ }
      setAberto(false);
      toast({
        title: 'Obrigado pela nota! 💜',
        description: nota <= 6 ? 'Vamos olhar o que você escreveu com atenção.' : 'Sua opinião ajuda a melhorar a plataforma.',
      });
    } catch {
      toast({ title: 'Não foi possível enviar agora', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[60] md:left-auto md:right-6 md:w-96">
      <div className="rounded-2xl border border-primary/25 bg-background p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">De 0 a 10, quanto você indicaria o NoSigilo para um amigo?</p>
          <button type="button" onClick={adiar} aria-label="Agora não" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNota(n)}
              className={cn(
                'rounded-md py-1.5 text-xs font-semibold transition-colors',
                nota === n
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Não indicaria</span>
          <span>Indicaria com certeza</span>
        </div>

        {nota !== null && (
          <>
            <textarea
              value={sugestao}
              onChange={(e) => setSugestao(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder={nota <= 6 ? 'O que mais te incomoda? Queremos corrigir.' : 'Tem alguma sugestão para a plataforma?'}
              className="mt-3 w-full rounded-xl border border-input bg-background p-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
