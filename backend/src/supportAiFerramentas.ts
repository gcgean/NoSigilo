import type { DbHandle } from './db.js';
import { queryAll, queryOne } from './db.js';

// ─── Consultas que a IA do suporte pode fazer ───────────────────────────────
//
// A regra de segurança está no código, não no prompt: toda consulta recebe o
// userId de quem está no chat, vindo do servidor, e nenhuma aceita id, e-mail
// ou nome vindo da IA. Assim, por mais que alguém peça "veja a conta de fulano",
// não existe caminho para a IA enxergar outra conta.
//
// O que sai daqui é só o necessário para atender: nada de e-mail, IP, senha,
// token, id interno, nem nome ou dado de outras pessoas (assinantes de um
// promotor e convidados aparecem só como contagem).

export type VerificarPagamento = (userId: string) => Promise<void>;

export const FERRAMENTAS = [
  {
    type: 'function',
    function: {
      name: 'minha_conta',
      description:
        'Situação da conta de quem está no chat: tipo de perfil, cidade, se está verificado, desativado ou suspenso, se o Premium está ativo e até quando (pago, período grátis ou dias ganhos), saldo de tokens e destaque. Use antes de responder dúvidas sobre acesso, Premium, bloqueio de recursos ou tokens.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificar_pagamento',
      description:
        'Confere no sistema de pagamentos se há pagamento confirmado para quem está no chat e atualiza o Premium se houver (o mesmo que o botão "Já paguei — verificar"). Use quando a pessoa disser que pagou e o Premium não liberou.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'minhas_comissoes',
      description:
        'Para promotores: saldo de comissões por situação (em análise, aprovada, paga), se a chave Pix está cadastrada e as últimas comissões com mês, valor, situação e data de pagamento. Use para dúvidas de comissão e Pix do promotor.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'meus_convites',
      description:
        'Quantas pessoas se cadastraram pelo convite de quem está no chat e em que situação estão (validado, aguardando, expirado ou recusado). Use para dúvidas sobre recompensas de convite.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

const reais = (centavos: unknown) => `R$ ${(Number(centavos || 0) / 100).toFixed(2).replace('.', ',')}`;
const data = (valor: unknown) => {
  if (!valor) return null;
  const t = new Date(String(valor));
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};
const vigente = (valor: unknown) => {
  if (!valor) return false;
  const t = new Date(String(valor)).getTime();
  return !Number.isNaN(t) && t > Date.now();
};

async function minhaConta(db: DbHandle, userId: string) {
  const u = (await queryOne(
    db,
    `SELECT gender, city, state, created_at, is_verified, is_premium, hub_license_end_at, trial_ends_at,
            is_deactivated, is_banned, invite_status, token_points, token_free_days, boost_until
       FROM users WHERE id = ? LIMIT 1`,
    [userId]
  )) as any;
  if (!u) return { erro: 'conta não encontrada' };

  const pagoAtivo = Number(u.is_premium || 0) === 1 && (!u.hub_license_end_at || vigente(u.hub_license_end_at));
  const gratisAtivo = vigente(u.trial_ends_at);
  return {
    tipo_de_perfil: u.gender || 'não informado',
    cidade: [u.city, u.state].filter(Boolean).join('/') || 'não informada',
    conta_criada_em: data(u.created_at),
    verificado: !!Number(u.is_verified || 0),
    perfil_desativado: !!Number(u.is_deactivated || 0),
    conta_suspensa: !!Number(u.is_banned || 0),
    cadastro_aguardando_aprovacao: String(u.invite_status || '') === 'pending',
    premium_ativo: pagoAtivo || gratisAtivo,
    assinatura_paga_ativa: pagoAtivo,
    assinatura_paga_ate: data(u.hub_license_end_at),
    periodo_gratis_ou_dias_ganhos_ativos: gratisAtivo,
    periodo_gratis_ou_dias_ganhos_ate: data(u.trial_ends_at),
    tokens_pontos_atuais: Number(u.token_points || 0),
    tokens_pontos_para_proximo_dia_gratis: Math.max(0, 100 - Number(u.token_points || 0)),
    dias_gratis_ja_ganhos_com_tokens: Number(u.token_free_days || 0),
    destaque_ativo_ate: vigente(u.boost_until) ? data(u.boost_until) : null,
  };
}

async function minhasComissoes(db: DbHandle, userId: string) {
  const p = (await queryOne(db, 'SELECT pix_key, status FROM promoters WHERE user_id = ? LIMIT 1', [userId])) as any;
  if (!p) return { promotor: false };

  const saldo = (await queryOne(
    db,
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) AS pendente,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount ELSE 0 END), 0) AS aprovado,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) AS pago
     FROM promoter_commissions WHERE promoter_user_id = ?`,
    [userId]
  )) as any;
  const ultimas = (await queryAll(
    db,
    `SELECT period, commission_amount, status, event_type, paid_at, created_at
       FROM promoter_commissions
      WHERE promoter_user_id = ? AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 15`,
    [userId]
  )) as any[];

  const situacao: Record<string, string> = { pending: 'em análise', approved: 'aprovada', paid: 'paga' };
  const aprovado = Number(saldo?.aprovado || 0);
  const pix = String(p.pix_key || '').trim();
  return {
    promotor: true,
    situacao_do_promotor: p.status,
    chave_pix_cadastrada: !!pix,
    // Só o fim da chave, para a pessoa conferir se é a dela sem expor o valor todo no chat.
    chave_pix_termina_em: pix ? pix.slice(-4) : null,
    em_analise: reais(saldo?.pendente),
    aprovada_aguardando_pix: reais(aprovado),
    ja_paga: reais(saldo?.pago),
    minimo_para_pix: reais(1000),
    falta_para_o_minimo: aprovado >= 1000 ? reais(0) : reais(1000 - aprovado),
    ultimas_comissoes: ultimas.map((c) => ({
      mes_de_referencia: String(c.period || ''),
      valor: reais(c.commission_amount),
      situacao: situacao[String(c.status)] || String(c.status),
      origem: /renov|renewed|backfill/i.test(String(c.event_type || '')) ? 'renovação' : 'pagamento do assinante',
      paga_em: data(c.paid_at),
    })),
  };
}

async function meusConvites(db: DbHandle, userId: string) {
  const linhas = (await queryAll(
    db,
    `SELECT e.validation_status AS situacao, COUNT(*) AS total
       FROM invite_link_entries e
       JOIN invite_links l ON l.id = e.invite_link_id
      WHERE l.inviter_user_id = ?
      GROUP BY e.validation_status`,
    [userId]
  )) as any[];
  const nomes: Record<string, string> = {
    validated: 'validados', pending: 'aguardando', expired: 'expirados', failed: 'nao_validados',
  };
  const resumo: Record<string, number> = { validados: 0, aguardando: 0, expirados: 0, nao_validados: 0 };
  for (const l of linhas) {
    const chave = nomes[String(l.situacao)] || String(l.situacao);
    resumo[chave] = (resumo[chave] || 0) + Number(l.total || 0);
  }
  return { ...resumo, total_de_cadastros_pelo_convite: Object.values(resumo).reduce((a, b) => a + b, 0) };
}

/**
 * Executa a consulta pedida pela IA para a conta de quem está no chat.
 * Devolve sempre um texto JSON (inclusive em erro), que volta para a IA.
 */
export async function executarFerramenta(
  nome: string,
  ctx: { db: DbHandle; userId: string; verificarPagamento?: VerificarPagamento }
): Promise<string> {
  try {
    switch (nome) {
      case 'minha_conta':
        return JSON.stringify(await minhaConta(ctx.db, ctx.userId));
      case 'verificar_pagamento': {
        if (!ctx.verificarPagamento) return JSON.stringify({ erro: 'verificação indisponível agora' });
        await ctx.verificarPagamento(ctx.userId);
        const conta = await minhaConta(ctx.db, ctx.userId);
        return JSON.stringify({
          verificado_agora: true,
          premium_ativo: (conta as any).premium_ativo,
          assinatura_paga_ate: (conta as any).assinatura_paga_ate,
        });
      }
      case 'minhas_comissoes':
        return JSON.stringify(await minhasComissoes(ctx.db, ctx.userId));
      case 'meus_convites':
        return JSON.stringify(await meusConvites(ctx.db, ctx.userId));
      default:
        return JSON.stringify({ erro: `consulta desconhecida: ${nome}` });
    }
  } catch (err) {
    console.error(`[suporte-ia] consulta ${nome} falhou:`, err);
    return JSON.stringify({ erro: 'não foi possível consultar agora' });
  }
}
