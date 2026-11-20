/**
 * Regras de engajamento dos promotores (20/11/2026, pedido do dono).
 *
 * - Comissão aprovada assim que o indicado paga; o Pix sai no dia 01 do mês
 *   seguinte, para quem tiver R$ 10 ou mais aprovados.
 * - Faixa: até a 10ª venda do mês, 20%; a partir da 11ª, 25%.
 * - Desafio semanal (segunda a domingo, horário de Brasília): quem trouxer
 *   mais cadastros pelo link ganha R$ 30, somado ao saldo do dia 01.
 * - Boas-vindas da Lola no chat de suporte nos dias 1, 3 e 7.
 *
 * Aqui ficam só as regras puras (sem banco), para teste direto.
 */

export const VENDAS_PARA_FAIXA_ALTA = 10;
export const TAXA_PADRAO = 0.20;
export const TAXA_ALTA = 0.25;
export const PREMIO_DESAFIO_CENTS = 3000;
/** event_type do prêmio do desafio em promoter_commissions (não é venda). */
export const EVENTO_DESAFIO = 'desafio_semanal';

/** Taxa da próxima venda, sabendo quantas o promotor já fez no mês. */
export function taxaDaComissao(vendasAnterioresNoMes: number): number {
  return vendasAnterioresNoMes >= VENDAS_PARA_FAIXA_ALTA ? TAXA_ALTA : TAXA_PADRAO;
}

const FUSO = 'America/Sao_Paulo';
// Brasil sem horário de verão desde 2019: Brasília é UTC-3 o ano todo.
const OFFSET_BRASILIA_MS = 3 * 3_600_000;

/** Dia (YYYY-MM-DD) em Brasília. */
export function diaEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO }).format(agora);
}

/**
 * Semana do desafio que contém `agora`: de segunda 00:00 a domingo 23:59:59
 * em Brasília, devolvida em ISO UTC (como o created_at do banco), mais a
 * chave da semana (o dia da segunda, "2026-11-16").
 */
export function semanaDoDesafio(agora: Date = new Date()) {
  const local = new Date(agora.getTime() - OFFSET_BRASILIA_MS);
  const diaDaSemana = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const segundaLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - diaDaSemana);
  const inicio = new Date(segundaLocal + OFFSET_BRASILIA_MS);
  const fim = new Date(inicio.getTime() + 7 * 86_400_000);
  return { chave: new Date(segundaLocal).toISOString().slice(0, 10), inicio: inicio.toISOString(), fim: fim.toISOString() };
}

/** Semana anterior à que contém `agora`. */
export function semanaPassada(agora: Date = new Date()) {
  return semanaDoDesafio(new Date(new Date(semanaDoDesafio(agora).inicio).getTime() - 1000));
}

export type Posicao = { userId: string; nome: string; cadastros: number };

/**
 * Situação de um promotor no ranking: posição (1 = primeiro; empate divide a
 * posição), quantos cadastros faltam para passar o da frente e o líder.
 */
export function situacaoNoRanking(ranking: Posicao[], userId: string) {
  const meu = ranking.find((r) => r.userId === userId)?.cadastros ?? 0;
  const aFrente = ranking.filter((r) => r.cadastros > meu);
  const posicao = aFrente.length + 1;
  // Para subir, passa quem está logo acima (o menor número maior que o meu).
  const proximo = aFrente.length ? Math.min(...aFrente.map((r) => r.cadastros)) : null;
  return {
    posicao: meu > 0 ? posicao : null,
    cadastros: meu,
    faltamParaSubir: proximo === null ? 0 : proximo - meu + 1,
    lider: ranking[0] ?? null,
  };
}

const primeiroNome = (nome: string) => (String(nome || '').trim().split(/\s+/)[0] || '').slice(0, 24);

/** Mensagens de boas-vindas da Lola (etapas 0, 1 e 2 = dias 1, 3 e 7). */
export const DIAS_DAS_BOAS_VINDAS = [0, 2, 6];

export function textoBoasVindas(
  etapa: number,
  c: { nome: string; link: string; linkCasa: string; materiais: string[]; cliques7d: number; cadastros7d: number }
): string | null {
  const nome = primeiroNome(c.nome);
  const oi = nome ? `Oi, ${nome}!` : 'Oi!';
  if (etapa === 0) {
    const lista = c.materiais.length
      ? c.materiais.slice(0, 3).map((t) => `• ${t}`).join('\n')
      : '• Fotos e vídeos oficiais, com legenda pronta';
    return `${oi} 🎉 Aqui é a Lola, do NoSigilo. Bem-vindo(a) ao time de promotores!

Seu link de convite:
${c.link}

Para A Casa (festa online, sexta e sábado às 22h):
${c.linkCasa}

Já separei materiais prontos para você postar, com legenda e botão de copiar:
${lista}

Central de divulgação: nosigilo.net/promoter/artes

Como funciona o pagamento: a comissão é aprovada assim que o seu indicado paga, e o Pix sai todo dia 01 do mês seguinte, quando o seu saldo chega a R$ 10.`;
  }
  if (etapa === 1) {
    return `${oi} Lola de novo 😉 Que tal postar um story hoje?

Escolha um material na Central, toque em "Compartilhar" e coloque o seu link no adesivo de link do story. Story com link à noite, perto das 21h, costuma trazer mais gente.

Abrir a Central de divulgação: nosigilo.net/promoter/artes

E fique de olho no desafio da semana: quem trouxer mais cadastros até domingo ganha R$ 30 🏆`;
  }
  if (etapa === 2) {
    const resumo = c.cliques7d > 0
      ? `Nesta semana o seu link teve ${c.cliques7d} ${c.cliques7d === 1 ? 'visita' : 'visitas'} e ${c.cadastros7d} ${c.cadastros7d === 1 ? 'cadastro' : 'cadastros'}. ${c.cadastros7d > 0 ? 'Mandou bem! 🔥' : 'Agora é transformar visita em cadastro: a legenda pronta da Central ajuda.'}`
      : 'O seu link ainda não teve visitas. Bora fazer a primeira postagem? Um story com o link já resolve.';
    return `${oi} Passando para mostrar o seu resultado 📊

${resumo}

No seu painel você acompanha visitas, cadastros e vendas do dia, e a sua posição no desafio da semana.

Ver meu painel: nosigilo.net/promoter

Lembrete: a partir da 11ª venda no mês, a sua comissão sobe de 20% para 25%.`;
  }
  return null;
}

/** "hoje (20/11) até as 21h", "em 21/11", "até as 21h". Vazio quando não há data nem hora. */
export function quandoPostar(usarEm: string | null | undefined, usarAte: string | null | undefined, agora: Date = new Date()): string {
  const dia = usarEm && /^\d{4}-\d{2}-\d{2}$/.test(usarEm) ? usarEm : '';
  const hora = usarAte && /^\d{2}:\d{2}$/.test(usarAte) ? usarAte.replace(/:00$/, 'h').replace(':', 'h') : '';
  if (!dia && !hora) return '';
  const hoje = diaEmBrasilia(agora);
  const amanha = diaEmBrasilia(new Date(agora.getTime() + 86_400_000));
  const dataBr = dia ? dia.slice(8, 10) + '/' + dia.slice(5, 7) : '';
  const quando = !dia ? '' : dia === hoje ? `hoje (${dataBr})` : dia === amanha ? `amanhã (${dataBr})` : `em ${dataBr}`;
  return [quando, hora ? `até as ${hora}` : ''].filter(Boolean).join(' ');
}

/** Mensagem no chat quando entra material novo (um aviso por lote). */
export function textoMaterialNovo(nome: string, materiais: Array<{ titulo: string; quando: string }>): string {
  const n = primeiroNome(nome);
  const linhas = materiais.slice(0, 5).map((m) => `• ${m.titulo}${m.quando ? ` — para postar ${m.quando}` : ''}`).join('\n');
  const extra = materiais.length > 5 ? `\n• e mais ${materiais.length - 5}` : '';
  const titulo = materiais.length === 1 ? 'Material novo na Central' : `${materiais.length} materiais novos na Central`;
  return `${n ? `Oi, ${n}! ` : ''}🎬 ${titulo}:
${linhas}${extra}

Legenda pronta e o seu link já estão lá, é só copiar e postar.
Abrir a Central de divulgação: nosigilo.net/promoter/artes`;
}

/** "01/12": o dia 01 do mês seguinte a `agora`, em Brasília (quando sai o Pix). */
export function diaDoProximoPix(agora: Date = new Date()): string {
  const [ano, mes] = diaEmBrasilia(agora).split('-').map(Number);
  const proximo = mes === 12 ? 1 : mes + 1;
  return `01/${String(proximo).padStart(2, '0')}`;
}

const reais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');

/**
 * Aviso de comissão (20/11/2026, pedido do dono): toda assinatura e toda
 * renovação de um indicado avisa o promotor, com o quanto ele já acumulou
 * para o Pix do dia 01. É a recompensa vista na hora, a cada pagamento.
 */
export function textoDaComissao(c: {
  renovacao: boolean;
  nomeDoIndicado: string;
  comissaoCents: number;
  saldoCents: number;
  minimoCents: number;
  faixaAlta: boolean;
  agora?: Date;
}): { titulo: string; texto: string } {
  const nome = primeiroNome(c.nomeDoIndicado) || 'Um indicado seu';
  const pix = diaDoProximoPix(c.agora);
  const titulo = c.renovacao
    ? `🔁 ${nome} renovou! +R$ ${reais(c.comissaoCents)} pra você`
    : `💰 ${nome} assinou pelo seu link! +R$ ${reais(c.comissaoCents)}`;
  const acao = c.renovacao
    ? `${nome} renovou o Premium e você ganhou mais R$ ${reais(c.comissaoCents)} de comissão, já aprovada.`
    : `${nome} assinou o Premium pelo seu convite e você ganhou R$ ${reais(c.comissaoCents)} de comissão, já aprovada.`;
  const faltam = c.minimoCents - c.saldoCents;
  const saldo = faltam <= 0
    ? `Você já acumulou R$ ${reais(c.saldoCents)} para o Pix do dia ${pix} 💸`
    : `Você já acumulou R$ ${reais(c.saldoCents)}. Faltam R$ ${reais(faltam)} para o Pix do dia ${pix} (mínimo de R$ ${reais(c.minimoCents)}).`;
  const faixa = c.faixaAlta ? ' Você está na faixa de 25% este mês! 🔥' : '';
  const recorrencia = c.renovacao ? '' : ' E toda vez que renovar, cai mais comissão pra você.';
  return { titulo, texto: `${acao} ${saldo}${faixa}${recorrencia}` };
}
