import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminNotasService, type RelatorioNotas } from '@/services/api';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '1 ano' },
];

const corDaNota = (n: number) => (n >= 9 ? 'text-emerald-600' : n >= 7 ? 'text-amber-600' : 'text-destructive');

/** Nota de 0 a 10 dada pelos usuários, com as sugestões que eles escreveram. */
export default function AdminNotas() {
  const [dias, setDias] = useState(90);
  const [dados, setDados] = useState<RelatorioNotas | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await adminNotasService.relatorio(dias));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);

  const maior = Math.max(1, ...(dados?.distribuicao.map((d) => d.total) ?? [1]));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Star className="h-4 w-4" /> Nota do app</h3>
            <p className="text-xs text-muted-foreground">
              "De 0 a 10, quanto você indicaria o NoSigilo?" — perguntado a cada 90 dias para contas com mais de 7 dias.
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
      ) : dados.total === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Ninguém respondeu ainda no período. As respostas começam a aparecer conforme os usuários abrem o app.
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Respostas</p>
              <p className="text-2xl font-bold">{dados.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Nota média</p>
              <p className={cn('text-2xl font-bold', dados.media !== null && corDaNota(dados.media))}>{dados.media ?? '—'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">NPS</p>
              <p className={cn('text-2xl font-bold', (dados.nps ?? 0) >= 50 ? 'text-emerald-600' : (dados.nps ?? 0) >= 0 ? 'text-amber-600' : 'text-destructive')}>
                {dados.nps ?? '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">quem indica menos quem critica</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Insatisfeitos (0 a 6)</p>
              <p className="text-2xl font-bold text-destructive">{dados.detratores}</p>
            </Card>
          </div>

          <Card className="p-4 space-y-2">
            <h4 className="font-semibold">Como as notas se distribuem</h4>
            <div className="flex items-end gap-1.5">
              {dados.distribuicao.map((d) => (
                <div key={d.nota} className="flex flex-1 flex-col items-center gap-1" title={`Nota ${d.nota}: ${d.total}`}>
                  <span className="text-[10px] text-muted-foreground">{d.total || ''}</span>
                  <div
                    className={cn('w-full rounded-t', d.nota >= 9 ? 'bg-emerald-500/70' : d.nota >= 7 ? 'bg-amber-500/70' : 'bg-destructive/70')}
                    style={{ height: `${Math.max(3, (d.total / maior) * 72)}px` }}
                  />
                  <span className="text-[10px] font-medium">{d.nota}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {dados.promotores} indicariam (9-10) · {dados.neutros} neutros (7-8) · {dados.detratores} insatisfeitos (0-6)
            </p>
          </Card>

          <Card className="p-4 space-y-3">
            <h4 className="font-semibold">O que escreveram</h4>
            <div className="space-y-2">
              {dados.respostas.filter((r) => r.sugestao).length === 0 && (
                <p className="text-sm text-muted-foreground">Ninguém escreveu sugestão ainda neste período.</p>
              )}
              {dados.respostas.filter((r) => r.sugestao).map((r, i) => (
                <div key={`${r.em}-${i}`} className="rounded-lg border border-border/60 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={cn('text-sm font-bold', corDaNota(r.nota))}>Nota {r.nota}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.nome || 'Usuário'}{r.local ? ` · ${r.local}` : ''}
                      {r.assinante && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold-text">assinante</span>}
                      <span className="ml-2">{new Date(r.em).toLocaleDateString('pt-BR')}</span>
                    </span>
                  </div>
                  <p className="mt-1 text-sm italic text-muted-foreground">“{r.sugestao}”</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
