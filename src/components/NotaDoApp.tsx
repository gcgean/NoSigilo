import { useEffect, useState } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { notaDoAppService, type MotivoNota } from '@/services/api';
import { cn } from '@/lib/utils';

const CHAVE_ADIADO = 'nosigilo:nota-adiada-em';
const DIAS_ADIAMENTO = 14;

/**
 * "Quantas estrelas você dá para o NoSigilo?" (1 a 5) com campo de sugestão.
 *
 * Estrelas desde 13/11/2026: no celular eram 11 botões apertados de 0 a 10.
 * Internamente a nota continua de 0 a 10 (estrelas × 2), então as faixas do
 * painel seguem iguais: 1–3 estrelas = 2–6 (detrator), 4 = 8, 5 = 10.
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
      <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain rounded-2xl border border-primary/25 bg-background p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold">
            {pedidoDeMotivo
              ? `Você deu ${Math.max(1, Math.round(pedidoDeMotivo.nota / 2))} ${Math.max(1, Math.round(pedidoDeMotivo.nota / 2)) === 1 ? 'estrela' : 'estrelas'} para o NoSigilo. O que mais te incomodou?`
              : 'Quantas estrelas você dá para o NoSigilo?'}
          </p>
          {/* 44 px de área de toque (antes eram 16 px). */}
          <button type="button" onClick={adiar} aria-label="Agora não" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!pedidoDeMotivo && (<>
        {/* 5 estrelas grandes; a nota enviada é estrelas × 2 (0 a 10). */}
        <div className="mt-3 flex items-center justify-between gap-1" role="radiogroup" aria-label="Estrelas">
          {[1, 2, 3, 4, 5].map((e) => {
            const acesa = nota !== null && e * 2 <= nota;
            return (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={nota === e * 2}
                aria-label={`${e} ${e === 1 ? 'estrela' : 'estrelas'}`}
                onClick={() => setNota(e * 2)}
                className="flex h-14 w-14 items-center justify-center rounded-2xl transition-transform active:scale-95 hover:bg-muted/60"
              >
                <Star className={cn('h-10 w-10 transition-colors', acesa ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50')} />
              </button>
            );
          })}
        </div>
        <p className="mt-1 h-5 text-center text-sm font-medium text-muted-foreground">
          {nota === null ? 'Toque numa estrela' : ['', 'Péssimo', 'Ruim', 'Mais ou menos', 'Bom', 'Ótimo!'][Math.max(1, Math.round(nota / 2))]}
        </p>
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
                    'min-h-10 rounded-full px-3.5 py-2 text-sm transition-colors',
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
            {/* text-base (16 px): abaixo disso o iPhone dá zoom na tela ao tocar. */}
            <textarea
              value={sugestao}
              onChange={(e) => setSugestao(e.target.value.slice(0, 1000))}
              onFocus={(e) => { const alvo = e.currentTarget; window.setTimeout(() => alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300); }}
              rows={3}
              placeholder={nota <= 6 ? 'Quer contar mais? (opcional) Queremos corrigir.' : 'Tem alguma sugestão para a plataforma?'}
              className="mt-3 w-full rounded-xl border border-input bg-background p-3 text-base md:text-sm"
            />
            <button
              type="button"
              onClick={() => void enviar()}
              disabled={enviando || (!!pedidoDeMotivo && motivos.length === 0 && !sugestao.trim())}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-3 text-base font-semibold text-white disabled:opacity-60 md:min-h-10 md:text-sm"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar
            </button>
          </>
        )}
        <button type="button" onClick={adiar} className="mt-2 flex min-h-11 w-full items-center justify-center text-sm text-muted-foreground hover:text-foreground">
          Agora não
        </button>
      </div>
    </div>
  );
}
