import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';
import { verificacaoService, type PedidoVerificacao } from '@/services/api';

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/**
 * Admin › Usuários: pedidos de verificação. Compare a selfie (com o código
 * escrito à mão) com as fotos do perfil. Aprovar dá selo + acesso vitalício.
 */
export default function AdminVerificacoes() {
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<PedidoVerificacao[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const carregar = () => verificacaoService.listarPendentes().then((d) => setPedidos(d.pedidos)).catch(() => {});
  useEffect(() => { void carregar(); }, []);

  const decidir = async (p: PedidoVerificacao, acao: 'aprovar' | 'recusar') => {
    setOcupado(p.id);
    try {
      await verificacaoService.decidir(p.id, acao, acao === 'recusar' ? motivo.trim() || undefined : undefined);
      toast({ title: acao === 'aprovar' ? `${p.nome} verificada ✔` : 'Verificação recusada', description: 'Ela foi avisada nas notificações.' });
      setRecusando(null);
      setMotivo('');
      await carregar();
    } catch (e: any) {
      toast({ title: 'Não foi possível concluir', description: e?.response?.data?.message || 'Tente de novo.', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  if (pedidos.length === 0) return null;

  return (
    <div className="glass mb-4 rounded-xl p-6">
      <h3 className="mb-1 flex items-center gap-2 font-semibold"><BadgeCheck className="h-5 w-5 fill-sky-500 text-white" /> Pedidos de verificação ({pedidos.length})</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        A selfie precisa mostrar o rosto e o papel com o código escrito à mão, e bater com as fotos do perfil. Aprovar dá o selo de verificada e acesso grátis para sempre.
      </p>
      <div className="space-y-3">
        {pedidos.map((p) => (
          <div key={p.id} className="rounded-xl border p-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-semibold">{p.nome} <span className="text-xs font-normal text-muted-foreground">· {p.genero || '—'}</span></p>
                <p className="text-xs text-muted-foreground">{p.email || 'sem e-mail'} · conta de {dataHora(p.contaDesde)} · enviou em {dataHora(p.enviadoEm)}</p>
              </div>
              <p className="rounded-lg bg-primary/10 px-2 py-1 font-mono text-sm font-bold text-primary">Código: {p.codigo}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Selfie com o código</p>
                {p.selfie ? (
                  <button type="button" onClick={() => setAmpliada(resolveServerUrl(p.selfie!))}>
                    <img src={resolveServerUrl(p.selfie)} alt="Selfie" className="h-48 w-36 rounded-lg object-cover ring-2 ring-primary" />
                  </button>
                ) : <p className="text-xs">sem foto</p>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Fotos do perfil</p>
                <div className="flex flex-wrap gap-2">
                  {p.fotosDoPerfil.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma foto pública no perfil.</p>}
                  {p.fotosDoPerfil.map((f) => (
                    <button key={f} type="button" onClick={() => setAmpliada(resolveServerUrl(f))}>
                      <img src={resolveServerUrl(f)} alt="" className="h-24 w-20 rounded-lg object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={ocupado === p.id} onClick={() => void decidir(p, 'aprovar')}>
                {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprovar verificação'}
              </Button>
              <Button size="sm" variant="outline" disabled={ocupado === p.id} onClick={() => { setRecusando(recusando === p.id ? null : p.id); setMotivo(''); }}>Recusar</Button>
            </div>
            {recusando === p.id && (
              <div className="mt-2 space-y-2">
                <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ela vê na notificação). Ex.: o código não aparece na foto." maxLength={300} rows={2} />
                <Button size="sm" variant="destructive" disabled={ocupado === p.id} onClick={() => void decidir(p, 'recusar')}>Confirmar recusa</Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {ampliada && (
        <button type="button" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setAmpliada(null)} aria-label="Fechar">
          <img src={ampliada} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}
