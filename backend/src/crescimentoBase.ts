// Crescimento da base mês a mês (horário de Brasília), no total e por país.
// País de cada conta: UF "PT" no perfil = Portugal; perfil sem UF usa o país de
// onde a pessoa mais acessou (Cloudflare); sem nada disso, Brasil.

export type Pais = 'BR' | 'PT' | 'OUTROS';
export const NOMES_PAIS: Record<Pais, string> = { BR: 'Brasil', PT: 'Portugal', OUTROS: 'Outros países' };

export type MesDaBase = {
  mes: string;
  novos: number;
  saidas: number;
  base: number;
  parcial: boolean;
  novosAteODia: number;
  novosAssinantes: number; // primeiro pagamento da conta caiu neste mês
  pagantes: number; // contas diferentes que pagaram neste mês
};

export type ContaDaBase = { id: string; criadoEm: string; pais: Pais; contaNaBase: boolean };
export type SaidaDaBase = { userId: string; em: string };
export type PagamentoDaBase = { userId: string; em: string };

const mesBR = (iso: string) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 7);
const diaBR = (iso: string) => Number(new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(8, 10));

export function paisDaConta(uf: unknown, paisDosAcessos: unknown): Pais {
  const u = String(uf ?? '').trim().toUpperCase();
  if (u === 'PT') return 'PT';
  if (u) return 'BR';
  const p = String(paisDosAcessos ?? '').trim().toUpperCase();
  if (p === 'PT') return 'PT';
  if (!p || p === 'BR' || p === 'XX' || p === 'T1') return 'BR';
  return 'OUTROS';
}

function serie(
  contas: ContaDaBase[], saidas: SaidaDaBase[], pagamentos: PagamentoDaBase[] | null,
  agoraIso: string, inicio: string | null,
): MesDaBase[] {
  const mesAtual = mesBR(agoraIso);
  const hojeDia = diaBR(agoraIso);
  const conta = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const novos = new Map<string, number>();
  const novosAteHoje = new Map<string, number>();
  for (const c of contas) {
    if (!c.contaNaBase || !c.criadoEm) continue;
    const m = mesBR(c.criadoEm);
    conta(novos, m);
    if (diaBR(c.criadoEm) <= hojeDia) conta(novosAteHoje, m);
  }
  const sai = new Map<string, number>();
  for (const s of saidas) if (s.em) conta(sai, mesBR(s.em));
  const primeiro = new Map<string, string>();
  const pagantesPorMes = new Map<string, Set<string>>();
  for (const p of pagamentos ?? []) {
    if (!p.em) continue;
    const m = mesBR(p.em);
    if (!primeiro.has(p.userId) || primeiro.get(p.userId)! > m) primeiro.set(p.userId, m);
    let s = pagantesPorMes.get(m);
    if (!s) pagantesPorMes.set(m, (s = new Set()));
    s.add(p.userId);
  }
  const novosAssin = new Map<string, number>();
  for (const m of primeiro.values()) conta(novosAssin, m);

  const chaves = [...novos.keys(), ...sai.keys()].sort();
  const comeco = inicio ?? chaves[0];
  if (!comeco) return [];
  const meses: MesDaBase[] = [];
  let [ano, mes] = comeco.split('-').map(Number);
  let base = 0;
  while (true) {
    const k = `${ano}-${String(mes).padStart(2, '0')}`;
    const n = novos.get(k) ?? 0;
    const s = sai.get(k) ?? 0;
    base += n - s;
    meses.push({
      mes: k, novos: n, saidas: s, base, parcial: k === mesAtual, novosAteODia: novosAteHoje.get(k) ?? 0,
      novosAssinantes: novosAssin.get(k) ?? 0, pagantes: pagantesPorMes.get(k)?.size ?? 0,
    });
    if (k >= mesAtual) break;
    mes += 1; if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

export function montarCrescimento(input: {
  contas: ContaDaBase[];
  saidas: SaidaDaBase[];
  pagamentos: PagamentoDaBase[] | null; // null = Hub indisponível
  assinantesAtivos: Map<string, number>; // por país, hoje
  agoraIso: string;
}) {
  const { contas, saidas, pagamentos, agoraIso } = input;
  const paisDe = new Map(contas.map((c) => [c.id, c.pais]));
  const naBase = contas.filter((c) => c.contaNaBase && c.criadoEm);
  const chaves = [...naBase.map((c) => mesBR(c.criadoEm)), ...saidas.filter((s) => s.em).map((s) => mesBR(s.em))].sort();
  const inicio = chaves[0] ?? null;
  const meses = serie(contas, saidas, pagamentos, agoraIso, inicio);
  const paises = (['BR', 'PT', 'OUTROS'] as Pais[]).map((pais) => ({
    pais,
    nome: NOMES_PAIS[pais],
    assinantesAtivos: input.assinantesAtivos.get(pais) ?? 0,
    meses: serie(
      contas.filter((c) => c.pais === pais),
      saidas.filter((s) => (paisDe.get(s.userId) ?? 'BR') === pais),
      pagamentos ? pagamentos.filter((p) => paisDe.get(p.userId) === pais) : null,
      agoraIso, inicio,
    ),
  })).filter((p) => p.pais !== 'OUTROS' || p.meses.some((m) => m.novos > 0));
  const totalAtivos = [...input.assinantesAtivos.values()].reduce((a, b) => a + b, 0);
  return {
    meses, mesAtual: mesBR(agoraIso), diaAtual: diaBR(agoraIso),
    assinantesAtivos: totalAtivos, assinantesDisponivel: pagamentos !== null, paises,
  };
}
