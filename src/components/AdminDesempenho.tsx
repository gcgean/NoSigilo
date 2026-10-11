import { useEffect, useState } from 'react';
import { Activity, Database, Gauge, Loader2, RefreshCw } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { desempenhoService, type ConsultasPesadas, type DesempenhoServidor } from '@/services/api';

const horaCurta = (iso: string, horas: number) => {
  const d = new Date(iso);
  return horas === 168
    ? d.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit' }).replace('.', '')
    : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/**
 * Admin: desempenho do servidor. CPU/memória/disco (amostra a cada 5 min),
 * tempo de resposta do site (média e p95 a cada 5 min) e as consultas mais
 * pesadas do banco. Em "7 dias" cada ponto é a média da hora.
 */
export default function AdminDesempenho() {
  const { toast } = useToast();
  const [horas, setHoras] = useState<24 | 168>(24);
  const [dados, setDados] = useState<DesempenhoServidor | null>(null);
  const [consultas, setConsultas] = useState<ConsultasPesadas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [zerando, setZerando] = useState(false);
  const [sqlAberto, setSqlAberto] = useState<number | null>(null);

  const carregar = async () => {
    setCarregando(true);
    try {
      const [d, c] = await Promise.all([desempenhoService.buscar(horas), desempenhoService.consultas()]);
      setDados(d);
      setConsultas(c);
    } catch {
      toast({ title: 'Não foi possível carregar o desempenho', variant: 'destructive' });
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { void carregar(); }, [horas]); // eslint-disable-line react-hooks/exhaustive-deps

  const zerar = async () => {
    if (!window.confirm('Zerar a lista de consultas pesadas? Use depois de uma correção, para medir do zero.')) return;
    setZerando(true);
    try {
      await desempenhoService.zerarConsultas();
      toast({ title: 'Estatísticas zeradas', description: 'A lista volta a encher com o uso real.' });
      setConsultas(await desempenhoService.consultas());
    } catch {
      toast({ title: 'Não foi possível zerar', variant: 'destructive' });
    } finally {
      setZerando(false);
    }
  };

  const recursos = (dados?.recursos ?? []).map((p) => ({ ...p, rotulo: horaCurta(p.em, horas) }));
  const respostas = (dados?.respostas ?? []).map((p) => ({ ...p, rotulo: horaCurta(p.em, horas) }));
  const ultimo = dados?.respostas.at(-1);
  const p95Periodo = respostas.length ? Math.max(...respostas.map((r) => r.p95Ms)) : 0;
  const mediaPeriodo = respostas.length
    ? Math.round(respostas.reduce((s, r) => s + r.mediaMs * r.pedidos, 0) / Math.max(1, respostas.reduce((s, r) => s + r.pedidos, 0)))
    : 0;

  return (
    <Card className="glass mt-4 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4 text-primary" /> Desempenho do servidor</h3>
        <div className="flex items-center gap-1">
          {([[24, '24 horas'], [168, '7 dias']] as const).map(([h, rotulo]) => (
            <button
              key={h}
              type="button"
              onClick={() => setHoras(h)}
              className={cn('min-h-[32px] rounded-full px-3 text-xs font-semibold', horas === h ? 'bg-gradient-primary text-white' : 'bg-muted text-muted-foreground')}
            >
              {rotulo}
            </button>
          ))}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void carregar()} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', carregando && 'animate-spin')} />
          </Button>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Medições a cada 5 minutos{horas === 168 ? ' (em 7 dias, cada ponto é a média da hora)' : ''}. As linhas tracejadas marcam os limites que disparam o aviso no Telegram.
      </p>

      {carregando && !dados ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          {/* 1. Recursos */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Activity className="h-4 w-4" /> CPU, memória e disco (%)</p>
            {recursos.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">Sem medições no período ainda.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={recursos} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={24} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={dados?.limites.cpu ?? 85} stroke="#f97316" strokeDasharray="6 4" label={{ value: 'CPU/disco 85%', fontSize: 10, fill: '#f97316', position: 'insideTopLeft' }} />
                    <ReferenceLine y={dados?.limites.memoria ?? 90} stroke="#ef4444" strokeDasharray="6 4" label={{ value: 'memória 90%', fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="cpu" name="CPU" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                    {horas === 168 && <Line type="monotone" dataKey="cpuMax" name="CPU (pico da hora)" stroke="#c4b5fd" strokeWidth={1} dot={false} />}
                    <Line type="monotone" dataKey="memoria" name="Memória" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="disco" name="Disco" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 2. Tempo de resposta */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Gauge className="h-4 w-4" /> Tempo de resposta do site (ms)</p>
              <p className="text-xs text-muted-foreground">
                Média no período: <strong className="text-foreground">{mediaPeriodo} ms</strong> · pior p95: <strong className="text-foreground">{p95Periodo} ms</strong>
                {ultimo && <> · últimos 5 min: <strong className="text-foreground">{ultimo.mediaMs} ms</strong> em {ultimo.pedidos} pedidos</>}
              </p>
            </div>
            {respostas.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">A medição começou agora: o primeiro ponto aparece em até 5 minutos.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={respostas} margin={{ top: 5, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={24} />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, nome: string) => (nome === 'Pedidos' ? v : `${v} ms`)}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={1000} stroke="#ef4444" strokeDasharray="6 4" label={{ value: '1 s', fontSize: 10, fill: '#ef4444', position: 'insideTopLeft' }} />
                    <Line type="monotone" dataKey="mediaMs" name="Média" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="p95Ms" name="5% mais lentos (p95)" stroke="#f97316" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {(dados?.rotasLentas.length ?? 0) > 0 && (
              <div className="mt-3 overflow-x-auto">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">Onde o servidor mais gastou tempo no período</p>
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr><th className="py-1 text-left font-medium">Rota</th><th className="text-right font-medium">Pedidos</th><th className="text-right font-medium">Média</th><th className="text-right font-medium">Pior</th><th className="text-right font-medium">Tempo total</th></tr>
                  </thead>
                  <tbody>
                    {dados!.rotasLentas.map((r) => (
                      <tr key={r.rota} className="border-t">
                        <td className="max-w-[220px] truncate py-1 font-mono" title={r.rota}>{r.rota}</td>
                        <td className="text-right">{r.pedidos.toLocaleString('pt-BR')}</td>
                        <td className={cn('text-right', r.mediaMs > 500 && 'font-semibold text-orange-600')}>{r.mediaMs} ms</td>
                        <td className="text-right">{r.maxMs} ms</td>
                        <td className="text-right">{r.totalSeg} s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. Consultas pesadas */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Database className="h-4 w-4" /> Consultas mais pesadas do banco</p>
              {consultas?.disponivel && (
                <Button size="sm" variant="outline" disabled={zerando} onClick={() => void zerar()}>
                  {zerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Zerar estatísticas'}
                </Button>
              )}
            </div>
            {!consultas?.disponivel ? (
              <p className="text-sm text-muted-foreground">Indisponível neste banco{consultas?.motivo ? ` (${consultas.motivo})` : ''}.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Ordenadas pelo tempo total que ocuparam o banco{consultas.desde ? ` desde ${dataHora(consultas.desde)}` : ''}. Toque numa linha para ver a consulta.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr><th className="py-1 text-left font-medium">Consulta</th><th className="text-right font-medium">Vezes</th><th className="text-right font-medium">Média</th><th className="text-right font-medium">Pior</th><th className="text-right font-medium">Total</th></tr>
                    </thead>
                    <tbody>
                      {consultas.consultas.map((c, i) => (
                        <tr key={i} className="cursor-pointer border-t align-top hover:bg-secondary/40" onClick={() => setSqlAberto(sqlAberto === i ? null : i)}>
                          <td className="py-1 font-mono">
                            <span className={cn('block', sqlAberto === i ? 'whitespace-pre-wrap break-all' : 'max-w-[260px] truncate')}>{c.sql}</span>
                          </td>
                          <td className="text-right">{c.chamadas.toLocaleString('pt-BR')}</td>
                          <td className={cn('text-right', c.mediaMs > 500 && 'font-semibold text-orange-600')}>{c.mediaMs} ms</td>
                          <td className="text-right">{c.maxMs.toLocaleString('pt-BR')} ms</td>
                          <td className="text-right font-semibold">{c.totalSeg} s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
