import { useCallback, useEffect, useState } from 'react';
import { CalendarX2, Crown, Loader2, UserMinus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminExclusoesService, type RelatorioExclusoes } from '@/services/api';
import { deletionReasonLabel } from '@/utils/accountDeletionReasons';

const PERIODOS = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '1 ano' },
];

/** Agrupa os dias em semanas (segunda a domingo) para ver a tendência. */
function porSemana(dias: RelatorioExclusoes['porDia']) {
  const semanas = new Map<string, number>();
  for (const d of dias) {
    const data = new Date(`${d.dia}T12:00:00Z`);
    const diaDaSemana = (data.getUTCDay() + 6) % 7; // 0 = segunda
    data.setUTCDate(data.getUTCDate() - diaDaSemana);
    const chave = data.toISOString().slice(0, 10);
    semanas.set(chave, (semanas.get(chave) ?? 0) + d.total);
  }
  return Array.from(semanas.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([inicio, total]) => ({ inicio, total }));
}

const dataCurta = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Quem está saindo da plataforma: motivos, evolução semanal e o perfil de quem
 * cancela. Os dados vêm do registro de saída, que sobrevive à anonimização.
 */
export default function AdminExclusoes() {
  const [dias, setDias] = useState(30);
  const [motivo, setMotivo] = useState('');
  const [dados, setDados] = useState<RelatorioExclusoes | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await adminExclusoesService.relatorio(dias, motivo || undefined));
    } catch {
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [dias, motivo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const semanas = dados ? porSemana(dados.porDia) : [];
  const maiorSemana = Math.max(1, ...semanas.map((s) => s.total));
  const tendencia = semanas.length >= 2 ? semanas[semanas.length - 1].total - semanas[semanas.length - 2].total : null;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><UserMinus className="h-4 w-4" /> Contas excluídas</h3>
            <p className="text-xs text-muted-foreground">
              Por que as pessoas estão saindo, como isso evolui por semana e quem sai.
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Saíram no período</p>
              <p className="text-2xl font-bold">{dados.total.toLocaleString('pt-BR')}</p>
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><Crown className="h-3 w-3" /> Eram assinantes</p>
              <p className="text-2xl font-bold text-destructive">{dados.eramPremium.toLocaleString('pt-BR')}</p>
              <p className="text-[11px] text-muted-foreground">receita que foi embora</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Tempo médio de conta</p>
              <p className="text-2xl font-bold">{dados.mediaDeVidaEmDias === null ? '—' : `${dados.mediaDeVidaEmDias} dias`}</p>
              <p className="text-[11px] text-muted-foreground">do cadastro até a saída</p>
            </Card>
          </div>

          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">Por que saíram</h4>
              {motivo && (
                <button type="button" onClick={() => setMotivo('')} className="text-xs font-semibold text-emerald-500 underline underline-offset-2">
                  Ver todos os motivos
                </button>
              )}
            </div>
            <div className="space-y-2">
              {dados.porMotivo.length === 0 && <p className="text-sm text-muted-foreground">Ninguém saiu neste período.</p>}
              {dados.porMotivo.map((m) => (
                <button
                  key={m.motivo}
                  type="button"
                  onClick={() => setMotivo(motivo === m.motivo ? '' : m.motivo)}
                  className={cn('w-full space-y-1 rounded-lg p-1.5 text-left transition-colors', motivo === m.motivo ? 'bg-primary/10' : 'hover:bg-muted/50')}
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{deletionReasonLabel(m.motivo)}</span>
                    <span className="shrink-0 font-semibold">{m.total} <span className="text-xs font-normal text-muted-foreground">({m.pct}%)</span></span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-destructive/70" style={{ width: `${Math.max(2, m.pct)}%` }} />
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Toque em um motivo para filtrar o resto da página por ele.</p>
          </Card>

          <Card className="p-4 space-y-3">
            <div>
              <h4 className="flex items-center gap-2 font-semibold"><CalendarX2 className="h-4 w-4" /> Saídas por semana</h4>
              {tendencia !== null && (
                <p className="text-xs text-muted-foreground">
                  {tendencia > 0
                    ? `Piorou: ${tendencia} saída(s) a mais que na semana anterior.`
                    : tendencia < 0
                      ? `Melhorou: ${Math.abs(tendencia)} saída(s) a menos que na semana anterior.`
                      : 'Mesma quantidade da semana anterior.'}
                </p>
              )}
            </div>
            <div className="flex items-end gap-1.5 overflow-x-auto pb-1" style={{ minHeight: 96 }}>
              {semanas.length === 0 && <p className="text-sm text-muted-foreground">Sem saídas no período.</p>}
              {semanas.map((s) => (
                <div key={s.inicio} className="flex w-12 shrink-0 flex-col items-center gap-1" title={`Semana de ${dataCurta(s.inicio)}: ${s.total}`}>
                  <span className="text-[11px] font-semibold">{s.total}</span>
                  <div className="w-full rounded-t bg-destructive/70" style={{ height: `${Math.max(4, (s.total / maiorSemana) * 64)}px` }} />
                  <span className="text-[10px] text-muted-foreground">{dataCurta(s.inicio)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              { titulo: 'Tipo de perfil que sai', linhas: dados.porGenero },
              { titulo: 'Estados de onde saem', linhas: dados.porEstado },
            ].map(({ titulo, linhas }) => (
              <Card key={titulo} className="p-4 space-y-2">
                <h4 className="font-semibold">{titulo}</h4>
                {linhas.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
                {linhas.map((l) => (
                  <div key={l.chave} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{l.chave}</span>
                    <span className="font-semibold">{l.total}</span>
                  </div>
                ))}
              </Card>
            ))}
          </div>

          <Card className="p-4 space-y-3">
            <h4 className="font-semibold">Últimas saídas</h4>
            <div className="space-y-2">
              {dados.recentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma saída no período.</p>}
              {dados.recentes.map((r, i) => (
                <div key={`${r.em}-${i}`} className="rounded-lg border border-border/60 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.nome || 'Conta anterior à identificação'}
                      {r.email ? <span className="ml-1 text-xs text-muted-foreground">{r.email}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.em).toLocaleDateString('pt-BR')}
                      {r.eraPremium && <span className="ml-2 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold-text">era assinante</span>}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {deletionReasonLabel(r.motivo)}
                    {r.genero ? ` · ${r.genero}` : ''}
                    {r.cidade || r.estado ? ` · ${[r.cidade, r.estado].filter(Boolean).join('/')}` : ''}
                    {r.diasDeVida !== null ? ` · ficou ${r.diasDeVida} dia(s)` : ''}
                  </p>
                  {r.motivoTexto ? <p className="mt-1 italic text-muted-foreground">“{r.motivoTexto}”</p> : null}
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
