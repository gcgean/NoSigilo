import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import apiClient from '@/utils/apiClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Admin › Anúncios: cada campanha (canal + janela + valor investido) e o que
 * ela trouxe: cadastros pelo canal dentro da janela e tudo o que essas pessoas
 * já pagaram (extrato do Hub). O faturamento cresce com o tempo (renovações e
 * casais que assinam no fim do teste grátis).
 */
type PorTipo = Record<string, { cadastros: number; pagantes: number; receitaCents: number }>;
type Campanha = {
  id: string; nome: string; canal: string; inicio: string; fim: string; valorCents: number;
  cadastros: number; pagantes: number; pagamentos: number; receitaCents: number; retorno: number | null;
  custoPorCadastroCents: number | null; custoPorPaganteCents: number | null; porTipo: PorTipo;
};

const brl = (c: number | null) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ROTULO: Record<string, string> = { homem: '👨 Homens', casal: '💑 Casais', mulher: '👩 Mulheres', outros: '🌈 Outros' };
// datetime-local precisa de "YYYY-MM-DDTHH:mm" no horário local
const paraCampo = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function AdminAnuncios() {
  const { toast } = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const agora = new Date();
  const [nome, setNome] = useState('');
  const [canal, setCanal] = useState('Instagram');
  const [inicio, setInicio] = useState(paraCampo(new Date(agora.getTime() - 24 * 3600_000)));
  const [fim, setFim] = useState(paraCampo(agora));
  const [valor, setValor] = useState('');

  const carregar = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/admin/anuncios', { timeout: 60_000 });
      setCampanhas(data.campanhas ?? []);
      setIndisponivel(!!data.extratoIndisponivel);
    } catch { setCampanhas([]); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const adicionar = async () => {
    const reais = Number(valor.replace(/\./g, '').replace(',', '.'));
    if (!nome.trim() || !Number.isFinite(reais)) { toast({ title: 'Preencha o nome e o valor investido.' }); return; }
    try {
      await apiClient.post('/admin/anuncios', { nome: nome.trim(), canal: canal.trim(), inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString(), valorCents: Math.round(reais * 100) });
      setNome(''); setValor('');
      toast({ title: 'Campanha adicionada' });
      await carregar();
    } catch (e) { toast({ title: (e as any)?.response?.data?.message || 'Não foi possível salvar.', variant: 'destructive' }); }
  };
  const remover = async (c: Campanha) => {
    if (!window.confirm(`Remover a campanha "${c.nome}"?`)) return;
    await apiClient.delete(`/admin/anuncios/${c.id}`).catch(() => {});
    await carregar();
  };

  const melhor = (campanhas ?? []).filter((c) => c.custoPorPaganteCents != null).sort((a, b) => (a.custoPorPaganteCents ?? 0) - (b.custoPorPaganteCents ?? 0))[0]?.id;
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <p className="font-semibold">📣 Nova campanha de anúncio</p>
        <p className="text-xs text-muted-foreground">
          Cadastros = quem chegou pelo canal dentro da janela (origem do primeiro acesso). Faturamento = tudo o que essas pessoas já pagaram.
          Para separar bem, use no link do anúncio <code>?utm_source=instagram_ads</code> e cadastre o canal como "Campanha: instagram_ads".
        </p>
        <div className="grid gap-2 sm:grid-cols-5">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Instagram R$200 casais)" className="rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2" />
          <input value={canal} onChange={(e) => setCanal(e.target.value)} placeholder="Canal (ex.: Instagram)" className="rounded-lg border bg-background px-3 py-2 text-sm" />
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Investido (R$)" inputMode="decimal" className="rounded-lg border bg-background px-3 py-2 text-sm" />
          <Button onClick={() => void adicionar()}>Adicionar</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">Início <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded-md border bg-background px-2 py-1" /></label>
          <label className="flex items-center gap-1">Fim <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className="rounded-md border bg-background px-2 py-1" /></label>
        </div>
      </div>

      {indisponivel && <p className="text-xs text-amber-600">⚠️ O extrato de pagamentos não respondeu agora; o faturamento pode aparecer zerado. Recarregue em instantes.</p>}
      {campanhas === null && <p className="text-sm text-muted-foreground">Calculando…</p>}

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="p-3">Campanha</th>
              <th className="p-3">Janela</th>
              <th className="p-3">Investido</th>
              <th className="p-3">Cadastros</th>
              <th className="p-3">Pagantes</th>
              <th className="p-3">Faturado</th>
              <th className="p-3">Lucro / prejuízo</th>
              <th className="p-3">Retorno</th>
              <th className="p-3">Custo / cadastro</th>
              <th className="p-3">Custo / pagante</th>
              <th className="p-3">Por tipo de perfil</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(campanhas ?? []).map((c) => (
              <tr key={c.id} className={cn('border-b last:border-0', c.id === melhor && 'bg-emerald-500/5')}>
                <td className="p-3 font-semibold">{c.nome}{c.id === melhor && <span className="ml-1 text-xs text-emerald-600">⭐ melhor custo</span>}<div className="text-xs font-normal text-muted-foreground">{c.canal}</div></td>
                <td className="p-3 text-xs">{quando(c.inicio)} → {quando(c.fim)}</td>
                <td className="p-3">{brl(c.valorCents)}</td>
                <td className="p-3">{c.cadastros}</td>
                <td className="p-3">{c.pagantes}</td>
                <td className="p-3 font-bold text-emerald-600">{brl(c.receitaCents)}</td>
                <td className={cn('p-3 font-bold whitespace-nowrap', c.receitaCents - c.valorCents < 0 ? 'text-rose-600' : 'text-emerald-600')}>{c.receitaCents - c.valorCents < 0 ? '−' : '+'}{brl(Math.abs(c.receitaCents - c.valorCents))}</td>
                <td className={cn('p-3 font-bold', c.retorno != null && c.retorno < 1 ? 'text-rose-600' : 'text-emerald-600')}>{c.retorno == null ? '—' : `${c.retorno.toFixed(2).replace('.', ',')}×`}</td>
                <td className="p-3">{brl(c.custoPorCadastroCents)}</td>
                <td className="p-3">{brl(c.custoPorPaganteCents)}</td>
                <td className="p-3 text-xs">
                  {Object.entries(c.porTipo).sort((a, b) => b[1].cadastros - a[1].cadastros).map(([t, v]) => (
                    <div key={t}>{ROTULO[t] ?? t}: {v.cadastros} cad. · {v.pagantes} pag. · {brl(v.receitaCents)}</div>
                  ))}
                </td>
                <td className="p-3"><button type="button" onClick={() => void remover(c)} className="rounded p-1.5 text-destructive hover:bg-destructive/10" aria-label="Remover"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Lucro / prejuízo = faturado − investido (antes de taxas e impostos). Retorno = faturado ÷ investido (acima de 1,00× pagou o anúncio). O faturamento de uma campanha continua subindo com renovações e com casais que assinam no fim dos 15 dias grátis.
      </p>
    </div>
  );
}
