import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { notaDoAppService, type MotivoNota } from '@/services/api';
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
  // Nota baixa: motivos de 1 toque (a lista vem do servidor).
  const [opcoes, setOpcoes] = useState<MotivoNota[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  // Deu nota baixa antes sem dizer por quê: pergunta só o motivo, uma vez.
  const [pedidoDeMotivo, setPedidoDeMotivo] = useState<{ id: string; nota: number } | null>(null);
  const alternarMotivo = (id: string) =>
    setMotivos((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.length < 4 ? [...m, id] : m));

  useEffect(() => {
    if (!user?.id) return;
    try {
      const adiado = localStorage.getItem(CHAVE_ADIADO);
      if (adiado && Date.now() - new Date(adiado).getTime() < DIAS_ADIAMENTO * 24 * 60 * 60 * 1000) return;
    } catch { /* segue */ }
    const t = window.setTimeout(() => {
      void notaDoAppService.pendente()
        .then((r) => {
          setOpcoes(r?.motivos ?? []);
          if (r?.perguntar) setAberto(true);
          else if (r?.perguntarMotivo) { setPedidoDeMotivo(r.perguntarMotivo); setNota(r.perguntarMotivo.nota); setAberto(true); }
        })
        .catch(() => undefined);
    }, 20_000); // deixa a pessoa usar antes de perguntar
    return () => window.clearTimeout(t);
  }, [user?.id]);

  const adiar = () => {
    try { localStorage.setItem(CHAVE_ADIADO, new Date().toISOString()); } catch { /* ok */ }
    // Pedido de motivo dispensado não volta: avisa o servidor.
    if (pedidoDeMotivo) void notaDoAppService.motivo(pedidoDeMotivo.id, []).catch(() => undefined);
    setAberto(false);
  };

  const enviar = async () => {
    if (nota === null) return;
    setEnviando(true);
    try {
      if (pedidoDeMotivo) await notaDoAppService.motivo(pedidoDeMotivo.id, motivos, sugestao.trim() || undefined);
      else await notaDoAppService.enviar(nota, sugestao.trim() || undefined, nota <= 6 ? motivos : undefined);
      try { localStorage.setItem(CHAVE_ADIADO, new Date().toISOString()); } catch { /* ok */ }
      setAberto(false);
      toast({
        title: pedidoDeMotivo ? 'Obrigado por contar! 💜' : 'Obrigado pela nota! 💜',
        description: nota <= 6 ? 'Vamos olhar o que você contou com atenção.' : 'Sua opinião ajuda a melhorar a plataforma.',
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
          <p className="text-sm font-semibold">
            {pedidoDeMotivo
              ? `Você deu nota ${pedidoDeMotivo.nota} para o NoSigilo. O que mais te incomodou?`
              : 'De 0 a 10, quanto você indicaria o NoSigilo para um amigo?'}
          </p>
          <button type="button" onClick={adiar} aria-label="Agora não" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!pedidoDeMotivo && (<>
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
        </>)}

        {nota !== null && nota <= 6 && opcoes.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Toque no que mais pesou (pode marcar mais de um):</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {opcoes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => alternarMotivo(m.id)}
                  aria-pressed={motivos.includes(m.id)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs transition-colors',
                    motivos.includes(m.id)
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  )}
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
          </div>
        )}

        {nota !== null && (
          <>
            <textarea
              value={sugestao}
              onChange={(e) => setSugestao(e.target.value.slice(0, 1000))}
              rows={2}
              placeholder={nota <= 6 ? 'Quer contar mais? (opcional) Queremos corrigir.' : 'Tem alguma sugestão para a plataforma?'}
              className="mt-3 w-full rounded-xl border border-input bg-background p-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || (!!pedidoDeMotivo && motivos.length === 0 && !sugestao.trim())}
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
