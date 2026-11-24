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

/**
 * Base de usuários mês a mês: quantos se cadastraram, quantos saíram, o tamanho
 * da base no fim do mês e o crescimento em relação ao mês anterior.
 * O mês atual é parcial; para ele, os cadastros são comparados com o mesmo
 * período do mês anterior (do dia 1 até o dia de hoje).
 */
export default function AdminCrescimentoBase() {
  const [dados, setDados] = useState<CrescimentoBase | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    adminCrescimentoService.relatorio().then(setDados).catch(() => setErro(true));
  }, []);

  if (erro) return <Card className="p-5 glass text-sm text-destructive">Não foi possível carregar o crescimento da base.</Card>;
  if (!dados) return <Card className="flex items-center gap-2 p-5 glass text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando crescimento da base…</Card>;
  const meses = dados.meses;
  if (meses.length === 0) return null;

  const linhas = meses.map((m, i) => {
    const ant: MesDaBase | undefined = meses[i - 1];
    const baseInicio = ant?.base ?? 0;
    const cresc = ant ? m.base - baseInicio : null;
    // Mês atual: compara cadastros com o mesmo período do mês anterior.
    const novosRef = ant ? (m.parcial ? ant.novosAteODia : ant.novos) : null;
    return {
      ...m,
      crescQtd: cresc,
      crescPct: ant ? pct(m.base, baseInicio) : null,
      novosQtd: novosRef === null ? null : m.novos - novosRef,
      novosPct: novosRef === null ? null : pct(m.novos, novosRef),
    };
  });
  const atual = linhas[linhas.length - 1];
  const fechados = linhas.filter((l) => !l.parcial && l.crescPct !== null);
  const ultimos3 = fechados.slice(-3);
  const ritmo = ultimos3.length ? ultimos3.reduce((s, l) => s + (l.crescPct ?? 0), 0) / ultimos3.length : null;
  const maxBase = Math.max(1, ...linhas.map((l) => l.base));

  return (
    <Card className="p-5 glass" data-testid="crescimento-base">
      <h3 className="mb-1 font-semibold">Crescimento da base de usuários (mês a mês)</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Cadastros e saídas (contas excluídas) por mês, no horário de Brasília. Base = quem se cadastrou menos quem excluiu a conta, no fim de cada mês. Perfis de vitrine e a conta oficial não contam.
        {atual.parcial && ` O mês atual vai até o dia ${dados.diaAtual}: os cadastros dele são comparados com o mesmo período do mês anterior.`}
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Base hoje</p>
          <p className="text-2xl font-bold tabular-nums">{num(atual.base)}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Crescimento em {nomeDoMes(atual.mes)}{atual.parcial ? ' (até hoje)' : ''}</p>
          <p className="text-lg font-bold"><Variacao qtd={atual.crescQtd} p={atual.crescPct} /></p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Ritmo médio (últimos {ultimos3.length} meses fechados)</p>
          <p className="text-2xl font-bold tabular-nums">{ritmo === null ? '—' : `${txtPct(ritmo)}/mês`}</p>
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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Mês</th>
              <th className="py-2 pr-3 font-medium">Cadastros</th>
              <th className="py-2 pr-3 font-medium">vs mês anterior</th>
              <th className="py-2 pr-3 font-medium">Saídas</th>
              <th className="py-2 pr-3 font-medium">Base no fim do mês</th>
              <th className="py-2 font-medium">Crescimento da base</th>
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
                <td className="py-2"><Variacao qtd={l.crescQtd} p={l.crescPct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
