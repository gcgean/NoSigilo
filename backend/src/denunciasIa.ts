/**
 * Triagem das denúncias pela IA.
 *
 * A IA NÃO pune ninguém: ela lê a denúncia junto com o conteúdo denunciado e o
 * histórico do perfil, e devolve uma recomendação com justificativa e nível de
 * gravidade. Banir, advertir ou remover continua sendo um clique do admin —
 * são ações que afetam a vida de um usuário real e não podem sair de um
 * palpite automático. O ganho é a fila chegar ordenada pelo que é grave e com
 * o caso já resumido.
 */
import type { DbHandle } from './db.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODELO = 'deepseek-chat';
const LIMITE_DA_CHAMADA_MS = 60_000;

export const ACOES = ['banir', 'advertir', 'remover_conteudo', 'descartar', 'revisar_humano'] as const;
export type AcaoIa = (typeof ACOES)[number];

export type AnaliseIa = {
  acao: AcaoIa;
  gravidade: number; // 1 = bobagem, 5 = urgente
  justificativa: string;
};

const PROMPT = `Você faz a triagem das denúncias de uma rede social adulta brasileira (NoSigilo), de público 18+, voltada a swing, encontros e conteúdo sexual entre adultos.

O que é PERMITIDO na plataforma e NÃO deve ser punido:
- Nudez, sexo explícito e linguagem pesada entre adultos que consentiram.
- Convite para encontro, troca de casal, fetiches entre adultos.
- Discordância, gosto pessoal, ciúme ou briga boba entre usuários.

O que é GRAVE e precisa de ação imediata (gravidade 5):
- Qualquer indício de menor de idade (fotos, idade citada, "novinha de 15", linguagem infantil).
- Sexo com animais, incesto, conteúdo não consentido, ameaça, extorsão ("vou vazar suas fotos"), venda de conteúdo de terceiros.

Gravidade 3 a 4: assédio insistente depois de recusa, spam de venda, perfil claramente falso usando foto de famoso, golpe pedindo dinheiro.
Gravidade 1 a 2: denúncia vaga, sem prova, ou briga pessoal.

Ações possíveis:
- "banir": só para gravidade 5 ou reincidência grave comprovada.
- "remover_conteudo": o problema está na publicação, não na pessoa.
- "advertir": comportamento errado, mas recuperável.
- "descartar": a denúncia não procede ou o conteúdo é permitido aqui.
- "revisar_humano": faltam elementos para decidir, ou o caso é delicado.

Responda SOMENTE um JSON, sem texto em volta:
{"acao":"...","gravidade":1,"justificativa":"uma frase curta, em português, explicando a decisão para o administrador"}`;

/** Dados que a IA recebe sobre uma denúncia. */
export type ContextoDenuncia = {
  motivo: string;
  detalhes: string | null;
  tipoAlvo: string;
  nomeAlvo: string | null;
  conteudoDenunciado: string | null;
  denunciasAnterioresDoAlvo: number;
  diasDeConta: number | null;
  alvoEhAssinante: boolean;
};

function extrairJson(texto: string): AnaliseIa | null {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const bruto = JSON.parse(texto.slice(inicio, fim + 1));
    const acao = String(bruto.acao || '') as AcaoIa;
    if (!(ACOES as readonly string[]).includes(acao)) return null;
    const gravidade = Math.min(5, Math.max(1, Math.round(Number(bruto.gravidade) || 1)));
    const justificativa = String(bruto.justificativa || '').slice(0, 400);
    return { acao, gravidade, justificativa };
  } catch {
    return null;
  }
}

export async function analisarDenuncia(apiKey: string | undefined, ctx: ContextoDenuncia): Promise<AnaliseIa | null> {
  if (!apiKey) return null;
  const resumo = [
    `Motivo escolhido por quem denunciou: ${ctx.motivo}`,
    ctx.detalhes ? `O que a pessoa escreveu: "${ctx.detalhes}"` : 'Quem denunciou não escreveu nada.',
    `Tipo do alvo: ${ctx.tipoAlvo}${ctx.nomeAlvo ? ` (${ctx.nomeAlvo})` : ''}`,
    ctx.conteudoDenunciado ? `Conteúdo denunciado: "${ctx.conteudoDenunciado.slice(0, 1200)}"` : 'Sem texto no conteúdo denunciado (pode ser foto ou vídeo — nesses casos, use "revisar_humano" quando a decisão depender de ver a imagem).',
    `Denúncias anteriores contra este alvo: ${ctx.denunciasAnterioresDoAlvo}`,
    ctx.diasDeConta === null ? '' : `Conta do alvo tem ${ctx.diasDeConta} dia(s).`,
    ctx.alvoEhAssinante ? 'O alvo é assinante pagante.' : '',
  ].filter(Boolean).join('\n');

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), LIMITE_DA_CHAMADA_MS);
  try {
    const resposta = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: resumo },
        ],
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) {
      console.error('[denunciasIa] DeepSeek respondeu', resposta.status);
      return null;
    }
    const dados = await resposta.json() as any;
    const texto = String(dados?.choices?.[0]?.message?.content || '');
    return extrairJson(texto);
  } catch (erro) {
    console.error('[denunciasIa] falha ao analisar', erro);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Texto do conteúdo denunciado, quando ele for texto. */
export async function textoDoAlvo(
  consultar: (sql: string, params: unknown[]) => Promise<unknown>,
  tipo: string,
  alvoId: string
): Promise<string | null> {
  const tabelas: Record<string, string> = {
    post: 'SELECT content AS texto FROM posts WHERE id = ? LIMIT 1',
    comment: 'SELECT content AS texto FROM comments WHERE id = ? LIMIT 1',
    experience: 'SELECT (title || \' \' || description) AS texto FROM experiences WHERE id = ? LIMIT 1',
    user: 'SELECT (COALESCE(name,\'\') || \' — \' || COALESCE(bio,\'\')) AS texto FROM users WHERE id = ? LIMIT 1',
  };
  const sql = tabelas[tipo];
  if (!sql) return null;
  try {
    const linha = (await consultar(sql, [alvoId])) as any;
    const texto = linha?.texto ? String(linha.texto).trim() : '';
    return texto || null;
  } catch {
    return null;
  }
}
