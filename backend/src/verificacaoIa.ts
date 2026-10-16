/**
 * Reescreve, com a IA, o motivo de recusa da verificação de perfil que o admin
 * rascunhou. A pessoa recebe esse texto na notificação: precisa ser curto,
 * gentil e dizer exatamente o que fazer para ser aprovada na próxima tentativa.
 * A IA só melhora o texto; quem decide recusar é sempre o admin.
 */
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODELO = 'deepseek-chat';
const LIMITE_DA_CHAMADA_MS = 30_000;
export const TAMANHO_MAXIMO_MOTIVO = 300;

const PROMPT = `Você reescreve o motivo de recusa da verificação de perfil de uma rede social adulta brasileira (NoSigilo).

Como funciona a verificação: a pessoa tira uma selfie mostrando o rosto e segurando um papel com um código escrito à mão; a equipe compara a selfie com as fotos do perfil.

Reescreva o rascunho do administrador seguindo estas regras:
- Português do Brasil, tom gentil e direto, sem julgamento sobre corpo, aparência ou fotos íntimas.
- Diga o que faltou e o que fazer para ser aprovada na próxima tentativa.
- Fale diretamente com a pessoa ("você"); se o perfil for de casal, use "vocês".
- Não invente fatos que não estão no rascunho. Não prometa aprovação.
- No máximo ${TAMANHO_MAXIMO_MOTIVO} caracteres, uma ou duas frases, sem aspas, sem emojis em excesso (no máximo um).
- Não comece com "Motivo:" (o sistema já coloca).

Responda SOMENTE com o texto reescrito.`;

export async function melhorarMotivoRecusa(
  apiKey: string | undefined,
  dados: { rascunho: string; genero: string | null }
): Promise<string | null> {
  if (!apiKey) return null;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), LIMITE_DA_CHAMADA_MS);
  try {
    const resposta = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.4,
        max_tokens: 200,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Tipo de perfil: ${dados.genero || 'não informado'}\nRascunho do administrador: ${dados.rascunho}` },
        ],
      }),
      signal: controle.signal,
    });
    if (!resposta.ok) {
      console.error('[verificacaoIa] DeepSeek respondeu', resposta.status);
      return null;
    }
    const json = await resposta.json() as any;
    const texto = String(json?.choices?.[0]?.message?.content || '')
      .trim()
      .replace(/^["“”']+|["“”']+$/g, '')
      .replace(/^motivo:\s*/i, '')
      .trim();
    return texto ? texto.slice(0, TAMANHO_MAXIMO_MOTIVO) : null;
  } catch (erro) {
    console.error('[verificacaoIa] falha ao melhorar o motivo', erro);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
