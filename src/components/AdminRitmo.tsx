import { useCallback, useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarDays, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminRitmoService, type RelatorioRitmo } from '@/services/api';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

const diaCurto = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

/**
 * Ritmo da plataforma: em que dia da semana as pessoas usam e o cruzamento
 * diário de quem entrou com quem excluiu a conta. A taxa de saída responde
 * "de cada 100 que entram, quantos vão embora?" no mesmo período.
 */
export default function AdminRitmo() {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<RelatorioRitmo | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await adminRitmoService.relatorio(dias));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);

  const maiorDia = Math.max(1, ...(dados?.porDiaDaSemana.map((d) => d.aberturas) ?? [1]));
  const melhorDia = dados?.porDiaDaSemana.reduce((a, b) => (b.aberturas > a.aberturas ? b : a), dados.porDiaDaSemana[0]);
  const piorDia = dados?.porDiaDaSemana.reduce((a, b) => (b.aberturas < a.aberturas ? b : a), dados.porDiaDaSemana[0]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" /> Ritmo da plataforma</h3>
            <p className="text-xs text-muted-foreground">
              Em que dia da semana a base usa o app, e quantos entram e saem por dia.
            </p>
          </div>
          <div className="flex gap-1.5">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                type="button"
                onClick={() => setDias(p.dias)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs transition-all',
                  dias === p.dias
                    ? 'bg-primary font-bold text-primary-foreground'
                    : 'border border-dashed border-border font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !dados ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar agora.</Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div>
              <h4 className="font-semibold">Uso por dia da semana</h4>
              {melhorDia && piorDia && melhorDia.aberturas > 0 && (
                <p className="text-xs text-muted-foreground">
                  Mais movimento: <strong className="text-foreground">{melhorDia.dia}</strong> · menos movimento: <strong className="text-foreground">{piorDia.dia}</strong>.
                  Bom para escolher quando publicar e quando disparar aviso.
                </p>
              )}
            </div>
            <div className="space-y-2">
              {dados.porDiaDaSemana.map((d) => (
                <div key={d.dia} className="flex items-center gap-2 text-sm">
                  <span className="w-16 shrink-0">{d.dia}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', d.dia === melhorDia?.dia ? 'bg-primary' : 'bg-primary/50')}
                      style={{ width: `${Math.max(2, (d.aberturas / maiorDia) * 100)}%` }}
                    />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                    {d.pessoas.toLocaleString('pt-BR')} pessoas
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Entraram</p>
              <p className="text-2xl font-bold text-emerald-600">{dados.totais.entraram.toLocaleString('pt-BR')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Saíram</p>
              <p className="text-2xl font-bold text-destructive">{dados.totais.sairam.toLocaleString('pt-BR')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className={cn('text-2xl font-bold', dados.totais.saldo >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                {dados.totais.saldo > 0 ? '+' : ''}{dados.totais.saldo.toLocaleString('pt-BR')}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Taxa de saída</p>
              <p className={cn(
                'text-2xl font-bold',
                dados.totais.taxaDeSaida <= 20 ? 'text-emerald-600' : dados.totais.taxaDeSaida <= 50 ? 'text-amber-600' : 'text-destructive'
              )}>
                {dados.totais.taxaDeSaida}%
              </p>
              <p className="text-[10px] text-muted-foreground">saem a cada 100 que entram</p>
            </Card>
          </div>

          <Card className="p-4 space-y-3">
            <div>
              <h4 className="font-semibold">Entradas x saídas, dia a dia</h4>
              <p className="text-xs text-muted-foreground">
                Cada ponto é um dia. Quando a linha vermelha encosta na verde, o crescimento parou de valer a pena.
              </p>
            </div>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={dados.serie.map((l) => ({ ...l, rotulo: diaCurto(l.dia) }))} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                    formatter={(v: number, nome: string) => [v, nome]}
                    labelFormatter={(l) => `Dia ${l}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="entraram" name="Entraram" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sairam" name="Saíram" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
