import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { resolveServerUrl } from '@/utils/serverUrl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Admin: tudo o que aconteceu na Casa, noite por noite (fica 90 dias). */
type Noite = { noite: string; mensagens: number; midias: number; falaram: number; pessoas: number; cabines: number; reservas: number };
type Linha = {
  id: string; sala: string; tipo: string; texto: string; criadoEm: string;
  autor: { id: string; nome: string; genero: string } | null;
  midia: { url: string; mime: string; vistas: number } | null;
};

const NOME_SALA: Record<string, string> = { salao: '🍸 Salão', casais: '💑 Casais', quarto: '🖤 Quarto Escuro', glory: '🕳️ Glory Hole' };
const nomeDaSala = (s: string) => NOME_SALA[s] ?? (s.startsWith('cab:') ? '🚪 Cabine' : s);
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function HistoricoDaCasa() {
  const [noites, setNoites] = useState<Noite[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [cabines, setCabines] = useState<{ criadoEm: string; a: string; b: string }[]>([]);
  const [sala, setSala] = useState<string>('todas');
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    apiClient.get('/casa/admin/noites').then((r) => setNoites(r.data.noites ?? [])).catch(() => {});
  }, []);

  const abrir = async (noite: string) => {
    if (aberta === noite) { setAberta(null); return; }
    setAberta(noite);
    setCarregando(true);
    try {
      const { data } = await apiClient.get(`/casa/admin/noites/${encodeURIComponent(noite)}`);
      setLinhas(data.mensagens ?? []);
      setCabines(data.cabines ?? []);
    } finally {
      setCarregando(false);
    }
  };

  const visiveis = linhas.filter((l) => sala === 'todas' || l.sala === sala || (sala === 'cabines' && l.sala.startsWith('cab:')));
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-fuchsia-500" />
        <p className="font-semibold">Histórico da Casa</p>
        <span className="text-xs text-muted-foreground">tudo o que aconteceu, por noite (90 dias)</span>
      </div>
      {noites.length === 0 && <p className="text-xs text-muted-foreground">Ainda não houve nenhuma noite.</p>}
      {noites.map((n) => (
        <div key={n.noite} className="rounded-xl border">
          <button type="button" onClick={() => void abrir(n.noite)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left text-xs">
            <span className="text-sm font-semibold">{n.noite.replace('extra-', 'Extra ')}</span>
            <span>👥 {n.pessoas} entraram</span>
            <span>💬 {n.mensagens} mensagens</span>
            <span>🗣️ {n.falaram} falaram</span>
            <span>📸 {n.midias} mídias</span>
            <span>🚪 {n.cabines} cabines</span>
            <span>🎟️ {n.reservas} reservas</span>
          </button>
          {aberta === n.noite && (
            <div className="space-y-2 border-t p-3">
              <div className="flex flex-wrap gap-1.5">
                {['todas', 'salao', 'casais', 'quarto', 'glory', 'cabines'].map((s) => (
                  <Button key={s} size="sm" variant={sala === s ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setSala(s)}>
                    {s === 'todas' ? 'Todas as salas' : s === 'cabines' ? '🚪 Cabines' : NOME_SALA[s]}
                  </Button>
                ))}
              </div>
              {cabines.length > 0 && (
                <div className="rounded-lg bg-muted/40 p-2 text-xs">
                  <p className="mb-1 font-semibold">🚪 Cabines abertas</p>
                  {cabines.map((c, i) => <p key={i}>{hora(c.criadoEm)} · {c.a} ↔ {c.b}</p>)}
                </div>
              )}
              {carregando && <p className="text-xs text-muted-foreground">Carregando…</p>}
              <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                {visiveis.map((l) => (
                  <div key={l.id} className={cn('rounded-lg px-2 py-1 text-xs', l.tipo === 'lola' ? 'bg-fuchsia-500/10' : l.tipo === 'sistema' ? 'text-muted-foreground' : 'bg-muted/40')}>
                    <span className="text-muted-foreground">{hora(l.criadoEm)} · {nomeDaSala(l.sala)} · </span>
                    <b>{l.tipo === 'lola' ? 'Lola (IA)' : l.autor ? `${l.autor.nome} (${l.autor.genero || '?'})` : ''}</b>{' '}
                    <span className="whitespace-pre-line">{l.texto}</span>
                    {l.midia && (
                      <div className="mt-1">
                        {l.midia.mime.startsWith('video/')
                          ? <video src={resolveServerUrl(l.midia.url)} controls preload="none" className="max-h-60 rounded" />
                          : <img src={resolveServerUrl(l.midia.url)} alt="" loading="lazy" className="max-h-60 rounded" />}
                        <p className="text-[10px] text-muted-foreground">aberta por {l.midia.vistas} pessoa(s)</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
