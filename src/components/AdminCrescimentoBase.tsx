import { useEffect, useState } from 'react';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminCrescimentoService, type CrescimentoBase, type MesDaBase } from '@/services/api';

const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nomeDoMes = (m: string) => `${NOMES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const num = (n: number) => n.toLocaleString('pt-BR');
const pct = (atual: number, anterior: number) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);
const txtPct = (p: number | null) => (p === null ? '—' : `${p > 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
const BANDEIRA: Record<string, string> = { BR: '🇧🇷', PT: '🇵🇹', OUTROS: '🌍' };

function Variacao({ qtd, p }: { qtd: number | null; p: number | null }) {
  if (qtd === null) return <span className="text-muted-foreground">—</span>;
  if (qtd === 0) return <span className="tabular-nums text-muted-foreground">0 <span className="text-xs opacity-80">({txtPct(p)})</span></span>;
  const sobe = qtd >= 0;
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', sobe ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {sobe ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {qtd > 0 ? '+' : ''}{num(qtd)} <span className="text-xs opacity-80">({txtPct(p)})</span>
    </span>
  );
}

/** Variação do mês em relação ao anterior; o mês atual compara cadastros com o mesmo período do anterior. */
function calcular(meses: MesDaBase[]) {
  return meses.map((m, i) => {
    const ant: MesDaBase | undefined = meses[i - 1];
    const baseInicio = ant?.base ?? 0;
    const novosRef = ant ? (m.parcial ? ant.novosAteODia : ant.novos) : null;
    return {
      ...m,
      crescQtd: ant ? m.base - baseInicio : null,
      crescPct: ant ? pct(m.base, baseInicio) : null,
      novosQtd: novosRef === null ? null : m.novos - novosRef,
      novosPct: novosRef === null ? null : pct(m.novos, novosRef),
    };
  });
}

function ritmoDe(linhas: ReturnType<typeof calcular>) {
  const ultimos3 = linhas.filter((l) => !l.parcial && l.crescPct !== null).slice(-3);
  return { n: ultimos3.length, valor: ultimos3.length ? ultimos3.reduce((s, l) => s + (l.crescPct ?? 0), 0) / ultimos3.length : null };
}

/**
 * Base de usuários mês a mês, no total ou por país: cadastros, saídas, base no
 * fim do mês, crescimento e assinantes (novos e pagantes, do extrato do Hub).
 */
export default function AdminCrescimentoBase() {
  const [dados, setDados] = useState<CrescimentoBase | null>(null);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState<string>('TODOS');

  useEffect(() => {
    adminCrescimentoService.relatorio().then(setDados).catch(() => setErro(true));
  }, []);

  if (erro) return <Card className="p-5 glass text-sm text-destructive">Não foi possível carregar o crescimento da base.</Card>;
  if (!dados) return <Card className="flex items-center gap-2 p-5 glass text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando crescimento da base…</Card>;
  if (dados.meses.length === 0) return null;

  const paisSel = dados.paises.find((p) => p.pais === filtro);
  const linhas = calcular(paisSel ? paisSel.meses : dados.meses);
  const ativos = paisSel ? paisSel.assinantesAtivos : dados.assinantesAtivos;
  const comAssin = dados.assinantesDisponivel;
  const atual = linhas[linhas.length - 1];
  const ritmo = ritmoDe(linhas);
  const maxBase = Math.max(1, ...linhas.map((l) => l.base));

  const resumo = dados.paises.map((p) => {
    const l = calcular(p.meses);
    const ult = l[l.length - 1];
    return { ...p, ult, ritmo: ritmoDe(l) };
  });
  const baseTotal = dados.meses[dados.meses.length - 1].base || 1;

  return (
    <Card className="p-5 glass" data-testid="crescimento-base">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Crescimento da base de usuários (mês a mês)</h3>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="País">
          {[{ pais: 'TODOS', nome: 'Todos' }, ...dados.paises].map((p) => (
            <button
              key={p.pais}
              type="button"
              role="tab"
              aria-selected={filtro === p.pais}
              onClick={() => setFiltro(p.pais)}
              className={cn('rounded-full border px-3 py-1 text-xs transition-colors', filtro === p.pais ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')}
            >
              {BANDEIRA[p.pais] ? `${BANDEIRA[p.pais]} ` : ''}{p.nome}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Cadastros e saídas (contas excluídas) por mês, no horário de Brasília. Base = quem se cadastrou menos quem excluiu a conta, no fim de cada mês. Perfis de vitrine e a conta oficial não contam.
        País = UF do perfil (PT = Portugal); sem UF, o país de onde a pessoa mais acessou.
        {atual.parcial && ` O mês atual vai até o dia ${dados.diaAtual}: os cadastros dele são comparados com o mesmo período do mês anterior.`}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Base hoje</p>
          <p className="text-2xl font-bold tabular-nums">{num(atual.base)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Crescimento em {nomeDoMes(atual.mes)}{atual.parcial ? ' (até hoje)' : ''}</p>
          <p className="text-lg font-bold"><Variacao qtd={atual.crescQtd} p={atual.crescPct} /></p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Ritmo médio (últimos {ritmo.n} meses fechados)</p>
          <p className="text-2xl font-bold tabular-nums">{ritmo.valor === null ? '—' : `${txtPct(ritmo.valor)}/mês`}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Assinantes ativos hoje</p>
          <p className="text-2xl font-bold tabular-nums">{num(ativos)}</p>
          <p className="text-[11px] text-muted-foreground">{atual.base > 0 ? `${((ativos / atual.base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da base` : ''}</p>
        </div>
      </div>

      <div className="mb-1 flex h-28 items-end gap-1">
        {linhas.map((l) => (
          <div key={l.mes} className="group relative flex h-full flex-1 items-end">
            <div className="absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded border bg-popover px-1.5 py-0.5 text-[10px] shadow-sm group-hover:block">
              {nomeDoMes(l.mes)}: {num(l.base)} na base
            </div>
            <div className={cn('w-full rounded-sm', l.parcial ? 'bg-primary/40' : 'bg-primary/80')} style={{ height: `${Math.max(2, (l.base / maxBase) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mb-4 flex gap-1">
        {linhas.map((l) => <span key={l.mes} className="flex-1 text-center text-[10px] text-muted-foreground">{nomeDoMes(l.mes)}</span>)}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Mês</th>
              <th className="py-2 pr-3 font-medium">Cadastros</th>
              <th className="py-2 pr-3 font-medium">vs mês anterior</th>
              <th className="py-2 pr-3 font-medium">Saídas</th>
              <th className="py-2 pr-3 font-medium">Base no fim do mês</th>
              <th className="py-2 pr-3 font-medium">Crescimento da base</th>
              <th className="py-2 pr-3 font-medium" title="Contas cujo primeiro pagamento caiu neste mês">Novos assinantes</th>
              <th className="py-2 font-medium" title="Contas diferentes que pagaram neste mês">Pagantes no mês</th>
            </tr>
          </thead>
          <tbody>
            {[...linhas].reverse().map((l) => (
              <tr key={l.mes} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-3 font-medium">{nomeDoMes(l.mes)}{l.parcial && <span className="ml-1 text-xs text-muted-foreground">(até dia {dados.diaAtual})</span>}</td>
                <td className="py-2 pr-3 tabular-nums">{num(l.novos)}</td>
                <td className="py-2 pr-3"><Variacao qtd={l.novosQtd} p={l.novosPct} /></td>
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{num(l.saidas)}</td>
                <td className="py-2 pr-3 font-semibold tabular-nums">{num(l.base)}</td>
                <td className="py-2 pr-3"><Variacao qtd={l.crescQtd} p={l.crescPct} /></td>
                <td className="py-2 pr-3 tabular-nums">{comAssin ? num(l.novosAssinantes) : '—'}</td>
                <td className="py-2 tabular-nums">{comAssin ? num(l.pagantes) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!comAssin && <p className="mt-2 text-xs text-muted-foreground">Novos assinantes e pagantes: o extrato de pagamentos não respondeu agora. Recarregue em instantes.</p>}

      <h4 className="mb-2 mt-6 text-sm font-semibold">Resumo por país</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm" data-testid="crescimento-por-pais">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">País</th>
              <th className="py-2 pr-3 font-medium">Base hoje</th>
              <th className="py-2 pr-3 font-medium">% da base</th>
              <th className="py-2 pr-3 font-medium">Cadastros em {nomeDoMes(atual.mes)}</th>
              <th className="py-2 pr-3 font-medium">Crescimento no mês</th>
              <th className="py-2 pr-3 font-medium">Ritmo médio</th>
              <th className="py-2 pr-3 font-medium">Assinantes ativos</th>
              <th className="py-2 font-medium">Novos assinantes no mês</th>
            </tr>
          </thead>
          <tbody>
            {resumo.map((p) => (
              <tr key={p.pais} className="border-b border-border/50 last:border-0">
                <td className="whitespace-nowrap py-2 pr-3 font-medium">{BANDEIRA[p.pais]} {p.nome}</td>
                <td className="py-2 pr-3 font-semibold tabular-nums">{num(p.ult.base)}</td>
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{((p.ult.base / baseTotal) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                <td className="whitespace-nowrap py-2 pr-3"><span className="tabular-nums">{num(p.ult.novos)}</span> <span className="text-xs"><Variacao qtd={p.ult.novosQtd} p={p.ult.novosPct} /></span></td>
                <td className="py-2 pr-3"><Variacao qtd={p.ult.crescQtd} p={p.ult.crescPct} /></td>
                <td className="py-2 pr-3 tabular-nums">{p.ritmo.valor === null ? '—' : `${txtPct(p.ritmo.valor)}/mês`}</td>
                <td className="py-2 pr-3 tabular-nums">{num(p.assinantesAtivos)}</td>
                <td className="py-2 tabular-nums">{comAssin ? num(p.ult.novosAssinantes) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
