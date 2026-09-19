import { useCallback, useEffect, useState } from 'react';
import { Crown, Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { adminPromoterService, type RankingPromotor } from '@/services/api';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Ranking de promotores pela receita que trouxeram, com o título de
 * Embaixador Oficial concedido e revogado à mão. Só no admin: nomes e valores
 * nunca aparecem para os promotores.
 */
export default function AdminRankingPromotores() {
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState<'mes' | '3meses' | 'total'>('total');
  const [linhas, setLinhas] = useState<RankingPromotor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLinhas((await adminPromoterService.ranking(periodo)).ranking);
    } catch {
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const condecorar = async (l: RankingPromotor) => {
    const nota = window.prompt(`Condecorar ${l.nome} como Embaixador Oficial?\n\nObservação (opcional, só você vê):`, '');
    if (nota === null) return;
    setOcupado(l.userId);
    try {
      await adminPromoterService.condecorar(l.userId, nota || undefined);
      toast({ title: `👑 ${l.nome} agora é Embaixador Oficial`, description: 'Aviso enviado por e-mail, notificação e push.' });
      await carregar();
    } catch {
      toast({ title: 'Não foi possível condecorar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const revogar = async (l: RankingPromotor) => {
    if (!window.confirm(`Revogar o título de Embaixador Oficial de ${l.nome}? O Premium grátis e o destaque saem junto.`)) return;
    setOcupado(l.userId);
    try {
      await adminPromoterService.revogarEmbaixador(l.userId);
      toast({ title: `Título revogado de ${l.nome}` });
      await carregar();
    } catch {
      toast({ title: 'Não foi possível revogar', variant: 'destructive' });
    } finally {
      setOcupado(null);
    }
  };

  const visiveis = mostrarTodos ? linhas : linhas.slice(0, 15);
  const embaixadores = linhas.filter((l) => l.embaixadorDesde).length;

  return (
    <div className="glass space-y-4 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-500" /> Ranking de promotores</h3>
          <p className="text-xs text-muted-foreground">
            Pela receita dos assinantes que cada um trouxe. Renovação = dos assinantes com mais de 35 dias, quantos pagaram de novo.
            {embaixadores > 0 && ` ${embaixadores} Embaixador(es) Oficial(is).`}
          </p>
        </div>
        <div className="flex gap-1">
          {([['mes', 'Este mês'], ['3meses', '3 meses'], ['total', 'Desde o início']] as const).map(([v, r]) => (
            <Button key={v} size="sm" variant={periodo === v ? 'default' : 'outline'} onClick={() => setPeriodo(v)}>{r}</Button>
          ))}
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : linhas.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nenhum promotor com receita neste período.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2">#</th>
                  <th className="px-2 py-2">Promotor</th>
                  <th className="px-2 py-2 text-right">Assinantes</th>
                  <th className="px-2 py-2 text-right">Receita</th>
                  <th className="px-2 py-2 text-right">Renovação</th>
                  <th className="px-2 py-2 text-right">Comissão</th>
                  <th className="py-2 pl-2 text-right">Título</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.userId} className="border-b border-border/40">
                    <td className="py-2 pr-2 font-semibold">{l.posicao <= 3 ? ['🥇', '🥈', '🥉'][l.posicao - 1] : `${l.posicao}º`}</td>
                    <td className="px-2 py-2">
                      <span className="font-medium">{l.nome}</span>
                      {l.embaixadorDesde && <span className="ml-1" title={`Embaixador Oficial desde ${new Date(l.embaixadorDesde).toLocaleDateString('pt-BR')}${l.nota ? ` — ${l.nota}` : ''}`}>👑</span>}
                      {l.sugerido && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">sugerido</span>}
                    </td>
                    <td className="px-2 py-2 text-right">{l.assinantes}</td>
                    <td className="px-2 py-2 text-right font-medium text-emerald-600">{brl(l.receitaCents)}</td>
                    <td className="px-2 py-2 text-right">{l.renovacaoPct === null ? '—' : `${l.renovacaoPct}%`}</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{brl(l.comissaoCents)}</td>
                    <td className="py-2 pl-2 text-right">
                      {l.embaixadorDesde ? (
                        <Button size="sm" variant="ghost" disabled={ocupado === l.userId} onClick={() => void revogar(l)}>Revogar</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="gap-1 border-amber-400/60 text-amber-600" disabled={ocupado === l.userId} onClick={() => void condecorar(l)}>
                          <Crown className="h-3.5 w-3.5" /> Condecorar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {linhas.length > 15 && (
            <Button variant="ghost" size="sm" onClick={() => setMostrarTodos((v) => !v)}>
              {mostrarTodos ? 'Mostrar só os 15 primeiros' : `Ver todos os ${linhas.length}`}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            "Sugerido" = entre os 10 primeiros do período com R$ 50 ou mais de receita. Quem decide é você. Condecorar dá selo 👑 no perfil,
            destaque na busca, Premium grátis e suporte prioritário, e avisa o promotor por e-mail, notificação e push.
          </p>
        </>
      )}
    </div>
  );
}
