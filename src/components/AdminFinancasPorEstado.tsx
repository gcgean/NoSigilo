import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { financasEstadoService, type FinancaEstado, type FinancasPorEstado } from '@/services/api';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const PERIODOS = [30, 90, 365];

type Item = { uf: string; valor: string; destaque: boolean; linha1: string; linha2: string };

/** Grade de cartões por UF, no mesmo visual de "Estados em crescimento". */
function GradeUf({ itens, tom }: { itens: Item[]; tom: 'verde' | 'vermelho' }) {
  const [todos, setTodos] = useState(false);
  if (itens.length === 0) return <p className="mt-4 text-sm text-muted-foreground">Nada no período.</p>;
  const visiveis = todos ? itens : itens.slice(0, 15);
  return (
    <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((it, i) => (
          <div
            key={it.uf}
            className={cn(
              'rounded-xl border p-3',
              tom === 'vermelho'
                ? 'border-red-400/25 bg-red-500/10'
                : it.destaque ? 'border-orange-400/30 bg-orange-500/10' : 'border-emerald-400/30 bg-emerald-500/10'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="mb-0.5 text-xs text-muted-foreground">#{i + 1}</p>
                <p className="text-sm font-medium">{it.uf === '??' ? 'Sem estado' : it.uf}</p>
                <p className="mt-1 text-xs text-muted-foreground">{it.linha1}</p>
              </div>
              <div className={cn('shrink-0 text-right', tom === 'vermelho' ? 'text-red-500' : it.destaque ? 'text-orange-600' : 'text-emerald-600')}>
                <p className="text-lg font-bold leading-none">{tom === 'vermelho' ? '↓' : it.destaque ? '🔥' : '↑'} {it.valor}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{it.linha2}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {itens.length > 15 && (
        <button type="button" className="mt-3 text-xs font-semibold text-primary" onClick={() => setTodos((v) => !v)}>
          {todos ? 'Mostrar menos' : `Ver todos (${itens.length})`}
        </button>
      )}
    </>
  );
}

function Secao({ titulo, descricao, total, children }: { titulo: string; descricao: string; total: string; children: ReactNode }) {
  return (
    <Card className="glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{titulo}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
        </div>
        <p className="text-sm font-bold">{total}</p>
      </div>
      {children}
    </Card>
  );
}

/**
 * Finanças por estado (UF do perfil): assinantes, receita, receita ganha e
 * receita perdida. Pagamentos do Hub ligados ao usuário por id do Hub/e-mail.
 */
export default function AdminFinancasPorEstado() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<FinancasPorEstado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    financasEstadoService.buscar(dias)
      .then((d) => { if (vivo) setDados(d); })
      .catch((e: any) => { if (vivo) setErro(e?.response?.data?.message || 'Não foi possível carregar agora.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [dias]);

  const estados: FinancaEstado[] = dados?.estados ?? [];
  const t = dados?.totais;
  const ordenar = (f: (e: FinancaEstado) => number) => [...estados].filter((e) => f(e) > 0).sort((a, b) => f(b) - f(a));

  const assinantes: Item[] = ordenar((e) => e.assinantes).map((e) => ({
    uf: e.uf,
    valor: String(e.assinantes),
    destaque: pct(e.assinantes, e.usuarios) >= 10,
    linha1: `${e.assinantes} assinantes · de ${e.usuarios} usuários`,
    linha2: `${pct(e.assinantes, e.usuarios)}% do estado assina`,
  }));
  const receita: Item[] = ordenar((e) => e.receitaCents).map((e) => ({
    uf: e.uf,
    valor: brl(e.receitaCents),
    destaque: pct(e.receitaCents, t?.receitaCents || 0) >= 10,
    linha1: `${e.pagamentos} pagamentos`,
    linha2: `${pct(e.receitaCents, t?.receitaCents || 0)}% de toda a receita`,
  }));
  const ganha: Item[] = ordenar((e) => e.ganhaCents).map((e) => ({
    uf: e.uf,
    valor: brl(e.ganhaCents),
    destaque: e.ganhaNovosCents >= e.ganhaRenovCents,
    linha1: `novos ${brl(e.ganhaNovosCents)} · renovações ${brl(e.ganhaRenovCents)}`,
    linha2: `${e.ganhaPagamentos} pagamentos`,
  }));
  const perdida: Item[] = ordenar((e) => e.perdidaCents).map((e) => ({
    uf: e.uf,
    valor: brl(e.perdidaCents),
    destaque: false,
    linha1: `${e.perdidos} não renovaram`,
    linha2: e.ganhaCents > 0 ? `ganhou ${brl(e.ganhaCents)} no período` : 'sem receita nova no período',
  }));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-5 w-5 text-primary" /> Finanças por estado</h3>
        <div className="flex gap-1">
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={cn('min-h-[32px] rounded-full px-3 text-xs font-semibold', dias === d ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground')}
            >
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Estado = UF do perfil de quem pagou. O período vale para "receita ganha" e "receita perdida"; assinantes são os de hoje e a receita é de todo o histórico.
        {t && t.semUsuarioPagamentos > 0 && ` ${t.semUsuarioPagamentos} pagamentos (${brl(t.semUsuarioCents)}) não foram ligados a nenhum usuário e ficam fora dos estados.`}
        {dados?.cartaoErro && ' A Stripe não respondeu: os pagamentos no cartão recorrente estão faltando.'}
      </p>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : erro ? (
        <p className="py-6 text-sm text-destructive">{erro}</p>
      ) : (
        <>
          <Secao titulo="Assinantes por estado" descricao="Assinatura ativa hoje. A % mostra quanto dos usuários do estado assina." total={`${t?.assinantes ?? 0} assinantes`}>
            <GradeUf itens={assinantes} tom="verde" />
          </Secao>
          <Secao titulo="Receita por estado" descricao="Tudo o que já foi pago, somado pelo estado de quem pagou." total={brl(t?.receitaCents ?? 0)}>
            <GradeUf itens={receita} tom="verde" />
          </Secao>
          <Secao
            titulo="Receita ganha por estado"
            descricao={`Pagamentos dos últimos ${dias === 365 ? '12 meses' : `${dias} dias`}, separando primeiro pagamento (novos) e renovações. 🔥 = mais dinheiro de novos.`}
            total={brl(t?.ganhaCents ?? 0)}
          >
            <GradeUf itens={ganha} tom="verde" />
          </Secao>
          <Secao
            titulo="Receita perdida por estado"
            descricao={`Assinaturas que venceram nos últimos ${dias === 365 ? '12 meses' : `${dias} dias`} e não renovaram, pelo valor do último pagamento de cada pessoa.`}
            total={`${brl(t?.perdidaCents ?? 0)} · ${t?.perdidos ?? 0} pessoas`}
          >
            <GradeUf itens={perdida} tom="vermelho" />
          </Secao>
        </>
      )}
    </div>
  );
}
