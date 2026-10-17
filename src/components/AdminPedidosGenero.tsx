import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { resolveServerUrl } from '@/utils/serverUrl';
import { trocaGeneroService, type PedidoTrocaGenero } from '@/services/api';

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/**
 * Admin › Usuários: pedidos de troca do tipo de perfil. A pessoa explica o
 * motivo; o admin aprova (o tipo muda na hora) ou recusa (com motivo opcional).
 */
export default function AdminPedidosGenero() {
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<PedidoTrocaGenero[]>([]);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');

  const carregar = () => trocaGeneroService.listarPendentes().then((d) => setPedidos(d.requests)).catch(() => {});
  useEffect(() => { void carregar(); }, []);

  const decidir = async (p: PedidoTrocaGenero, acao: 'approve' | 'reject') => {
    setOcupado(p.id);
    try {
      await trocaGeneroService.decidir(p.id, acao, acao === 'reject' ? motivoRecusa.trim() || undefined : undefined);
      toast({ title: acao === 'approve' ? `${p.name} agora é "${p.requestedGender}"` : 'Pedido recusado', description: 'A pessoa foi avisada nas notificações.' });
      setRecusando(null);
      setMotivoRecusa('');
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
      <h3 className="mb-1 font-semibold">Pedidos de troca de tipo de perfil ({pedidos.length})</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        O tipo de perfil muda quem vê a pessoa. Aprovar não dá dias grátis novos; mulher só ganha acesso livre verificando com selfie.
      </p>
      <div className="space-y-2">
        {pedidos.map((p) => (
          <div key={p.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start gap-3">
              {/* Foto e nome abrem o perfil em outra aba (o painel fica onde estava). */}
              <a href={`/users/${p.userId}`} target="_blank" rel="noopener noreferrer" title="Ver perfil" className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary ring-primary/40 hover:ring-2">
                {p.avatar ? (
                  <img src={resolveServerUrl(p.avatar)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">{(p.name || '?')[0]}</div>
                )}
              </a>
              <div className="min-w-0 flex-1">
                <a href={`/users/${p.userId}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-primary hover:underline">
                  {p.name || 'Sem nome'} ↗
                </a>
                <p className="text-sm">
                  <span className="text-muted-foreground line-through">{p.currentGender || '—'}</span>
                  <span className="mx-2">→</span>
                  <span className="font-semibold">{p.requestedGender}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.email || 'sem e-mail'} · {p.premium ? 'assinante' : 'sem assinatura'} · conta de {dataHora(p.userCreatedAt)} · pediu em {dataHora(p.createdAt)}
                </p>
                <p className="mt-2 rounded-lg bg-secondary/40 p-2 text-sm">“{p.reason}”</p>
                {p.suspeito && (
                  <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                    ⚠️ Homem pedindo para virar {p.requestedGender}. Homem paga desde o cadastro; confira se não é para usar de graça (fotos do perfil, conversas, se já pediu antes). Aprovar NÃO dá dias grátis: {String(p.requestedGender).startsWith('Mulher') ? 'como mulher, só ganha acesso livre se passar pela verificação com selfie.' : 'o prazo continua o mesmo de antes.'}
                    {p.pedidosAnteriores ? ` Já fez ${p.pedidosAnteriores} pedido(s) antes.` : ''}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={ocupado === p.id} onClick={() => void decidir(p, 'approve')}>
                  {ocupado === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aprovar'}
                </Button>
                <Button size="sm" variant="outline" disabled={ocupado === p.id} onClick={() => { setRecusando(recusando === p.id ? null : p.id); setMotivoRecusa(''); }}>
                  Recusar
                </Button>
              </div>
            </div>
            {recusando === p.id && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={motivoRecusa}
                  onChange={(e) => setMotivoRecusa(e.target.value)}
                  placeholder="Motivo da recusa (opcional — a pessoa vê na notificação)"
                  maxLength={300}
                  rows={2}
                />
                <Button size="sm" variant="destructive" disabled={ocupado === p.id} onClick={() => void decidir(p, 'reject')}>Confirmar recusa</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
