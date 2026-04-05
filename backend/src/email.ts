type SendPasswordResetCodeOptions = {
  apiKey?: string;
  fromEmail?: string;
  appName?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendPasswordResetCodeEmail(
  options: SendPasswordResetCodeOptions,
  payload: { to: string; code: string; userName?: string | null }
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }

  const appName = options.appName || 'NoSigilo';
  const safeCode = escapeHtml(payload.code);
  const safeName = payload.userName ? escapeHtml(payload.userName) : 'voce';
  const html = `
    <div style="font-family: Arial, sans-serif; background:#fff7fa; padding:24px; color:#2b1720;">
      <div style="max-width:560px; margin:0 auto; background:white; border:1px solid #f4c7d7; border-radius:18px; padding:32px;">
        <h1 style="margin:0 0 12px; font-size:28px; color:#e83e68;">${appName}</h1>
        <p style="font-size:16px; line-height:1.6; margin:0 0 16px;">Oi, ${safeName}. Recebemos um pedido para trocar a sua senha.</p>
        <p style="font-size:16px; line-height:1.6; margin:0 0 20px;">Use este codigo para confirmar a recuperacao:</p>
        <div style="font-size:34px; letter-spacing:8px; font-weight:700; text-align:center; padding:18px; border-radius:14px; background:#fff1f5; color:#c81e58; margin:0 0 20px;">
          ${safeCode}
        </div>
        <p style="font-size:14px; line-height:1.6; margin:0 0 8px; color:#6b4b57;">Esse codigo expira em 15 minutos.</p>
        <p style="font-size:14px; line-height:1.6; margin:0; color:#6b4b57;">Se voce nao pediu essa troca, pode ignorar este e-mail com tranquilidade.</p>
      </div>
    </div>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.fromEmail,
      to: [payload.to],
      subject: `${appName}: codigo para trocar sua senha`,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_error:${response.status}:${body}`);
  }

  return { skipped: false as const };
}
