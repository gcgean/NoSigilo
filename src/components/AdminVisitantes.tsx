import { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingDown, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminVisitantesService, type VisitantesRelatorio } from '@/services/api';

const PERIODOS = [
  { dias: 1, rotulo: 'Hoje' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

const NOMES_ORIGEM: Record<string, string> = {
  direto: 'Direto (digitou o endereço)',
  organic: 'Busca no Google',
  social: 'Redes sociais',
  referral: 'Link de outro site',
  paid: 'Anúncio pago',
  internal: 'Dentro do próprio site',
  mobile: 'Celular',
  desktop: 'Computador',
  tablet: 'Tablet',
};
const nomear = (k: string) => NOMES_ORIGEM[k] ?? k;

function Barra({ linhas, titulo, ajuda }: { linhas: VisitantesRelatorio['porOrigem']; titulo: string; ajuda: string }) {
  const maior = Math.max(1, ...linhas.map((l) => l.visitantes));
  return (
    <Card className="p-4 space-y-3">
      <div>
        <h4 className="font-semibold">{titulo}</h4>
        <p className="text-xs text-muted-foreground">{ajuda}</p>
      </div>
      <div className="space-y-2">
        {linhas.length === 0 && <p className="text-sm text-muted-foreground">Sem dados no período.</p>}
        {linhas.map((l) => (
          <div key={l.chave} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{nomear(l.chave)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {l.visitantes.toLocaleString('pt-BR')} visitantes · <span className={cn('font-semibold', l.pct >= 15 ? 'text-emerald-600' : l.pct >= 5 ? 'text-amber-600' : 'text-destructive')}>{l.pct}% viraram cadastro</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${(l.visitantes / maior) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Topo do funil: quem entra no site sem conta, quanto disso vira cadastro e
 * assinatura, e por onde essas pessoas chegaram. Liga visita e cadastro pelo
 * ip_hash (hash, não identifica ninguém).
 */
export default function AdminVisitantes() {
  const [dias, setDias] = useState(7);
  const [dados, setDados] = useState<VisitantesRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      setDados(await adminVisitantesService.relatorio(dias));
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold"><Users className="h-4 w-4" /> Visitantes que ainda não têm conta</h3>
            <p className="text-xs text-muted-foreground">
              Quantas pessoas entram no site sem estar logadas, quantas criam conta e quantas assinam. Serve para saber se a oferta da página inicial está convertendo.
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
      ) : erro || !dados ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Não foi possível carregar agora.</Card>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <h4 className="font-semibold">Do primeiro acesso até a assinatura</h4>
            <div className="space-y-2">
              {dados.funil.map((e, i) => (
                <div key={e.etapa} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{i + 1}. {e.etapa}</span>
                    <span className="text-sm font-semibold">
                      {e.pessoas.toLocaleString('pt-BR')}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{e.pct}% de quem entrou</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.max(1, e.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-2 border-destructive/25">
            <h4 className="flex items-center gap-2 font-semibold"><TrendingDown className="h-4 w-4 text-destructive" /> Onde você está perdendo gente</h4>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="font-semibold text-destructive">{dados.perdas.naoCadastraram.toLocaleString('pt-BR')}</span> pessoas entraram e foram embora sem criar conta.
              </li>
              <li>
                <span className="font-semibold">{dados.perdas.soUmaPagina.toLocaleString('pt-BR')}</span> viram só uma página e saíram — normalmente a oferta não prendeu ou a página demorou a abrir.
              </li>
              <li>
                <span className="font-semibold">{dados.perdas.desistiramNoCadastro.toLocaleString('pt-BR')}</span> chegaram a abrir o cadastro e desistiram no meio ({dados.perdas.pctDesistenciaNoCadastro}% de quem abriu). É o ponto mais barato de melhorar: são pessoas já convencidas.
              </li>
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Barra linhas={dados.porOrigem} titulo="De onde elas vêm" ajuda="Compare a conversão: origem com muita visita e pouco cadastro é dinheiro na mesa." />
            <Barra linhas={dados.porAparelho} titulo="Em que aparelho" ajuda="Se o celular converte bem menos, o problema costuma ser a tela de cadastro no celular." />
          </div>

          <Barra linhas={dados.porDominio} titulo="Sites que mais mandam gente" ajuda="Domínio que trouxe visitantes no período e quanto de cada um virou cadastro." />
        </>
      )}
    </div>
  );
}
