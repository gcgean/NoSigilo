/**
 * Modelos do DeepSeek usados pelas IAs do NoSigilo, num lugar só (18/11/2026).
 *
 * - Texto: deepseek-v4-pro, o mais forte da API. Não lê imagem.
 * - Imagem: deepseek-flash, que lê imagem (prints do suporte). Só o suporte manda
 *   imagem; fotos de denúncia e de verificação NUNCA vão para a IA (podem ser
 *   íntimas ou envolver menor de idade: quem olha é o admin).
 *
 * Para voltar ao modelo antigo sem mexer no código: DEEPSEEK_MODELO_TEXTO=deepseek-flash
 * no .env.production e reiniciar o backend.
 */
export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const MODELO_TEXTO = process.env.DEEPSEEK_MODELO_TEXTO?.trim() || 'deepseek-v4-pro';
export const MODELO_IMAGEM = process.env.DEEPSEEK_MODELO_IMAGEM?.trim() || 'deepseek-flash';

/**
 * O V4 Pro "pensa" antes de responder por padrão, e o raciocínio conta dentro
 * do max_tokens: com limites curtos (falas d'A Casa, 90 a 120) não sobraria
 * resposta. Respostas diretas usam isto; só o analista de métricas pensa.
 */
export const SEM_PENSAR = { thinking: { type: 'disabled' } } as const;
export const PENSANDO = { thinking: { type: 'enabled' } } as const;
