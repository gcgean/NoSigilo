import { MANUAL_DO_SISTEMA } from './supportAiConhecimento.js';

// ─── Analista IA do admin ────────────────────────────────────────────────────
//
// Responde perguntas do dono sobre os dashboards que ele está vendo. A tela
// manda os dados de cada painel aberto (utils/paineisParaIa.ts); aqui eles são
// limpos, reduzidos e enviados ao DeepSeek com o contexto do negócio.
//
// Usa o deepseek-reasoner: análise de números com cruzamento entre painéis é o
// caso em que raciocinar antes compensa a espera. Se ele gastar a saída toda
// raciocinando e não escrever resposta, repete no deepseek-chat.

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const LIMITE_DA_CHAMADA_MS = 150_000;
const MAX_ITENS_POR_LISTA = 40;
const MAX_CARACTERES_DOS_DADOS = 120_000;

// Campos pessoais nunca vão para o provedor externo, mesmo que um painel os
// publique por engano. A comparação é pelo nome do campo, em qualquer nível.
const CAMPO_PESSOAL = /^(e-?mail|user_?email|phone|telefone|whatsapp|avatar|user_?avatar|ip|ip_?hash|ip_?address|cpf|cnpj|document|billing_?document|pix|pix_?key|token|password|password_?hash|name|full_?name|user_?name|legal_?name|user_?id|id|invitee_?email|subscriber_?user_?id|customer_?id)$/i;

export type PainelRecebido = { nome: string; aba?: string; filtros?: unknown; dados?: unknown; atualizadoEm?: string };
export type MensagemAnalista = { role: 'user' | 'assistant'; content: string };

function limpar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 8) return '[…]';
  if (Array.isArray(valor)) {
    const itens = valor.slice(0, MAX_ITENS_POR_LISTA).map((v) => limpar(v, profundidade + 1));
    if (valor.length > MAX_ITENS_POR_LISTA) itens.push(`[+${valor.length - MAX_ITENS_POR_LISTA} itens omitidos]`);
    return itens;
  }
  if (valor && typeof valor === 'object') {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPO_PESSOAL.test(chave)) continue;
      saida[chave] = limpar(v, profundidade + 1);
    }
    return saida;
  }
  if (typeof valor === 'string' && valor.includes('@') && /\S+@\S+\.\S+/.test(valor)) return '[e-mail removido]';
  return valor;
}

export function prepararPaineis(paineis: PainelRecebido[]): string {
  const partes = paineis.map((p) =>
    JSON.stringify({ painel: p.nome, aba: p.aba, filtros: limpar(p.filtros), atualizado_em: p.atualizadoEm, dados: limpar(p.dados) })
  );
  let texto = partes.join('\n\n');
  if (texto.length > MAX_CARACTERES_DOS_DADOS) {
    texto = `${texto.slice(0, MAX_CARACTERES_DOS_DADOS)}\n[dados cortados por tamanho]`;
  }
  return texto;
}

const PROMPT_ANALISTA = `Você é o analista de dados e crescimento do NoSigilo, conversando com o dono. Ele está no painel admin e te mostra os dados dos dashboards abertos. Seu papel é ajudar a tomar decisões.

Como analisar:
- Baseie tudo nos números recebidos. Cite os números que sustentam cada conclusão (ex.: "3.194 cadastros em 30 dias, 41% homens").
- Não invente dado. Se a pergunta precisa de algo que não está nos painéis, diga qual painel ou filtro abrir.
- Procure o que importa para decisão: tendências e mudanças de ritmo, concentração (cidades, origens, gêneros), gargalos de conversão (cadastro → tentativa de pagamento → pagamento → renovação), receita e churn, sazonalidade por dia da semana.
- Aponte números estranhos que podem ser erro de medição (zeros inesperados, quedas bruscas, totais que não batem entre painéis) antes de concluir em cima deles.
- Separe fato de hipótese. Hipótese vem com o jeito de confirmar.

Como responder:
- Português do Brasil, direto. Comece pela resposta ou conclusão principal em 1 a 2 frases.
- Depois, no máximo 3 a 5 pontos curtos com os números.
- Termine com recomendações priorizadas: o que fazer, por quê, impacto esperado e como medir. Poucas e boas, não uma lista genérica.
- Use texto simples com listas de hífen. Sem tabelas longas.

Contexto do negócio:
- Receita vem da assinatura Premium de R$ 9,90/mês (PIX pela LivePix, cartão recorrente pela Stripe).
- Homens não têm período grátis e são quem mais paga; mulheres têm 30 dias grátis, casais 15, outros perfis 7. A oferta de perfis de mulheres e casais é o que atrai os pagantes.
- Promotores ganham 20% de cada pagamento dos assinantes que trouxeram; Pix a partir de R$ 10 acumulados.
- Há páginas regionais de SEO por estado e cidade, campanhas e convites como canais de aquisição.

${MANUAL_DO_SISTEMA}`;

async function chamarDeepSeek(
  apiKey: string,
  modelo: 'deepseek-reasoner' | 'deepseek-chat',
  mensagens: Array<{ role: string; content: string }>
): Promise<{ texto: string; motivo?: string }> {
  const resposta = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(LIMITE_DA_CHAMADA_MS),
    body: JSON.stringify({
      model: modelo,
      messages: mensagens,
      // No reasoner o raciocínio conta dentro do limite de saída: com pouco,
      // ele raciocina e não sobra espaço para a resposta.
      max_tokens: modelo === 'deepseek-reasoner' ? 32_000 : 4_000,
      stream: false,
    }),
  });
  if (!resposta.ok) {
    throw new Error(`DeepSeek respondeu HTTP ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  }
  const corpo = (await resposta.json()) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  };
  const escolha = corpo.choices?.[0];
  return { texto: String(escolha?.message?.content || '').trim(), motivo: escolha?.finish_reason };
}

export async function analisarPaineis(params: {
  apiKey: string;
  pergunta: string;
  abaAtiva?: string;
  paineis: PainelRecebido[];
  historico: MensagemAnalista[];
  instrucoesExtras?: string;
}): Promise<{ resposta: string; modelo: string }> {
  const dados = prepararPaineis(params.paineis);
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const sistema = params.instrucoesExtras ? `${PROMPT_ANALISTA}\n\nObservações do dono:\n${params.instrucoesExtras}` : PROMPT_ANALISTA;

  const mensagens = [
    { role: 'system', content: sistema },
    // Histórico só com texto; os dados vão sempre atualizados na última mensagem.
    ...params.historico.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
    {
      role: 'user',
      content:
        `Hoje é ${hoje}. Aba aberta agora: ${params.abaAtiva || 'não informada'}.\n\n` +
        (dados ? `DADOS DOS PAINÉIS ABERTOS:\n${dados}\n\n` : 'Nenhum painel com dados carregados.\n\n') +
        `PERGUNTA: ${params.pergunta}`,
    },
  ];

  const pensado = await chamarDeepSeek(params.apiKey, 'deepseek-reasoner', mensagens);
  if (pensado.texto) return { resposta: pensado.texto, modelo: 'deepseek-reasoner' };

  const direto = await chamarDeepSeek(params.apiKey, 'deepseek-chat', mensagens);
  if (!direto.texto) throw new Error(`DeepSeek não devolveu resposta (${direto.motivo || pensado.motivo || 'sem motivo'})`);
  return { resposta: direto.texto, modelo: 'deepseek-chat' };
}
