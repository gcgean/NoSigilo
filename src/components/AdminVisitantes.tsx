import { useCallback, useEffect, useState } from 'react';
import { Loader2, Smartphone, TrendingDown, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { adminVisitantesService, type CadastroPassos, type TesteEspiar, type UsoDoApp, type VisitantesRelatorio } from '@/services/api';

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
  const [passos, setPassos] = useState<CadastroPassos | null>(null);
  const [teste, setTeste] = useState<TesteEspiar | null>(null);
  const [uso, setUso] = useState<UsoDoApp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const [relatorio, cadastro, ab, app] = await Promise.all([
        adminVisitantesService.relatorio(dias),
        adminVisitantesService.cadastroPassos(dias).catch(() => null),
        adminVisitantesService.testeEspiar(dias).catch(() => null),
        adminVisitantesService.usoDoApp(dias).catch(() => null),
      ]);
      setDados(relatorio);
      setPassos(cadastro);
      setTeste(ab);
      setUso(app);
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

          {uso && (
            <Card className="p-4 space-y-3">
              <div>
                <h4 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4" /> App instalado x navegador</h4>
                <p className="text-xs text-muted-foreground">
                  Quem abre pelo aplicativo instalado e quem abre pelo navegador, e quanto de cada grupo assina.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { titulo: '📲 Pelo app instalado', v: uso.visitas.app, c: uso.contas.comApp },
                  { titulo: '🌐 Pelo navegador', v: uso.visitas.navegador, c: uso.contas.semApp },
                ].map(({ titulo, v, c }) => (
                  <div key={titulo} className="rounded-xl border border-border/60 p-3">
                    <p className="text-sm font-semibold">{titulo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {v.visitas.toLocaleString('pt-BR')} aberturas de {v.pessoas.toLocaleString('pt-BR')} pessoas no período
                    </p>
                    <p className="mt-2 text-2xl font-bold">{c.pctAssina}%</p>
                    <p className="text-xs text-muted-foreground">
                      assinam ({c.assinantes.toLocaleString('pt-BR')} de {c.total.toLocaleString('pt-BR')} contas)
                    </p>
                  </div>
                ))}
              </div>
              {uso.contas.comApp.total > 30 && (
                <p className="text-sm">
                  {uso.contas.comApp.pctAssina > uso.contas.semApp.pctAssina ? (
                    <span className="font-semibold text-emerald-600">
                      Quem instala assina mais: {Math.round((uso.contas.comApp.pctAssina - uso.contas.semApp.pctAssina) * 10) / 10} pontos percentuais de diferença. Vale insistir no convite.
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Ainda não há vantagem clara de quem usa o app.</span>
                  )}
                </p>
              )}
            </Card>
          )}

          {teste && (teste.semBotao.visitantes > 0 || teste.comBotao.visitantes > 0) && (
            <Card className="p-4 space-y-3">
              <div>
                <h4 className="font-semibold">Teste do botão Espiar</h4>
                <p className="text-xs text-muted-foreground">
                  Metade dos visitantes vê o botão na página inicial e metade não. Comparando quanto cada grupo virou cadastro.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { titulo: 'Sem o botão', g: teste.semBotao },
                  { titulo: 'Com o botão Espiar', g: teste.comBotao },
                ].map(({ titulo, g }) => (
                  <div key={titulo} className="rounded-xl border border-border/60 p-3 text-center">
                    <p className="text-xs text-muted-foreground">{titulo}</p>
                    <p className="text-2xl font-bold">{g.pctCadastro}%</p>
                    <p className="text-xs text-muted-foreground">
                      {g.cadastros.toLocaleString('pt-BR')} cadastros de {g.visitantes.toLocaleString('pt-BR')} visitantes
                    </p>
                    <p className="text-xs text-muted-foreground">{g.assinantes.toLocaleString('pt-BR')} viraram assinantes</p>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                {teste.confiavel ? (
                  <span className={teste.diferencaPct > 0 ? 'font-semibold text-emerald-600' : teste.diferencaPct < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
                    {teste.diferencaPct > 0
                      ? `O botão está ajudando: ${teste.diferencaPct} pontos percentuais a mais de cadastro.`
                      : teste.diferencaPct < 0
                        ? `O botão está atrapalhando: ${Math.abs(teste.diferencaPct)} pontos percentuais a menos de cadastro.`
                        : 'Empate entre os dois grupos até agora.'}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Ainda é cedo para decidir: espere pelo menos 200 visitantes em cada grupo.
                  </span>
                )}
                <span className="ml-1 text-muted-foreground">{teste.abriramEspiar.toLocaleString('pt-BR')} pessoas abriram o espião no período.</span>
              </p>
            </Card>
          )}

          {passos && passos.etapas[0].pessoas > 0 && (
            <Card className="p-4 space-y-3">
              <div>
                <h4 className="font-semibold">Onde elas param dentro do cadastro</h4>
                <p className="text-xs text-muted-foreground">
                  Medido etapa a etapa, sem guardar nada do que a pessoa digita. Só conta quem abriu o cadastro depois que esta medição entrou no ar.
                </p>
              </div>
              <div className="space-y-2">
                {passos.etapas.map((e) => (
                  <div key={e.etapa} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm">{e.etapa}</span>
                      <span className="text-sm font-semibold">
                        {e.pessoas.toLocaleString('pt-BR')}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{e.pct}%</span>
                        {e.perdeu > 0 && <span className="ml-2 text-xs font-normal text-destructive">-{e.perdeu.toLocaleString('pt-BR')} aqui</span>}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.max(1, e.pct)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {passos.travas.length > 0 && (
                <div className="border-t border-border/50 pt-3">
                  <p className="mb-1.5 text-sm font-semibold">Campos que mais travaram</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {passos.travas.map((t) => (
                      <li key={t.campo}>
                        <span className="font-medium text-foreground">{t.campo}</span>: barrou {t.pessoas.toLocaleString('pt-BR')} pessoa(s), {t.vezes.toLocaleString('pt-BR')} vez(es).
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

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
