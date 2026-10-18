import { useEffect, useState } from 'react';
import apiClient from '@/utils/apiClient';

/**
 * Admin › A Casa › Negócio: quanto cada noite fatura e como a economia de
 * tokens se mexe lá dentro. Faturamento = dinheiro que entrou (assinaturas e
 * compras de tokens durante a noite por quem entrou ou espiou). Tokens gastos
 * dentro da Casa passam de um usuário para outro: são movimento, não caixa.
 */
type Noite = {
  noite: string; dia: string; extra: boolean;
  pessoas: number; entraram: number; soEspiaram: number; pico: number;
  falaram: number; mensagens: number; midias: number; cabines: number; expulsos: number; denuncias: number;
  cadastrosPelaCasa: number;
  receita: { assinaturasCents: number; assinaturas: number; convertidosDeEspiao: number; tokensCents: number; compras: number; totalCents: number };
  tokens: { drinks: number; drinksTokens: number; revelacoes: number; revelacoesTokens: number; desafiosCumpridos: number; desafiosTokens: number; premiosDaCasa: number };
};
type Resposta = { noites: Noite[]; extratoIndisponivel: boolean; cadastrosPelaCasa: number; receitaDeQuemVeioPelaCasaCents: number };

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataNoite = (n: Noite) => {
  const [a, m, d] = n.dia.split('-');
  const dt = new Date(Number(a), Number(m) - 1, Number(d));
  return `${dt.toLocaleDateString('pt-BR', { weekday: 'short' })} ${d}/${m}${n.extra ? ' (extra)' : ''}`;
};

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-bold">{valor}</p>
      {detalhe && <p className="text-[11px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

export default function NegocioDaCasa() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    apiClient.get('/casa/admin/negocio', { timeout: 60_000 }).then((r) => setDados(r.data)).catch(() => setErro(true));
  }, []);

  if (erro) return <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Não foi possível carregar o painel de negócio agora.</div>;
  if (!dados) return <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">Calculando o faturamento da Casa…</div>;

  const reais = dados.noites.filter((n) => !n.extra);
  const total = reais.reduce((s, n) => s + n.receita.totalCents, 0);
  const assin = reais.reduce((s, n) => s + n.receita.assinaturasCents, 0);
  const tokensR = reais.reduce((s, n) => s + n.receita.tokensCents, 0);
  const media = reais.length ? total / reais.length : 0;
  const pessoas = reais.reduce((s, n) => s + n.pessoas, 0);
  const convertidos = reais.reduce((s, n) => s + n.receita.convertidosDeEspiao, 0);
  const movimentoTokens = reais.reduce((s, n) => s + n.tokens.drinksTokens + n.tokens.revelacoesTokens + n.tokens.desafiosTokens, 0);
  const premios = reais.reduce((s, n) => s + n.tokens.premiosDaCasa, 0);

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div>
        <p className="font-semibold">💰 A Casa como negócio</p>
        <p className="text-xs text-muted-foreground">
          Faturamento = assinaturas e compras de tokens feitas durante a noite (até 1h depois de fechar) por quem entrou ou espiou a Casa.
          Tokens gastos lá dentro passam de um usuário para outro: aparecem como movimento, não como caixa.
          {dados.extratoIndisponivel && ' ⚠️ O extrato de assinaturas não respondeu agora; os valores de assinatura podem estar zerados.'}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Cartao titulo={`Faturamento (${reais.length} noite${reais.length === 1 ? '' : 's'})`} valor={brl(total)} detalhe={`média ${brl(media)} por noite`} />
        <Cartao titulo="Assinaturas na noite" valor={brl(assin)} detalhe={`${convertidos} espiaram e assinaram`} />
        <Cartao titulo="Compras de tokens na noite" valor={brl(tokensR)} />
        <Cartao titulo="Quem chegou pela Casa" valor={`${dados.cadastrosPelaCasa} cadastros`} detalhe={`já pagaram ${brl(dados.receitaDeQuemVeioPelaCasaCents)}`} />
        <Cartao titulo="Pessoas nas noites" valor={String(pessoas)} detalhe={reais.length ? `média ${Math.round(pessoas / reais.length)} por noite` : undefined} />
        <Cartao titulo="Tokens movimentados lá dentro" valor={`${movimentoTokens} tokens`} detalhe="drinks, revelações e desafios" />
        <Cartao titulo="Tokens dados pela Casa" valor={`${premios} tokens`} detalhe="entrada, quiz, desafios, duelos" />
        <Cartao titulo="Receita por pessoa" valor={pessoas ? brl(total / pessoas) : '—'} />
      </div>

      {dados.noites.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ainda não houve nenhuma noite. Os números aparecem a partir da inauguração.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2">Noite</th>
                <th className="pr-2">Faturou</th>
                <th className="pr-2">Assinaturas</th>
                <th className="pr-2">Tokens comprados</th>
                <th className="pr-2">Pessoas (pico)</th>
                <th className="pr-2">Espiaram → assinaram</th>
                <th className="pr-2">Cadastros pela Casa</th>
                <th className="pr-2">🍸 Drinks</th>
                <th className="pr-2">👀 Revelações</th>
                <th className="pr-2">😈 Desafios</th>
                <th className="pr-2">💬 / 📸 / 🚪</th>
                <th>🚫 / 🚩</th>
              </tr>
            </thead>
            <tbody>
              {dados.noites.map((n) => (
                <tr key={n.noite} className="border-t">
                  <td className="py-1.5 pr-2 font-medium">{dataNoite(n)}</td>
                  <td className="pr-2 font-bold text-emerald-600">{brl(n.receita.totalCents)}</td>
                  <td className="pr-2">{brl(n.receita.assinaturasCents)} ({n.receita.assinaturas})</td>
                  <td className="pr-2">{brl(n.receita.tokensCents)} ({n.receita.compras})</td>
                  <td className="pr-2">{n.pessoas} ({n.pico})</td>
                  <td className="pr-2">{n.soEspiaram} → {n.receita.convertidosDeEspiao}</td>
                  <td className="pr-2">{n.cadastrosPelaCasa}</td>
                  <td className="pr-2">{n.tokens.drinks} · {n.tokens.drinksTokens} tk</td>
                  <td className="pr-2">{n.tokens.revelacoes} · {n.tokens.revelacoesTokens} tk</td>
                  <td className="pr-2">{n.tokens.desafiosCumpridos} · {n.tokens.desafiosTokens} tk</td>
                  <td className="pr-2">{n.mensagens} / {n.midias} / {n.cabines}</td>
                  <td>{n.expulsos} / {n.denuncias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
