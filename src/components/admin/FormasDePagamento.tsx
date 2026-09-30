import { useEffect, useState } from 'react';
import { CreditCard, FileText, Loader2, QrCode, RefreshCw, Wallet } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { adminService, type FormasDePagamento as Dados, type MetodoPagamento } from '@/services/api';
import { cn } from '@/lib/utils';

// Cartão e boleto entraram no ar em 02/08/2026; antes disso só havia Pix, então
// comparar "desde o início" favorece o Pix. O padrão é a comparação justa.
const INICIO_CARTAO_BOLETO = '2026-08-02';

const PERIODOS: Array<{ id: string; rotulo: string; since: () => string | null }> = [
  { id: 'justo', rotulo: 'Desde 02/08 (os 3 no ar)', since: () => INICIO_CARTAO_BOLETO },
  { id: '30d', rotulo: 'Últimos 30 dias', since: () => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) },
  { id: 'tudo', rotulo: 'Desde o início', since: () => null },
];

const INFO: Record<MetodoPagamento, { nome: string; cor: string; corClasse: string; icone: typeof QrCode }> = {
  pix: { nome: 'Pix', cor: '#10b981', corClasse: 'bg-emerald-500', icone: QrCode },
  credit_card: { nome: 'Cartão', cor: '#8b5cf6', corClasse: 'bg-violet-500', icone: CreditCard },
  boleto: { nome: 'Boleto', cor: '#f59e0b', corClasse: 'bg-amber-500', icone: FileText },
};

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : 0);
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const lblMes = (m: string) => { const [y, mm] = m.split('-'); return `${MESES[Number(mm) - 1]}/${y.slice(2)}`; };

/** Faixa horizontal com a participação de cada forma de pagamento. */
function Faixa({ partes }: { partes: Array<{ metodo: MetodoPagamento; valor: number }> }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
      {partes.map((p) => (
        <div key={p.metodo} className={INFO[p.metodo].corClasse} style={{ width: `${pct(p.valor, total)}%` }} title={`${INFO[p.metodo].nome}: ${fmtPct(pct(p.valor, total))}`} />
      ))}
    </div>
  );
}

/**
 * Painel "Formas de pagamento" (aba Finanças): quantos pagamentos e quanto
 * dinheiro entrou por Pix, cartão e boleto, com % e evolução mês a mês.
 */
export default function FormasDePagamento() {
  const [periodo, setPeriodo] = useState('justo');
  const [ver, setVer] = useState<'pagamentos' | 'valor'>('pagamentos');
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async (id = periodo) => {
    setCarregando(true);
    setErro(null);
    try {
      const p = PERIODOS.find((x) => x.id === id) ?? PERIODOS[0];
      setDados(await adminService.getFormasDePagamento(p.since()));
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Não foi possível carregar os pagamentos do Hub agora.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(periodo); }, [periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const metodos = dados?.metodos ?? [];
  const totalPag = metodos.reduce((s, m) => s + m.pagamentos, 0);
  const totalValor = metodos.reduce((s, m) => s + m.valorCents, 0);
  const grafico = (dados?.mensal ?? []).map((m) => ({
    mes: lblMes(m.month),
    pix: ver === 'valor' ? m.pix.valorCents / 100 : m.pix.pagamentos,
    credit_card: ver === 'valor' ? m.credit_card.valorCents / 100 : m.credit_card.pagamentos,
    boleto: ver === 'valor' ? m.boleto.valorCents / 100 : m.boleto.pagamentos,
  }));
  const naoPagas = (metodo: MetodoPagamento) => (dados?.naoPagas ?? []).filter((n) => n.metodo === metodo).reduce((s, n) => s + n.qtd, 0);

  return (
    <Card className="mt-6 p-6 glass">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Wallet className="h-4 w-4 text-primary" /> Formas de pagamento</h3>
        <button type="button" onClick={() => void carregar()} disabled={carregando} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn('h-3.5 w-3.5', carregando && 'animate-spin')} /> Atualizar
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Pagamentos confirmados de verdade: Pix e boleto pelo Hub, cartão direto da Stripe (inclui as renovações automáticas).
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriodo(p.id)}
            className={cn(
              'min-h-[36px] rounded-full px-3.5 text-xs font-semibold transition-colors',
              periodo === p.id ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p className="py-6 text-sm text-destructive">{erro}</p>
      ) : !dados ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className={cn('space-y-6', carregando && 'opacity-60')}>
          {/* Um quadro por forma de pagamento */}
          <div className="grid gap-3 sm:grid-cols-3">
            {metodos.map((m) => {
              const info = INFO[m.metodo];
              const Icone = info.icone;
              return (
                <div key={m.metodo} className="rounded-xl border bg-secondary/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg text-white', info.corClasse)}><Icone className="h-4 w-4" /></span>
                      {info.nome}
                    </span>
                    <span className="text-lg font-bold" style={{ color: info.cor }}>{fmtPct(pct(m.pagamentos, totalPag))}</span>
                  </div>
                  <p className="text-2xl font-bold">{m.pagamentos.toLocaleString('pt-BR')} <span className="text-sm font-normal text-muted-foreground">pagamentos</span></p>
                  <p className="text-sm font-semibold text-success">{brl(m.valorCents)} <span className="font-normal text-muted-foreground">· {fmtPct(pct(m.valorCents, totalValor))} do valor</span></p>
                  <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                    <p>{m.clientes.toLocaleString('pt-BR')} clientes · ticket médio {brl(m.pagamentos ? Math.round(m.valorCents / m.pagamentos) : 0)}</p>
                    <p>{m.renovacoes.toLocaleString('pt-BR')} renovações ({fmtPct(pct(m.renovacoes, m.pagamentos))} dos pagamentos)</p>
                    {naoPagas(m.metodo) > 0 && <p>{naoPagas(m.metodo).toLocaleString('pt-BR')} {m.metodo === 'credit_card' ? 'recusados/abandonados' : 'gerados e não pagos'}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Participação */}
          <div className="space-y-3 rounded-xl border p-4">
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Por quantidade</span><span className="text-muted-foreground">{totalPag.toLocaleString('pt-BR')} pagamentos</span></div>
              <Faixa partes={metodos.map((m) => ({ metodo: m.metodo, valor: m.pagamentos }))} />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs"><span className="font-medium">Por valor</span><span className="text-muted-foreground">{brl(totalValor)}</span></div>
              <Faixa partes={metodos.map((m) => ({ metodo: m.metodo, valor: m.valorCents }))} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {metodos.map((m) => (
                <span key={m.metodo} className="flex items-center gap-1.5">
                  <span className={cn('h-2.5 w-2.5 rounded-sm', INFO[m.metodo].corClasse)} /> {INFO[m.metodo].nome}: {fmtPct(pct(m.pagamentos, totalPag))} dos pagamentos · {fmtPct(pct(m.valorCents, totalValor))} do valor
                </span>
              ))}
            </div>
          </div>

          {/* Mês a mês */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Mês a mês</h4>
              <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                {(['pagamentos', 'valor'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setVer(v)} className={cn('rounded-md px-3 py-1.5 font-medium', ver === v ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    {v === 'pagamentos' ? 'Quantidade' : 'Valor (R$)'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafico} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(v: any, nome: any) => [ver === 'valor' ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${v} pagamentos`, INFO[nome as MetodoPagamento]?.nome ?? nome]}
                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend formatter={(nome: any) => INFO[nome as MetodoPagamento]?.nome ?? nome} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="pix" stackId="m" fill={INFO.pix.cor} />
                  <Bar dataKey="credit_card" stackId="m" fill={INFO.credit_card.cor} />
                  <Bar dataKey="boleto" stackId="m" fill={INFO.boleto.cor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {dados.cartaoErro && (
            <p className="text-xs text-destructive">Não foi possível ler os pagamentos do cartão na Stripe agora ({dados.cartaoErro}); o cartão pode aparecer menor do que é.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            O cartão renova sozinho; no Pix e no boleto cada mês depende de a pessoa pagar de novo. Estornos feitos na Stripe não são descontados daqui.
            Atualizado {new Date(dados.geradoEm).toLocaleString('pt-BR')}.
          </p>
        </div>
      )}
    </Card>
  );
}
