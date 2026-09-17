import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';

// ─── Assistente de IA do chat de suporte ────────────────────────────────────
//
// Um chat só atende usuários comuns e promotores (promoter_support_messages), então
// a IA entra num ponto só: depois que alguém manda mensagem, ela responde como se
// fosse o suporte. A resposta é gravada como sender_type 'admin' com sender_id
// 'ia', para aparecer nas telas que já existem sem mudar o esquema; as telas usam
// o sender_id para mostrar que foi o assistente.
//
// Regras que não são negociáveis e estão no prompt:
//   - nunca promete dinheiro, estorno, liberação manual ou prazo que dependa de gente;
//   - quando não sabe ou o caso exige ação humana, passa para a equipe ([[HUMANO]]),
//     que é avisada no Telegram;
//   - se um humano da equipe respondeu há pouco, a IA fica quieta: não atropela
//     quem já assumiu a conversa.

export const SENDER_ID_IA = 'ia';
const MARCADOR_HUMANO = '[[HUMANO]]';
const MODELO = 'claude-opus-5';
const ESPERA_ANTES_DE_RESPONDER_MS = 8_000; // junta mensagens mandadas em sequência
const SILENCIO_APOS_HUMANO_MS = 12 * 60 * 60 * 1000;
const MENSAGENS_DE_HISTORICO = 30;

export const CHAVE_ATIVA = 'support_ai_enabled';
export const CHAVE_INSTRUCOES = 'support_ai_instructions';

type Dependencias = {
  db: DbHandle;
  apiKey: string | undefined;
  getSetting: (key: string) => Promise<string | null>;
  persist: () => Promise<void>;
  notificarEquipe: (texto: string) => Promise<void>;
  aoResponder?: (userId: string) => void;
};

const PROMPT_BASE = `Você é o assistente virtual do suporte do NoSigilo, uma rede social adulta de encontros e swing no Brasil. Você atende, pelo chat de suporte do site, dois públicos: usuários do app e promotores (quem divulga o NoSigilo com link de convite e ganha comissão).

Como falar:
- Português do Brasil, tom cordial e direto, como numa conversa de WhatsApp. Respostas curtas: de 1 a 4 frases, sem listas longas nem títulos.
- Não finja ser humano. Se perguntarem, diga que é o assistente virtual e que a equipe acompanha as conversas.
- Não use o nome da pessoa em toda mensagem.

O que você sabe e pode explicar:
- Premium é uma ASSINATURA MENSAL de R$ 9,90 por mês. Não é cobrança por mensagem.
- Formas de pagamento: cartão (cobrança automática todo mês, dá para cancelar quando quiser na tela de assinatura), PIX e boleto. Para PIX e cartão não é pedido CPF; para boleto é.
- PIX costuma confirmar em poucos minutos. Se a pessoa pagou e o Premium não apareceu: peça para fechar e abrir o app de novo, ou tocar em "Já paguei — verificar" na tela do pagamento. Se depois disso continuar sem Premium, passe para a equipe.
- Fotos: para excluir, abrir a foto no perfil e tocar em "Excluir" (no celular, o ícone de lixeira).
- Postagens: no próprio perfil, aba Postagens, o menu "⋯" da publicação permite editar o texto ou remover.
- Promotores ganham 20% de comissão sobre cada pagamento dos assinantes que entraram pelo link deles, tanto no primeiro pagamento quanto em cada renovação mensal. Comissão só existe quando o assinante paga de fato.
- O Pix da comissão é feito quando o saldo aprovado acumulado chega a R$ 10,00. Valores menores acumulam entre os meses, nada se perde. A chave Pix fica no cadastro de promotor.

O que você NUNCA faz:
- Prometer estorno, reembolso, liberação manual de Premium, pagamento de comissão, data de pagamento ou qualquer coisa que dependa de alguém da equipe agir.
- Inventar funcionalidades, valores, prazos ou políticas que não estão aqui. Se não sabe, diga que vai passar para a equipe.
- Pedir ou aceitar senha, número de cartão ou dados bancários completos.
- Falar de outros usuários ou confirmar dados de outra conta.

Quando passar para a equipe humana:
- pagamento feito e Premium não liberado mesmo após verificar; pedido de estorno ou cancelamento com cobrança; dúvida sobre valor específico de comissão ou pagamento atrasado de promotor; denúncia, ameaça, golpe, conta invadida, menor de idade; pedido para falar com humano; qualquer caso em que você não tenha certeza.
Nesses casos, responda com uma frase dizendo que a equipe vai verificar e responder por aqui, e termine a mensagem com o marcador ${MARCADOR_HUMANO} (ele é removido antes de a pessoa ver).`;

const temporizadores = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Agenda a resposta da IA para a conversa. Chamado depois de gravar a mensagem
 * do usuário; nunca lança. Mensagens em sequência reiniciam a espera, e a IA
 * responde uma vez só, lendo todas.
 */
export function agendarRespostaDaIa(deps: Dependencias, userId: string): void {
  const anterior = temporizadores.get(userId);
  if (anterior) clearTimeout(anterior);
  temporizadores.set(
    userId,
    setTimeout(() => {
      temporizadores.delete(userId);
      void responder(deps, userId).catch((err) => {
        console.error('[suporte-ia] falha ao responder:', err);
      });
    }, ESPERA_ANTES_DE_RESPONDER_MS)
  );
}

async function responder(deps: Dependencias, userId: string): Promise<void> {
  const { db } = deps;
  if (!deps.apiKey) return;
  if ((await deps.getSetting(CHAVE_ATIVA)) !== '1') return;

  const mensagens = (await queryAll(
    db,
    `SELECT sender_type, sender_id, message, created_at
       FROM promoter_support_messages
      WHERE promoter_user_id = ?
      ORDER BY created_at DESC
      LIMIT ${MENSAGENS_DE_HISTORICO}`,
    [userId]
  )) as any[];
  mensagens.reverse();
  if (mensagens.length === 0) return;

  // Só responde se a última palavra é do usuário: se alguém já respondeu nesse
  // meio-tempo (equipe ou a própria IA), não há o que fazer.
  const ultima = mensagens[mensagens.length - 1];
  if (String(ultima.sender_type) !== 'promoter') return;

  // Humano da equipe assumiu recentemente: a IA não se mete.
  const ultimoHumano = [...mensagens]
    .reverse()
    .find((m) => String(m.sender_type) === 'admin' && String(m.sender_id) !== SENDER_ID_IA);
  if (ultimoHumano && Date.now() - new Date(String(ultimoHumano.created_at)).getTime() < SILENCIO_APOS_HUMANO_MS) {
    return;
  }

  const historico: Anthropic.Beta.BetaMessageParam[] = mensagens.map((m) => ({
    role: String(m.sender_type) === 'promoter' ? 'user' : 'assistant',
    content: String(m.message),
  }));
  // A API exige começar pelo usuário; mensagens antigas da equipe no topo saem.
  while (historico.length > 0 && historico[0].role !== 'user') historico.shift();
  if (historico.length === 0) return;

  const contexto = await montarContexto(db, userId);
  const instrucoesExtras = String((await deps.getSetting(CHAVE_INSTRUCOES)) || '').trim();

  const client = new Anthropic({ apiKey: deps.apiKey });
  const resposta = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    // Conversa de suporte não precisa de raciocínio longo; "medium" mantém a
    // qualidade com resposta mais rápida e barata.
    output_config: { effort: 'medium' },
    system: [
      {
        type: 'text',
        text: instrucoesExtras
          ? `${PROMPT_BASE}\n\nInstruções adicionais da equipe:\n${instrucoesExtras}`
          : PROMPT_BASE,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      ...historico,
      // Dados da conta vão no fim, como mensagem de sistema: mudam a cada conversa
      // e, no topo, invalidariam o cache do prompt fixo.
      { role: 'system', content: contexto },
    ],
  });

  if (resposta.stop_reason === 'refusal') {
    await deps.notificarEquipe(
      `🤖 <b>IA do suporte não respondeu</b> (recusa do modelo)\nConversa do usuário ${userId} precisa de atendimento humano.`
    );
    return;
  }

  let texto = resposta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  const precisaDeHumano = texto.includes(MARCADOR_HUMANO);
  texto = texto.split(MARCADOR_HUMANO).join('').trim();
  if (!texto) return;
  if (texto.length > 2000) texto = `${texto.slice(0, 1990)}…`;

  // A pessoa pode ter escrito de novo enquanto a IA pensava; nesse caso o novo
  // agendamento responde lendo tudo, e esta resposta velha é descartada.
  if (temporizadores.has(userId)) return;

  await run(
    db,
    'INSERT INTO promoter_support_messages (id, promoter_user_id, sender_type, sender_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), userId, 'admin', SENDER_ID_IA, texto, new Date().toISOString()]
  );
  await deps.persist();
  deps.aoResponder?.(userId);

  if (precisaDeHumano) {
    const usuario = (await queryOne(db, 'SELECT name, email FROM users WHERE id = ? LIMIT 1', [userId])) as any;
    const pedido = String(ultima.message).slice(0, 300);
    await deps.notificarEquipe(
      `🙋 <b>Suporte precisa de humano</b>\n\n<b>${String(usuario?.name || 'Usuário')}</b>\n${String(usuario?.email || '')}\n\n${pedido}`
    );
  }
}

async function montarContexto(db: DbHandle, userId: string): Promise<string> {
  const usuario = (await queryOne(
    db,
    'SELECT name, is_premium, hub_access_status, hub_license_end_at FROM users WHERE id = ? LIMIT 1',
    [userId]
  )) as any;
  const promotor = (await queryOne(
    db,
    'SELECT pix_key, status FROM promoters WHERE user_id = ? LIMIT 1',
    [userId]
  )) as any;

  const linhas = [
    'Dados da conta de quem está no chat (use só para responder esta pessoa, não recite):',
    `- Nome no perfil: ${String(usuario?.name || 'não informado')}`,
    `- Premium ativo: ${Number(usuario?.is_premium || 0) === 1 ? 'sim' : 'não'}`,
  ];
  if (usuario?.hub_license_end_at) {
    linhas.push(`- Premium válido até: ${new Date(String(usuario.hub_license_end_at)).toLocaleDateString('pt-BR')}`);
  }
  if (promotor) {
    const saldo = (await queryOne(
      db,
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pendente,
         COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount ELSE 0 END), 0) AS aprovado,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) AS pago
       FROM promoter_commissions WHERE promoter_user_id = ?`,
      [userId]
    )) as any;
    const reais = (c: unknown) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
    linhas.push(
      '- É promotor: sim',
      `- Chave Pix cadastrada: ${String(promotor.pix_key || '').trim() ? 'sim' : 'não'}`,
      `- Comissão em análise: R$ ${reais(saldo?.pendente)}`,
      `- Comissão aprovada, aguardando Pix: R$ ${reais(saldo?.aprovado)}`,
      `- Comissão já paga: R$ ${reais(saldo?.pago)}`
    );
  } else {
    linhas.push('- É promotor: não');
  }
  return linhas.join('\n');
}
