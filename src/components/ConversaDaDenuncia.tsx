import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

type Mensagem = { id: string; de: 'denunciante' | 'denunciado'; texto: string; em: string; apagada: boolean; viaRadar: boolean; midia: { url: string; tipo: 'foto' | 'video'; unica: boolean } | null };
type Conversa = { conversa: string | null; denunciante: { id: string; nome: string }; denunciado: { id: string; nome: string }; mensagens: Mensagem[] };

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Admin: a conversa entre quem denunciou e o denunciado, para entender o que
 * houve antes de moderar. Cada abertura fica registrada no servidor.
 */
export default function ConversaDaDenuncia({ reportId, onFechar }: { reportId: string | null; onFechar: () => void }) {
  const [dados, setDados] = useState<Conversa | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!reportId) return;
    setDados(null);
    setErro('');
    apiClient.get(`/admin/reports/${encodeURIComponent(reportId)}/conversa`)
      .then((r) => setDados(r.data))
      .catch(() => setErro('Não foi possível abrir a conversa.'));
  }, [reportId]);

  return (
    <Dialog open={!!reportId} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        <DialogTitle>Conversa da denúncia</DialogTitle>
        <DialogDescription>
          {dados ? <>Entre <b className="text-sky-600">{dados.denunciante.nome}</b> (denunciou) e <b className="text-rose-600">{dados.denunciado.nome}</b> (denunciado). Esta leitura fica registrada.</> : 'Carregando…'}
        </DialogDescription>
        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {dados && dados.mensagens.length === 0 && (
          <p className="text-sm text-muted-foreground">{dados.conversa ? 'A conversa existe, mas está vazia.' : 'Os dois nunca conversaram pelo chat.'}</p>
        )}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {dados?.mensagens.map((m) => (
            <div key={m.id} className={cn('flex', m.de === 'denunciado' ? 'justify-start' : 'justify-end')}>
              <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.de === 'denunciado' ? 'rounded-tl-sm bg-rose-500/10' : 'rounded-tr-sm bg-sky-500/10')}>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {m.de === 'denunciado' ? dados.denunciado.nome : dados.denunciante.nome} · {quando(m.em)}{m.viaRadar ? ' · via radar' : ''}{m.apagada ? ' · apagada' : ''}
                </p>
                {m.midia && (
                  <a href={resolveServerUrl(m.midia.url)} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary underline">
                    {m.midia.tipo === 'video' ? '🎥 vídeo' : '📸 foto'}{m.midia.unica ? ' (visualização única)' : ''}: abrir
                  </a>
                )}
                {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
