import { useEffect, useState } from 'react';
import { Inbox, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminPedidosService, type RelatorioPedidos, type ResumoPedidos } from '@/services/api';

const PERIODOS = [7, 14, 30, 90];
const TIPOS: Record<string, string> = { mulher: 'Mulheres', casal: 'Casais', homem: 'Homens', outros: 'Outros perfis' };

const pct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}%`);
const horas = (h: number | null) => (h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString('pt-BR')} h` : `${Math.round(h / 24)} dias`);

/** Barra empilhada: aceitos, excluídos, ignorados, aguardando. */
function Barra({ r }: { r: ResumoPedidos }) {
  const partes = [
    { v: r.aceitos, cls: 'bg-emerald-500', nome: 'Aceitos' },
    { v: r.excluidos, cls: 'bg-red-500', nome: 'Excluídos' },
    { v: r.ignorados, cls: 'bg-zinc-400', nome: 'Ignorados' },
    { v: r.aguardando, cls: 'bg-amber-400', nome: 'Aguardando' },
  ];
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {partes.map((p) => (
        <div key={p.nome} className={p.cls} style={{ width: `${r.total ? (p.v / r.total) * 100 : 0}%` }} title={`${p.nome}: ${p.v}`} />
      ))}
    </div>
  );
}

/**
 * Pedidos de contato (aba Métricas): quantos são aceitos, excluídos, ignorados
 * e se o destaque pago com tokens aumenta a chance de resposta.
 */
export default function AdminPedidos() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<RelatorioPedidos | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    adminPedidosService.relatorio(dias)
      .then((d) => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setDados(null); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [dias]);

  const g = dados?.geral;
  return (
    <Card className="mt-6 p-5 glass">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Inbox className="h-4 w-4 text-primary" /> Pedidos de contato</h3>
        <div className="flex gap-1">
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={cn('min-h-[32px] rounded-full px-3 text-xs font-semibold', dias === d ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground')}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Mensagens de desconhecidos que caíram em "Pedidos". Ignorado = sem resposta há mais de 7 dias. A taxa de aceite é sobre os já decididos (aceitos + excluídos + ignorados).
      </p>

      {carregando ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !dados || !g || g.total === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nenhum pedido de contato no período ainda.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { rotulo: 'Pedidos', valor: g.total.toLocaleString('pt-BR'), cls: '' },
              { rotulo: 'Aceitos', valor: `${g.aceitos} · ${pct(g.taxaAceite)}`, cls: 'text-emerald-600' },
              { rotulo: 'Excluídos', valor: String(g.excluidos), cls: 'text-red-500' },
              { rotulo: 'Ignorados', valor: String(g.ignorados), cls: 'text-zinc-500' },
              { rotulo: 'Aguardando', valor: String(g.aguardando), cls: 'text-amber-600' },
            ].map((k) => (
              <div key={k.rotulo} className="rounded-xl bg-secondary/30 p-3">
                <p className="text-[11px] text-muted-foreground">{k.rotulo}</p>
                <p className={cn('text-lg font-bold', k.cls)}>{k.valor}</p>
              </div>
            ))}
          </div>
          <div>
            <Barra r={g} />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              <span className="text-emerald-600">■</span> aceitos · <span className="text-red-500">■</span> excluídos · <span className="text-zinc-400">■</span> ignorados · <span className="text-amber-500">■</span> aguardando · metade dos aceites acontece em até <strong>{horas(g.medianaHorasAteAceitar)}</strong>
            </p>
          </div>

          {/* Destaque com tokens: vende e funciona? */}
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <p className="mb-2 text-sm font-semibold">⭐ Destaque do pedido</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Destaques vendidos</p>
                <p className="text-lg font-bold">{dados.destaque.vendidos} <span className="text-xs font-normal text-muted-foreground">({dados.destaque.tokensGastos} tokens)</span></p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Aceite COM destaque</p>
                <p className="text-lg font-bold text-amber-600">{pct(dados.comDestaque.taxaAceite)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Aceite SEM destaque</p>
                <p className="text-lg font-bold">{pct(dados.semDestaque.taxaAceite)}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Se o aceite com destaque for bem maior, o destaque vale o preço; se for parecido, ele não está ajudando quem paga.</p>
          </div>

          {/* Por tipo de perfil de quem recebe */}
          <div className="grid gap-2 sm:grid-cols-2">
            {dados.porTipo.map((t) => (
              <div key={t.tipo} className="rounded-xl border p-3">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <p className="text-sm font-semibold">{TIPOS[t.tipo] ?? t.tipo} recebendo</p>
                  <p className="text-xs text-muted-foreground">{t.total} pedidos · aceite {pct(t.taxaAceite)}</p>
                </div>
                <Barra r={t} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
