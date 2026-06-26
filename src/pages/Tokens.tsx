import { useEffect, useCallback, useState } from 'react';
import { Coins, TrendingUp, Gift, Trophy, Zap, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { tokenService, type TokenSummary, type TokenRankingEntry } from '@/services/api';
import { useSocket } from '@/contexts/SocketContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function formatBoostRemaining(until: string): string {
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 1) return `${h}h${m > 0 ? ` ${m}min` : ''}`;
  return `${m}min`;
}

const ACTION_LABELS: Record<string, string> = {
  like: 'Curtida',
  comment: 'Comentário',
  photo: 'Foto publicada',
  story: 'Story publicado',
  post: 'Post publicado',
  checkin: 'Presença diária',
  convert_day: '🎉 1 dia grátis resgatado',
  gift_received: '🎁 Presente recebido',
  gift_sent: 'Presente enviado',
};

const RANKING_TABS: Array<{ id: 'homem' | 'mulher' | 'casal'; label: string }> = [
  { id: 'homem', label: 'Homens' },
  { id: 'mulher', label: 'Mulheres' },
  { id: 'casal', label: 'Casais' },
];

export default function Tokens() {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [rankTab, setRankTab] = useState<'homem' | 'mulher' | 'casal'>('homem');
  const [ranking, setRanking] = useState<TokenRankingEntry[]>([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [boosting, setBoosting] = useState(false);
  const { on, off } = useSocket();
  const { toast } = useToast();

  const reload = useCallback(() => {
    tokenService.me().then(setSummary).catch(() => {});
  }, []);

  const handleBoost = useCallback(async () => {
    if (boosting) return;
    setBoosting(true);
    try {
      const res = await tokenService.boost();
      reload();
      window.dispatchEvent(new Event('nosigilo:tokens-updated'));
      toast({
        title: '⚡ Perfil em destaque!',
        description: `Seu perfil vai aparecer primeiro na descoberta pelas próximas ${res.boostHours}h.`,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Não foi possível destacar o perfil.';
      toast({ title: 'Ops', description: msg, variant: 'destructive' });
    } finally {
      setBoosting(false);
    }
  }, [boosting, reload, toast]);

  useEffect(() => {
    tokenService.me().then(setSummary).catch(() => {}).finally(() => setLoading(false));
    on('tokens.updated', reload);
    return () => off('tokens.updated', reload);
  }, [on, off, reload]);

  useEffect(() => {
    setRankLoading(true);
    tokenService
      .ranking(rankTab)
      .then((r) => setRanking(r.ranking))
      .catch(() => setRanking([]))
      .finally(() => setRankLoading(false));
  }, [rankTab]);

  const points = summary?.points ?? 0;
  const perDay = summary?.pointsPerDay ?? 100;
  const progress = summary?.nextDayProgress ?? 0;
  const pct = Math.min(100, Math.round((progress / perDay) * 100));

  return (
    <div className="container mx-auto max-w-3xl space-y-5 px-3 py-4 sm:px-4 sm:py-6">
      {/* Saldo */}
      <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/15 via-background to-amber-500/10 p-5">
        <div className="mb-1 flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-400" />
          <h1 className="text-lg font-bold">Seus Tokens</h1>
        </div>
        <p className="text-4xl font-extrabold text-amber-400">
          {points} <span className="text-base font-medium text-muted-foreground">pts</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          A cada {perDay} pontos você ganha <strong className="text-foreground">1 dia grátis</strong> automaticamente.
        </p>

        {/* Progresso */}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Próximo dia grátis</span>
            <span>{progress}/{perDay}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-background/60 p-3 text-center">
            <TrendingUp className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-lg font-bold">{summary?.total ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Total acumulado</p>
          </div>
          <div className="rounded-xl border bg-background/60 p-3 text-center">
            <Gift className="mx-auto mb-1 h-4 w-4 text-emerald-500" />
            <p className="text-lg font-bold">{summary?.freeDays ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">Dias grátis gerados</p>
          </div>
        </div>
      </Card>

      {/* Destaque do perfil (gasta tokens) */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
            <Zap className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Destacar meu perfil</h2>
            {summary?.boostUntil ? (
              <p className="mt-0.5 text-xs text-emerald-500">
                Ativo — seu perfil aparece primeiro por mais {formatBoostRemaining(summary.boostUntil)}.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Apareça <strong className="text-foreground">no topo</strong> da descoberta por {summary?.boostHours ?? 24}h. Mais visitas, curtidas e matches.
              </p>
            )}
          </div>
        </div>
        <Button
          className="mt-3 w-full gap-2 bg-gradient-to-r from-amber-400 to-primary text-white hover:opacity-90"
          disabled={boosting || (summary !== null && summary.points < (summary.boostCost ?? 30))}
          onClick={() => void handleBoost()}
        >
          {boosting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {summary?.boostUntil ? 'Estender destaque' : 'Destacar agora'} · {summary?.boostCost ?? 30} tokens
        </Button>
        {summary !== null && summary.points < (summary.boostCost ?? 30) && !summary.boostUntil && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Você precisa de {summary.boostCost ?? 30} tokens. Interaja para ganhar mais!
          </p>
        )}
      </Card>

      {/* Ranking */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider">Ranking do mês</h2>
        </div>
        <p className="-mt-2 mb-2 text-[11px] text-muted-foreground">
          Conta os pontos ganhos no mês atual. Zera no dia 1º de cada mês — seu saldo e dias grátis não são afetados.
        </p>
        <div className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          🏆 <strong>Prêmio do mês:</strong> top 3 de cada categoria ganham dias premium + selo no perfil — 🥇 7 dias · 🥈 3 dias · 🥉 1 dia.
        </div>
        <div className="mb-3 flex gap-2">
          {RANKING_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setRankTab(t.id)}
              className={cn(
                'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                rankTab === t.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {rankLoading ? (
          <p className="text-sm text-muted-foreground">Carregando ranking...</p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém pontuou nesta categoria ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {ranking.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2',
                  r.isMe ? 'border border-primary/30 bg-primary/10' : 'bg-secondary/30'
                )}
              >
                <span className={cn('w-6 text-center text-sm font-bold', r.position <= 3 ? 'text-amber-400' : 'text-muted-foreground')}>
                  {r.position}
                </span>
                <UserAvatar user={{ name: r.name, avatar: r.avatar }} className="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.name}{r.isMe && ' (você)'}
                </span>
                <span className="shrink-0 text-sm font-bold text-amber-400">{r.total}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Histórico */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Histórico</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (summary?.history.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não gerou tokens. Curta, comente e poste para começar a pontuar!
          </p>
        ) : (
          <div className="space-y-1.5">
            {summary!.history.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{ACTION_LABELS[h.action] ?? h.action}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(h.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span className={cn('shrink-0 text-sm font-bold', h.points >= 0 ? 'text-emerald-500' : 'text-primary')}>
                  {h.points >= 0 ? `+${h.points}` : h.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
