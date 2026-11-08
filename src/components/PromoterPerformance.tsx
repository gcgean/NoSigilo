import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PromoterHistory, PromoterStats } from '@/services/api';
import { Button } from '@/components/ui/button';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export default function PromoterPerformance({ stats, history }: { stats: PromoterStats; history: PromoterHistory[] }) {
  const [period, setPeriod] = useState('');
  const selected = history.find((h) => h.month === period) || history.at(-1);
  const earned = selected?.commissionCents || 0;
  const goals = [1000, 5000, 10000, 25000, 50000, 100000];
  const goal = goals.find((value) => value > earned) || (Math.floor(earned / 100000) + 1) * 100000;
  const remaining = Math.max(0, stats.minPayoutCents - stats.approvedCents);
  return <section className="space-y-5" aria-label="Meu desempenho">
    <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-background p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Meu desempenho</h2>
        <select aria-label="Mês do desempenho" className="rounded-xl border bg-background p-3 text-sm" value={selected?.month || ''} onChange={(e) => setPeriod(e.target.value)}>
          {history.map((h) => <option key={h.month} value={h.month}>{new Date(h.month + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Comissões geradas no mês · 20% sobre assinaturas confirmadas</p>
      <p className="text-4xl font-bold text-emerald-700 dark:text-emerald-400">{money(earned)}</p>
      <p className="text-sm">{selected?.signups || 0} cadastros · {selected?.subscriptions || 0} pagamentos de assinatura</p>
      <div className="space-y-2 border-t pt-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Próxima meta: {money(goal)}</strong><span>Faltam {money(goal - earned)}</span></div>
        <progress aria-label="Progresso da meta de ganhos" className="w-full h-3 accent-emerald-500" value={earned} max={goal} />
        <p className="text-sm font-medium">{Math.floor(earned / goal * 100)}% da próxima meta alcançados</p>
        <div className="flex flex-wrap gap-2" aria-label="Etapas de ganhos no mês">{goals.map((value) => <span key={value} className={`rounded-full border px-3 py-1 text-xs ${earned >= value ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : value === goal ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{earned >= value ? '✓ ' : ''}{money(value)}</span>)}</div>
        <p className="text-xs text-muted-foreground">Metas de acompanhamento. Sua comissão continua em 20% em todas as etapas; não há bônus automático. Valores pendentes podem mudar após análise.</p>
      </div>
      <Button asChild className="w-full sm:w-auto min-h-11 bg-emerald-700 hover:bg-emerald-800 text-white"><Link to="/promoter/artes">Escolher uma arte para divulgar</Link></Button>
    </div>
    <div className="glass rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold">Caminho até o próximo Pix</h2>
      <p className="text-2xl font-bold text-emerald-500">{money(stats.approvedCents)} <span className="text-sm font-normal text-muted-foreground">aprovados para pagamento</span></p>
      <progress aria-label="Progresso até o mínimo de pagamento" className="w-full h-3 accent-emerald-500" value={Math.min(stats.approvedCents, stats.minPayoutCents)} max={stats.minPayoutCents} />
      <p className="text-sm">{remaining ? `Faltam ${money(remaining)} em comissões aprovadas para atingir o mínimo de ${money(stats.minPayoutCents)}.` : 'Mínimo atingido! Seu saldo está elegível para o próximo pagamento mensal.'}</p>
      <p className="text-xs text-muted-foreground">O saldo aprovado acumula entre meses. Pendente de aprovação: {money(stats.pendingCents)}. Atingir o mínimo não significa Pix imediato.</p>
    </div>
    <div className="glass rounded-2xl p-5 space-y-4 min-w-0">
      <h2 className="font-semibold">Seu histórico de ganhos</h2>
      <p className="text-sm text-muted-foreground">Últimos 12 meses · comissões geradas, exceto canceladas.</p>
      <div className="h-56 w-full" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={history.map((h) => ({ ...h, reais: h.commissionCents / 100, label: h.month.slice(5) + '/' + h.month.slice(2, 4) }))} margin={{ left: -15, right: 5 }}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number) => [money(v * 100), 'Comissões']} contentStyle={{ background: 'hsl(var(--background))', borderRadius: 12 }} /><Bar dataKey="reais" fill="#ec3973" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      <details><summary className="cursor-pointer py-3 text-sm">Ver números por mês</summary><div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Histórico mensal</caption><thead><tr><th className="text-left p-2">Mês</th><th>Cadastros</th><th>Pagamentos</th><th>Comissões</th></tr></thead><tbody>{history.map((h) => <tr className="border-t" key={h.month}><td className="p-2">{h.month.slice(5)}/{h.month.slice(0, 4)}</td><td className="text-center">{h.signups}</td><td className="text-center">{h.subscriptions}</td><td className="text-right whitespace-nowrap">{money(h.commissionCents)}</td></tr>)}</tbody></table></div></details>
    </div>
    <div className="rounded-2xl border p-5 space-y-2"><h2 className="font-semibold">Seu próximo passo</h2><p className="text-sm text-muted-foreground">Escolha uma arte, publique no story com seu link e acompanhe os novos cadastros aqui. Depois, apresente os benefícios da assinatura a quem demonstrar interesse.</p><p className="text-xs text-muted-foreground">Convites criados não são cliques. Cadastros não geram comissão; pagamentos confirmados de assinaturas geram. Renovações podem gerar novos pagamentos para um mesmo perfil.</p></div>
  </section>;
}
