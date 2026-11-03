import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { reportsService } from '@/services/api';
import { reportReasons } from '@/components/ReportDialog';
import { cn } from '@/lib/utils';

/**
 * Denúncia de story DENTRO do visualizador ("Não ver mais e denunciar").
 *
 * O visualizador fica em z-[9995], acima do Dialog comum (ReportDialog), por
 * isso este painel é desenhado por cima do próprio story, como o de "seus
 * tokens acabaram". Mesmos motivos e a mesma rota /api/reports.
 */
type Props = {
  storyId: string;
  autorNome: string;
  onFechar: (enviada: boolean) => void;
};

export default function DenunciaStoryPainel({ storyId, autorNome, onFechar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [detalhes, setDetalhes] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const precisaDetalhar = motivo === 'other';
  const podeEnviar = !!motivo && (!precisaDetalhar || detalhes.trim().length >= 5) && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro('');
    try {
      await reportsService.submit({ targetType: 'story', targetId: storyId, targetName: autorNome, reason: motivo, details: detalhes.trim() || undefined });
      onFechar(true);
    } catch {
      setErro('Não deu para enviar agora. Tente de novo.');
      setEnviando(false);
    }
  };

  // Não deixa o toque vazar para os gestos de avançar/voltar do story.
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="absolute inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && !enviando) onFechar(false); }}
      onPointerDown={parar}
      onPointerUp={parar}
      onTouchStart={parar}
    >
      <div className="w-full max-w-sm rounded-2xl bg-background p-4 text-foreground shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-semibold"><Flag className="h-4 w-4 text-destructive" /> Denunciar story</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Você já não vê mais os stories de {autorNome}. Conte o motivo para a equipe analisar — {autorNome} não fica sabendo quem denunciou.
            </p>
          </div>
          <button type="button" onClick={() => onFechar(false)} disabled={enviando} className="rounded-full p-1 text-muted-foreground hover:bg-secondary" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          {reportReasons.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setMotivo(r.id)}
              className={cn(
                'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                motivo === r.id ? 'border-destructive bg-destructive/10 font-medium' : 'hover:bg-secondary'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {(precisaDetalhar || motivo) && (
          <textarea
            value={detalhes}
            onChange={(e) => setDetalhes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={precisaDetalhar ? 'Explique o que aconteceu (obrigatório)' : 'Quer contar mais alguma coisa? (opcional)'}
            className="mt-3 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-destructive/40"
          />
        )}
        {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onFechar(false)} disabled={enviando} className="rounded-xl border py-2.5 text-sm font-medium hover:bg-secondary">
            Só ocultar
          </button>
          <button
            type="button"
            onClick={() => void enviar()}
            disabled={!podeEnviar}
            className="rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {enviando ? 'Enviando...' : 'Enviar denúncia'}
          </button>
        </div>
      </div>
    </div>
  );
}
