import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { cn } from '@/lib/utils';

type Mensagem = { id: string; de: 'denunciante' | 'denunciado'; texto: string; em: string; apagada: boolean; viaRadar: boolean; midia: { url: string; tipo: 'foto' | 'video'; unica: boolean } | null };
type Conversa = { conversa: string | null; ehQuemDenunciou?: boolean; denunciante: { id: string; nome: string }; denunciado: { id: string; nome: string }; mensagens: Mensagem[] };
type ItemDaLista = { id: string; com: { id: string; nome: string; genero: string | null }; mensagens: number; doDenunciado: number; ultima: string | null; ehQuemDenunciou: boolean };

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Admin: as conversas do denunciado. Primeiro a lista de com quem ele falou (quem
 * denunciou aparece no topo); tocar abre a conversa. Cada conversa aberta fica
 * registrada no servidor.
 */
export default function ConversaDaDenuncia({ reportId, onFechar }: { reportId: string | null; onFechar: () => void }) {
  const [lista, setLista] = useState<ItemDaLista[] | null>(null);
  const [aberta, setAberta] = useState<Conversa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!reportId) return;
    setLista(null);
    setAberta(null);
    setErro('');
    apiClient.get(`/admin/reports/${encodeURIComponent(reportId)}/conversas`)
      .then((r) => setLista(r.data.conversas ?? []))
      .catch(() => setErro('Não foi possível carregar as conversas.'));
  }, [reportId]);

  const abrir = (conversaId: string) => {
    if (!reportId) return;
    setCarregando(true);
    setErro('');
    apiClient.get(`/admin/reports/${encodeURIComponent(reportId)}/conversa`, { params: { conversa: conversaId } })
      .then((r) => setAberta(r.data))
      .catch(() => setErro('Não foi possível abrir a conversa.'))
      .finally(() => setCarregando(false));
  };

  return (
    <Dialog open={!!reportId} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
        {aberta ? (
          <>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAberta(null)} className="rounded-full p-1 hover:bg-muted" aria-label="Voltar para a lista">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <DialogTitle className="truncate">{aberta.denunciado.nome} × {aberta.denunciante.nome}</DialogTitle>
            </div>
            <DialogDescription>
              <b className="text-rose-600">{aberta.denunciado.nome}</b> é o denunciado
              {aberta.ehQuemDenunciou ? <> · <b className="text-sky-600">{aberta.denunciante.nome}</b> fez a denúncia</> : null}. Esta leitura fica registrada.
            </DialogDescription>
            {aberta.mensagens.length === 0 && <p className="text-sm text-muted-foreground">Conversa sem mensagens.</p>}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {aberta.mensagens.map((m) => (
                <div key={m.id} className={cn('flex', m.de === 'denunciado' ? 'justify-start' : 'justify-end')}>
                  <div className={cn('max-w-[80%] rounded-2xl px-3 py-2 text-sm', m.de === 'denunciado' ? 'rounded-tl-sm bg-rose-500/10' : 'rounded-tr-sm bg-sky-500/10')}>
                    <p className="text-[10px] font-semibold text-muted-foreground">
                      {m.de === 'denunciado' ? aberta.denunciado.nome : aberta.denunciante.nome} · {quando(m.em)}{m.viaRadar ? ' · via radar' : ''}{m.apagada ? ' · apagada' : ''}
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
          </>
        ) : (
          <>
            <DialogTitle>Conversas do denunciado</DialogTitle>
            <DialogDescription>Com quem ele falou no chat. Toque para ler; cada conversa aberta fica registrada.</DialogDescription>
            {lista === null && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
            {lista && lista.length === 0 && <p className="text-sm text-muted-foreground">Esse perfil não tem conversas com mensagens.</p>}
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {lista?.map((c) => (
                <button key={c.id} type="button" disabled={carregando} onClick={() => abrir(c.id)}
                  className={cn('flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm hover:bg-muted/60', c.ehQuemDenunciou && 'border-sky-500/50 bg-sky-500/5')}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.com.nome}{c.ehQuemDenunciou ? ' · fez a denúncia' : ''}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.com.genero ?? ''}{c.ultima ? ` · última em ${quando(c.ultima)}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {c.mensagens} msg<br />{c.doDenunciado} dele
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        {erro && <p className="text-sm text-destructive">{erro}</p>}
      </DialogContent>
    </Dialog>
  );
}
