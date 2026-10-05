import { useEffect, useState } from 'react';
import { CalendarRange, Loader2, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { adminCidadesPeriodoService, type CidadesPorPeriodo, type CrescimentoLocal } from '@/services/api';

/** YYYY-MM-DD no horário de Brasília. */
const diaLocal = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const formatarDia = (iso: string) => iso.split('-').reverse().join('/');

function CartaoLocal({ item, posicao, unidade }: { item: CrescimentoLocal; posicao: number; unidade: string }) {
  const quente = item.growth >= 50;
  return (
    <div className={cn('rounded-xl border p-3', quente ? 'border-orange-400/30 bg-orange-500/10' : 'border-emerald-400/30 bg-emerald-500/10')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="mb-0.5 text-xs text-muted-foreground">#{posicao}</p>
          <p className="truncate text-sm font-medium">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium">{item.novos}</span> novos &nbsp;·&nbsp; de {item.total} no fim do período
          </p>
        </div>
        <div className={cn('shrink-0 text-right', quente ? 'text-orange-600' : 'text-emerald-600')}>
          <p className="text-lg font-bold leading-none">{quente ? '🔥' : '↑'} {item.novos}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">novos · {item.growth}% {unidade}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Cadastros por cidade/estado num período digitado (ex.: dia 01 ao 10).
 * Separado do "Cidades/Estados em crescimento" (últimos 30 dias), que não mudam.
 * Uma seção por visão: tipo="cidades" ou tipo="estados".
 */
export default function AdminCidadesPorPeriodo({ tipo = 'cidades' }: { tipo?: 'cidades' | 'estados' }) {
  const hoje = diaLocal(new Date());
  const [de, setDe] = useState(`${hoje.slice(0, 8)}01`);
  const [ate, setAte] = useState(hoje);
  const visao = tipo;
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [dados, setDados] = useState<CidadesPorPeriodo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = async (inicio = de, fim = ate) => {
    if (!inicio || !fim) { setErro('Informe a data inicial e a final.'); return; }
    if (inicio > fim) { setErro('A data inicial é depois da final.'); return; }
    setCarregando(true);
    setErro(null);
    try {
      setDados(await adminCidadesPeriodoService.buscar(inicio, fim));
      setMostrarTodas(false);
    } catch (e: any) {
      setErro(e?.response?.data?.message || 'Não foi possível buscar agora.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void buscar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalhos: preenchem as datas e já buscam.
  const atalho = (dias: number | 'mes' | 'mesPassado') => {
    const agora = new Date();
    let inicio: string; let fim = diaLocal(agora);
    if (dias === 'mes') inicio = `${fim.slice(0, 8)}01`;
    else if (dias === 'mesPassado') {
      const primeiroDoMes = new Date(`${fim.slice(0, 8)}01T12:00:00-03:00`);
      const ultimoPassado = new Date(primeiroDoMes.getTime() - 86_400_000);
      fim = diaLocal(ultimoPassado);
      inicio = `${fim.slice(0, 8)}01`;
    } else inicio = diaLocal(new Date(agora.getTime() - (dias - 1) * 86_400_000));
    setDe(inicio); setAte(fim);
    void buscar(inicio, fim);
  };

  const lista = visao === 'cidades' ? dados?.cidades ?? [] : dados?.estados ?? [];
  const visiveis = mostrarTodas ? lista : lista.slice(0, 15);

  return (
    <Card className="glass p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <CalendarRange className="h-4 w-4 text-primary" /> {visao === 'cidades' ? 'Cidades' : 'Estados'} por período
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Escolha as datas (horário de Brasília) e veja quais {visao === 'cidades' ? 'cidades' : 'estados'} mais tiveram cadastros novos nesse intervalo.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          Data inicial
          <Input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} className="mt-1 h-10 w-[160px]" />
        </label>
        <label className="text-xs text-muted-foreground">
          Data final
          <Input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className="mt-1 h-10 w-[160px]" />
        </label>
        <Button className="h-10 gap-1.5" disabled={carregando} onClick={() => void buscar()}>
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Buscar
        </Button>
        <div className="flex flex-wrap gap-1">
          {([[7, '7 dias'], [15, '15 dias'], ['mes', 'Este mês'], ['mesPassado', 'Mês passado']] as const).map(([v, rotulo]) => (
            <button key={rotulo} type="button" onClick={() => atalho(v)} className="min-h-[32px] rounded-full bg-muted px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}

      {dados && !erro && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              De <strong>{formatarDia(dados.de)}</strong> a <strong>{formatarDia(dados.ate)}</strong>:{' '}
              <strong>{dados.novosNoPeriodo.toLocaleString('pt-BR')}</strong> cadastros em <strong>{visao === 'cidades' ? dados.totalCidades : dados.estados.length}</strong> {visao === 'cidades' ? 'cidades' : 'estados'}
              {(visao === 'cidades' ? dados.semCidade : dados.semEstado) > 0 && (
                <span className="text-muted-foreground"> ({visao === 'cidades' ? dados.semCidade : dados.semEstado} sem {visao === 'cidades' ? 'cidade' : 'estado'} informado)</span>
              )}
            </p>
          </div>

          {lista.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">Nenhum cadastro nesse período.</p>
          ) : (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {visiveis.map((item, i) => <CartaoLocal key={item.label} item={item} posicao={i + 1} unidade={visao === 'cidades' ? 'da cidade' : 'do estado'} />)}
              </div>
              {lista.length > 15 && (
                <button type="button" className="mt-3 text-xs font-semibold text-primary" onClick={() => setMostrarTodas((v) => !v)}>
                  {mostrarTodas ? 'Mostrar menos' : `Ver todas (${lista.length})`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}
