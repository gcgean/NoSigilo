import { useEffect, useState, useCallback } from 'react';
import { adminService } from '@/services/api';
import { cn } from '@/lib/utils';
import {
  Users, TrendingUp, Activity, DollarSign,
  RefreshCw, Filter, MapPin, UserCheck,
  MessageSquare, Heart, Eye, Camera, Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Metrics = Awaited<ReturnType<typeof adminService.getMetrics>>;

function Stat({
  label, value, sub, color = 'primary', icon: Icon,
}: {
  label: string; value: number | string; sub?: string; color?: string; icon?: React.ElementType;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-1">
      <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', `text-${color}-500`)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function pct(num: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((num / total) * 100)}%`;
}

function Bar({ label, value, max, color = 'bg-primary' }: { label: string; value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const GENDER_OPTIONS = [
  { value: 'all', label: 'Todos os gêneros' },
  { value: 'Homem', label: 'Homem' },
  { value: 'Mulher', label: 'Mulher' },
  { value: 'Casal (Ele/Ela)', label: 'Casal (Ele/Ela)' },
  { value: 'Casal (Ele/Ele)', label: 'Casal (Ele/Ele)' },
  { value: 'Casal (Ela/Ela)', label: 'Casal (Ela/Ela)' },
  { value: 'Transexual', label: 'Transexual' },
  { value: 'Crossdresser (CD)', label: 'Crossdresser' },
  { value: 'Travesti', label: 'Travesti' },
];

export default function AdminMetrics() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [gender, setGender] = useState('');
  const [cityQuery, setCityQuery] = useState(''); // busca dentro da lista completa de cidades

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await adminService.getMetrics({
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        gender: (gender && gender !== 'all') ? gender : undefined,
      });
      setData(m);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [city, state, gender]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const m = data!;
  const total = m.acquisition.total;
  const maxCity = Math.max(...m.acquisition.byCity.map((c) => c.count), 1);
  const maxState = Math.max(...m.acquisition.byState.map((s) => s.count), 1);
  const maxGender = Math.max(...m.acquisition.byGender.map((g) => g.count), 1);
  const maxOrigin = Math.max(...m.acquisition.byOrigin.map((o) => o.count), 1);

  // Chart: registrations per day
  const dayMax = Math.max(...m.acquisition.byDay.map((d) => d.count), 1);

  // Contagem exata por estado/cidade: somas para descobrir os "não informados"
  const stateSum = m.acquisition.byState.reduce((acc, s) => acc + s.count, 0);
  const citySum = m.acquisition.byCity.reduce((acc, c) => acc + c.count, 0);
  const stateNoInfo = Math.max(0, total - stateSum);
  const cityNoInfo = Math.max(0, total - citySum);
  const cityQ = cityQuery.trim().toLowerCase();
  const filteredCities = cityQ
    ? m.acquisition.byCity.filter((c) => `${c.city} ${c.uf || ''}`.toLowerCase().includes(cityQ))
    : m.acquisition.byCity;

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-4">
        <Filter className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
        <div className="space-y-1 min-w-[140px]">
          <p className="text-xs font-medium text-muted-foreground">Cidade</p>
          <Input placeholder="ex: Fortaleza" value={city} onChange={(e) => setCity(e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="space-y-1 min-w-[80px]">
          <p className="text-xs font-medium text-muted-foreground">Estado (UF)</p>
          <Input placeholder="ex: CE" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} className="h-8 text-sm w-20" />
        </div>
        <div className="space-y-1 min-w-[160px]">
          <p className="text-xs font-medium text-muted-foreground">Gênero</p>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={load} disabled={loading} className="h-8 gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {loading ? 'Carregando…' : 'Atualizar'}
        </Button>
      </div>

      {/* ── AQUISIÇÃO ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-4 w-4" /> Aquisição
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total cadastros" value={total.toLocaleString('pt-BR')} icon={Users} color="violet" />
          <Stat label="Hoje" value={m.acquisition.today} sub="cadastros" icon={TrendingUp} color="emerald" />
          <Stat label="Últimos 7 dias" value={m.acquisition.last7days} sub="cadastros" color="sky" />
          <Stat label="Últimos 30 dias" value={m.acquisition.last30days} sub="cadastros" color="amber" />
        </div>

        {/* Mini chart — registrations per day */}
        {m.acquisition.byDay.length > 0 && (
          <div className="mt-4 rounded-xl border p-4">
            <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cadastros por dia (últimos 30 dias)</p>
            <div className="flex items-end gap-0.5 h-16">
              {m.acquisition.byDay.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.count}`}>
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(4, Math.round((d.count / dayMax) * 56))}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{m.acquisition.byDay[0]?.date.slice(5)}</span>
              <span>{m.acquisition.byDay[m.acquisition.byDay.length - 1]?.date.slice(5)}</span>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* By Gender */}
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por Gênero</p>
            {m.acquisition.byGender.map((g) => (
              <Bar key={g.gender} label={g.gender} value={g.count} max={maxGender} color="bg-violet-500" />
            ))}
          </div>
          {/* By City */}
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1"><MapPin className="h-3 w-3" />Top Cidades</p>
            {m.acquisition.byCity.slice(0, 10).map((c) => (
              <Bar key={`${c.city}-${c.uf || ''}`} label={c.uf ? `${c.city}/${c.uf}` : c.city} value={c.count} max={maxCity} color="bg-emerald-500" />
            ))}
          </div>
          {/* By State */}
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por Estado</p>
            {m.acquisition.byState.slice(0, 10).map((s) => (
              <Bar key={s.state} label={s.state} value={s.count} max={maxState} color="bg-sky-500" />
            ))}
          </div>
          {/* By Origin */}
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Por Origem</p>
            {m.acquisition.byOrigin.slice(0, 10).map((o) => (
              <Bar key={o.origin} label={o.origin || 'Direto'} value={o.count} max={maxOrigin} color="bg-amber-500" />
            ))}
          </div>
        </div>

        {/* ── Contagem exata por estado e cidade ── */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Por estado — completo */}
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Usuários por estado — contagem exata
              </p>
              <span className="text-[11px] text-muted-foreground">{m.acquisition.byState.length} UF(s)</span>
            </div>
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {m.acquisition.byState.map((s, i) => (
                <div key={s.state} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-xs text-muted-foreground">#{i + 1}</span>
                    {s.state}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{s.count.toLocaleString('pt-BR')}</span>
                    <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">{pct(s.count, total)}</span>
                  </span>
                </div>
              ))}
              {stateNoInfo > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span>Não informado</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{stateNoInfo.toLocaleString('pt-BR')}</span>
                    <span className="w-12 text-right text-[11px] tabular-nums">{pct(stateNoInfo, total)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Por cidade — completo + busca */}
          <div className="rounded-xl border p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Usuários por cidade — contagem exata
              </p>
              <span className="text-[11px] text-muted-foreground">{m.acquisition.byCity.length} cidade(s)</span>
            </div>
            <Input
              placeholder="Buscar cidade ou UF…"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              className="mb-3 h-8 text-sm"
            />
            <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {filteredCities.length === 0 ? (
                <p className="px-1 py-4 text-sm text-muted-foreground">Nenhuma cidade encontrada.</p>
              ) : (
                filteredCities.map((c, i) => (
                  <div key={`${c.city}-${c.uf || ''}`} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs text-muted-foreground">#{i + 1}</span>
                      {c.uf ? `${c.city}/${c.uf}` : c.city}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">{c.count.toLocaleString('pt-BR')}</span>
                      <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">{pct(c.count, total)}</span>
                    </span>
                  </div>
                ))
              )}
              {!cityQ && cityNoInfo > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <span>Não informado</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums">{cityNoInfo.toLocaleString('pt-BR')}</span>
                    <span className="w-12 text-right text-[11px] tabular-nums">{pct(cityNoInfo, total)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── ATIVAÇÃO ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <UserCheck className="h-4 w-4" /> Ativação
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Adicionou foto" value={m.activation.addedPhoto} sub={pct(m.activation.addedPhoto, total)} icon={Camera} color="pink" />
          <Stat label="Adicionou vídeo" value={m.activation.addedVideo} sub={pct(m.activation.addedVideo, total)} icon={Video} color="violet" />
          <Stat label="Curtiu perfil" value={m.activation.likedProfile} sub={pct(m.activation.likedProfile, total)} icon={Heart} color="rose" />
          <Stat label="Recebeu curtida" value={m.activation.receivedLike} sub={pct(m.activation.receivedLike, total)} icon={Heart} color="red" />
          <Stat label="Enviou mensagem" value={m.activation.sentFirstMessage} sub={pct(m.activation.sentFirstMessage, total)} icon={MessageSquare} color="sky" />
          <Stat label="Visitou perfil" value={m.activation.visitedProfile} sub={pct(m.activation.visitedProfile, total)} icon={Eye} color="teal" />
        </div>

        {/* Activation funnel */}
        <div className="mt-4 rounded-xl border p-4 space-y-2">
          <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Funil de Ativação (% do total)</p>
          {[
            { label: 'Cadastrados', value: total, color: 'bg-muted-foreground/40' },
            { label: 'Adicionou foto', value: m.activation.addedPhoto, color: 'bg-pink-500' },
            { label: 'Visitou perfil', value: m.activation.visitedProfile, color: 'bg-teal-500' },
            { label: 'Curtiu alguém', value: m.activation.likedProfile, color: 'bg-rose-500' },
            { label: 'Enviou mensagem', value: m.activation.sentFirstMessage, color: 'bg-sky-500' },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <span className="w-36 shrink-0 text-xs">{step.label}</span>
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full', step.color)} style={{ width: pct(step.value, total) }} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
                {step.value.toLocaleString('pt-BR')} <span className="text-muted-foreground font-normal">({pct(step.value, total)})</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── RETENÇÃO ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <Activity className="h-4 w-4" /> Retenção
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ativos hoje" value={m.retention.activeToday} sub={pct(m.retention.activeToday, total)} icon={Activity} color="emerald" />
          <Stat label="Ativos 7 dias" value={m.retention.active7days} sub={pct(m.retention.active7days, total)} color="sky" />
          <Stat label="Ativos 30 dias" value={m.retention.active30days} sub={pct(m.retention.active30days, total)} color="violet" />
          <Stat label="Voltaram + de 1x" value={m.retention.active2plusWeek} sub="esta semana" color="amber" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Nunca voltaram" value={m.retention.neverReturned} sub={pct(m.retention.neverReturned, total)} color="red" />
          <Stat label="Inativos 3+ dias" value={m.retention.inactiveSince3days} sub={pct(m.retention.inactiveSince3days, total)} color="orange" />
          <Stat label="Inativos 7+ dias" value={m.retention.inactiveSince7days} sub={pct(m.retention.inactiveSince7days, total)} color="orange" />
          <Stat label="Inativos 15+ dias" value={m.retention.inactiveSince15days} sub={pct(m.retention.inactiveSince15days, total)} color="red" />
        </div>

        {/* Retenção visual */}
        <div className="mt-4 rounded-xl border p-4 space-y-2">
          <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Janelas de Retenção</p>
          {[
            { label: 'Ativos hoje', value: m.retention.activeToday, color: 'bg-emerald-500' },
            { label: 'Ativos últimos 7d', value: m.retention.active7days, color: 'bg-sky-500' },
            { label: 'Ativos últimos 30d', value: m.retention.active30days, color: 'bg-violet-500' },
            { label: 'Inativos 3d+', value: m.retention.inactiveSince3days, color: 'bg-amber-500' },
            { label: 'Inativos 7d+', value: m.retention.inactiveSince7days, color: 'bg-orange-500' },
            { label: 'Inativos 15d+', value: m.retention.inactiveSince15days, color: 'bg-red-500' },
            { label: 'Inativos 30d+', value: m.retention.inactiveSince30days, color: 'bg-red-700' },
            { label: 'Nunca voltaram', value: m.retention.neverReturned, color: 'bg-destructive' },
          ].map((row) => (
            <Bar key={row.label} label={row.label} value={row.value} max={total} color={row.color} />
          ))}
        </div>
      </section>

      {/* ── RECEITA ── */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          <DollarSign className="h-4 w-4" /> Receita & Conversão
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total pagantes" value={m.revenue.totalPaying} sub={pct(m.revenue.totalPaying, total)} icon={DollarSign} color="emerald" />
          <Stat label="Homens pagantes" value={m.revenue.payingMen} sub="assinantes ativos" color="sky" />
          <Stat label="Usuários em trial" value={m.revenue.trialCount} sub={pct(m.revenue.trialCount, total)} color="violet" />
          <Stat label="Trial → Pago" value={`${m.revenue.trialConversionRate}%`} sub={`${m.revenue.trialConverted} convertidos`} color="amber" />
        </div>
      </section>
    </div>
  );
}
