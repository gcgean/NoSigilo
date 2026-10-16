/**
 * "Melhorar com IA" na resposta manual do suporte (painel admin).
 *
 * O admin escreve um rascunho; a IA reescreve com tom gentil e claro, usando a
 * conversa e o manual do sistema para não errar caminho de tela. Não envia
 * nada: o texto volta para a caixa e o admin decide se manda.
 */
import { MANUAL_DO_SISTEMA } from './supportAiConhecimento.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODELO = 'deepseek-chat';
const LIMITE_DA_CHAMADA_MS = 40_000;
export const TAMANHO_MAXIMO_RESPOSTA = 1200;

const PROMPT = `Você é da equipe de suporte do NoSigilo, uma rede social adulta brasileira (18+).
O administrador escreveu um RASCUNHO de resposta para um usuário. Reescreva o rascunho:
- Português do Brasil, tom simpático, direto e acolhedor; frases curtas, fáceis para um leigo.
- Mantenha a intenção e os fatos do rascunho. Não invente promessas, prazos, valores ou recursos.
- Se o rascunho indicar um caminho de tela, use os nomes exatos do manual abaixo. Se o rascunho contradizer o manual, siga o manual.
- Trate o usuário pelo nome quando fizer sentido; se for casal, use "vocês".
- Sem markdown, sem listas longas; no máximo um emoji. Até ${TAMANHO_MAXIMO_RESPOSTA} caracteres.
- Responda SOMENTE com o texto final da mensagem.

${MANUAL_DO_SISTEMA}`;

export async function melhorarRespostaSuporte(
  apiKey: string | undefined,
  dados: { rascunho: string; nome: string | null; genero: string | null; conversa: Array<{ de: 'usuario' | 'equipe' | 'ia'; texto: string }> }
): Promise<string | null> {
  if (!apiKey) return null;
  const historico = dados.conversa
    .slice(-12)
    .map((m) => `${m.de === 'usuario' ? 'Usuário' : m.de === 'ia' ? 'Assistente IA' : 'Equipe'}: ${m.texto.slice(0, 600)}`)
    .join('\n');
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), LIMITE_DA_CHAMADA_MS);
  try {
    const resposta = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: 'system', content: PROMPT },
          {
            role: 'user',
            content: `Nome do usuário: ${dados.nome || 'não informado'} · Tipo de perfil: ${dados.genero || 'não informado'}\n\nConversa até agora:\n${historico || '(sem mensagens)'}\n\nRascunho do administrador:\n${dados.rascunho}`,
          },
        ],
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) {
      console.error('[respostaSuporteIa] DeepSeek respondeu', resposta.status);
      return null;
    }
    const json = (await resposta.json()) as any;
    const texto = String(json?.choices?.[0]?.message?.content || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
    return texto ? texto.slice(0, TAMANHO_MAXIMO_RESPOSTA) : null;
  } catch (erro) {
    console.error('[respostaSuporteIa] falha', erro);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
