import { buildUnsubscribeUrl } from './email.js';

// ─── Renovação: lembrete antes de vencer e campanha de volta ─────────────────
// ~90% dos assinantes pagam por Pix, que não renova sozinho: todo mês a pessoa
// precisa lembrar. Estes e-mails levam um botão que abre o Pix pronto, sem
// login (link assinado que só serve para gerar o pagamento daquela conta).

type RenovacaoEmailOptions = { apiKey?: string; fromEmail?: string; appName?: string; siteUrl?: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rodapeDescadastro(email: string, siteUrl: string) {
  const url = buildUnsubscribeUrl(email, siteUrl);
  return `
    <div style="max-width:560px;margin:14px auto 0;text-align:center;font-family:Arial,sans-serif;">
      <p style="font-size:12px;color:#9aa0a6;line-height:1.5;margin:0;">
        Não quer mais receber estes e-mails?
        <a href="${url}" style="color:#9aa0a6;text-decoration:underline;">Descadastrar com 1 clique</a>.
      </p>
    </div>`;
}

function molde(siteUrl: string, corpo: string, pixelUrl?: string) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff7fa;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${siteUrl}" style="text-decoration:none;">
        <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
          <span style="color:white;font-size:20px;font-weight:800;letter-spacing:-0.5px;">nosigilo.net</span>
        </div>
      </a>
    </div>
    <div style="background:white;border-radius:20px;border:1px solid #f4c7d7;padding:32px 28px;">
      ${corpo}
    </div>
    <p style="font-size:12px;color:#b08090;text-align:center;line-height:1.6;margin:18px 0 0;">
      Você recebe este e-mail por ter uma assinatura no nosigilo.net.
    </p>
  </div>
  ${pixelUrl ? `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />` : ''}
</body>
</html>`.trim();
}

function botaoRenovar(url: string, texto: string) {
  return `
      <div style="text-align:center;margin:26px 0 10px;">
        <a href="${url}" style="display:inline-block;background:#e83e68;color:white;font-size:18px;font-weight:800;padding:17px 36px;border-radius:14px;text-decoration:none;box-shadow:0 6px 20px rgba(232,62,104,0.4);">
          ${texto}
        </a>
      </div>
      <p style="font-size:12px;color:#9a6b7a;text-align:center;margin:0 0 18px;">
        Abre o Pix pronto para pagar — não precisa entrar na conta.
      </p>`;
}

function blocoCartao(tokens: number) {
  return `
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 16px;text-align:center;">
        <p style="font-size:13px;color:#5b21b6;line-height:1.55;margin:0;">
          💳 <strong>Cansou de lembrar todo mês?</strong> Pague no cartão: renova sozinho e você ganha
          <strong>${tokens} tokens</strong> no primeiro pagamento.
        </p>
      </div>`;
}

function itemLista(html: string) {
  return `<div style="padding:11px 14px;border-radius:10px;background:#fff1f5;margin-bottom:8px;font-size:15px;color:#2b1720;">💜 ${html}</div>`;
}

async function enviarResend(options: RenovacaoEmailOptions, to: string, subject: string, html: string, etiqueta: string) {
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [to], subject, html: html + rodapeDescadastro(to, siteUrl) }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_${etiqueta}_error:${response.status}:${body}`);
  }
}

export type LembreteRenovacaoPayload = {
  to: string;
  nome: string;
  tipo: 'd3' | 'd0';
  venceEmLabel: string; // "02/10"
  linkRenovar: string;
  pixelUrl?: string;
  precoLabel: string; // "9,90"
  tokensCartao: number;
  novidades?: { curtidas: number; visitas: number; mensagens: number };
};

export function montarLembreteRenovacao(options: RenovacaoEmailOptions, p: LembreteRenovacaoPayload) {
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const nome = escapeHtml(p.nome.split(' ')[0] || p.nome);
  const hoje = p.tipo === 'd0';
  const subject = hoje
    ? `${nome}, seu Premium vence hoje ⏳`
    : `${nome}, seu Premium vence em 3 dias (${p.venceEmLabel})`;
  const n = p.novidades;
  const linhas: string[] = [];
  if (n?.curtidas) linhas.push(`<strong>${n.curtidas}</strong> ${n.curtidas === 1 ? 'curtida nova' : 'curtidas novas'} nos últimos 7 dias`);
  if (n?.visitas) linhas.push(`<strong>${n.visitas}</strong> ${n.visitas === 1 ? 'visita' : 'visitas'} no seu perfil nos últimos 7 dias`);
  if (n?.mensagens) linhas.push(`<strong>${n.mensagens}</strong> ${n.mensagens === 1 ? 'mensagem esperando' : 'mensagens esperando'} resposta`);
  const corpo = `
      <p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 8px;">Oi, ${nome} 💜</p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 18px;">
        ${hoje
          ? 'Seu Premium <strong style="color:#e83e68;">vence hoje</strong>. Depois disso, mensagens, fotos privadas e quem te curtiu ficam bloqueados.'
          : `Seu Premium vence em <strong style="color:#e83e68;">3 dias, no dia ${escapeHtml(p.venceEmLabel)}</strong>. Renove agora e não perca nada do que está rolando.`}
      </p>
      ${linhas.map(itemLista).join('')}
      ${botaoRenovar(p.linkRenovar, `Renovar com Pix — R$ ${escapeHtml(p.precoLabel)}`)}
      ${blocoCartao(p.tokensCartao)}`;
  return { subject, html: molde(siteUrl, corpo, p.pixelUrl) };
}

export async function sendLembreteRenovacaoEmail(options: RenovacaoEmailOptions, p: LembreteRenovacaoPayload) {
  if (!options.apiKey || !options.fromEmail) return { skipped: true as const };
  const { subject, html } = montarLembreteRenovacao(options, p);
  await enviarResend(options, p.to, subject, html, 'lembrete_renovacao');
  return { skipped: false as const };
}

export type VoltaRenovacaoPayload = {
  to: string;
  nome: string;
  etapa: 1 | 2;
  linkRenovar: string;
  pixelUrl?: string;
  precoLabel: string;
  tokensVolta: number;
  tokensCartao: number;
  // Contados desde que a assinatura venceu.
  curtidas: number;
  visitas: number;
  mensagens: number;
};

export function montarVoltaRenovacao(options: RenovacaoEmailOptions, p: VoltaRenovacaoPayload) {
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const nome = escapeHtml(p.nome.split(' ')[0] || p.nome);
  const perdeu: string[] = [];
  if (p.curtidas) perdeu.push(`<strong>${p.curtidas}</strong> ${p.curtidas === 1 ? 'pessoa curtiu' : 'pessoas curtiram'} seu perfil`);
  if (p.visitas) perdeu.push(`<strong>${p.visitas}</strong> ${p.visitas === 1 ? 'visita' : 'visitas'} no seu perfil`);
  if (p.mensagens) perdeu.push(`<strong>${p.mensagens}</strong> ${p.mensagens === 1 ? 'mensagem sem resposta' : 'mensagens sem resposta'}`);
  const temNovidade = perdeu.length > 0;
  const subject = p.etapa === 1
    ? (p.curtidas
        ? `${nome}, ${p.curtidas} ${p.curtidas === 1 ? 'pessoa curtiu' : 'pessoas curtiram'} você desde que você saiu 👀`
        : temNovidade
          ? `${nome}, tem gente te procurando desde que você saiu 👀`
          : `${nome}, sentimos sua falta no NoSigilo 💜`)
    : `${nome}, ainda dá tempo: ${p.tokensVolta} tokens para você voltar 🎁`;
  const lista = temNovidade
    ? perdeu.map(itemLista).join('')
    : itemLista('Perfis novos da sua região entraram desde que você saiu');
  const corpo = `
      <p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 8px;">Oi, ${nome} 💜</p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 18px;">
        ${p.etapa === 1
          ? 'Seu Premium venceu, mas o seu perfil continua sendo visto. Olha o que aconteceu desde que você saiu:'
          : 'Passando só para lembrar: o que te esperava continua lá — e o presente para você voltar ainda está valendo.'}
      </p>
      ${lista}
      <div style="background:linear-gradient(135deg,#e83e68 0%,#b5179e 100%);border-radius:16px;padding:20px;text-align:center;margin:18px 0 4px;">
        <p style="color:rgba(255,255,255,0.85);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">🎁 Presente de volta</p>
        <p style="color:#fff;font-size:26px;font-weight:900;margin:0 0 4px;">+${p.tokensVolta} TOKENS</p>
        <p style="color:rgba(255,255,255,0.9);font-size:13px;margin:0;">Creditados quando você renovar nos próximos 30 dias.</p>
      </div>
      ${botaoRenovar(p.linkRenovar, `Voltar ao Premium — R$ ${escapeHtml(p.precoLabel)}`)}
      ${blocoCartao(p.tokensCartao)}`;
  return { subject, html: molde(siteUrl, corpo, p.pixelUrl) };
}

export async function sendVoltaRenovacaoEmail(options: RenovacaoEmailOptions, p: VoltaRenovacaoPayload) {
  if (!options.apiKey || !options.fromEmail) return { skipped: true as const };
  const { subject, html } = montarVoltaRenovacao(options, p);
  await enviarResend(options, p.to, subject, html, 'volta_renovacao');
  return { skipped: false as const };
}
