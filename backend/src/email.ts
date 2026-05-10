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

// ─── Re-engagement email ──────────────────────────────────────────────────────

type ReengagementOptions = {
  apiKey?: string;
  fromEmail?: string;
  appName?: string;
  siteUrl?: string;
};

type ReengagementPayload = {
  to: string;
  userName: string;
  stats: {
    visits: number;      // profile visits since last seen
    likes: number;       // likes received since last seen
    messages: number;    // unread messages
    matches: number;     // pending matches/likes
  };
};

export async function sendReengagementEmail(
  options: ReengagementOptions,
  payload: ReengagementPayload
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }

  const appName = options.appName || 'NoSigilo';
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const safeName = escapeHtml(payload.userName.split(' ')[0] || payload.userName);
  const { visits, likes, messages, matches } = payload.stats;

  // Assemble dynamic notification highlights
  const highlights: string[] = [];
  if (visits > 0) highlights.push(`<strong>${visits}</strong> ${visits === 1 ? 'pessoa visitou' : 'pessoas visitaram'} seu perfil`);
  if (likes > 0) highlights.push(`<strong>${likes}</strong> ${likes === 1 ? 'curtida no' : 'curtidas no'} seu perfil`);
  if (messages > 0) highlights.push(`<strong>${messages}</strong> ${messages === 1 ? 'mensagem não lida' : 'mensagens não lidas'} esperando por você`);
  if (matches > 0) highlights.push(`<strong>${matches}</strong> ${matches === 1 ? 'pessoa demonstrou interesse' : 'pessoas demonstraram interesse'} em você`);

  const hasStats = highlights.length > 0;
  const highlightsHtml = hasStats
    ? highlights.map(h => `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;background:#fff1f5;margin-bottom:8px;">
          <span style="font-size:18px;">💜</span>
          <span style="font-size:15px;color:#2b1720;line-height:1.4;">${h}</span>
        </div>`).join('')
    : `<div style="padding:12px 14px;border-radius:10px;background:#fff1f5;font-size:15px;color:#2b1720;">
         Novos perfis incríveis entraram na plataforma enquanto você esteve fora.
       </div>`;

  // Subject lines with psychological triggers (urgency + curiosity + social proof)
  const subjects = [
    `${safeName}, alguém está esperando sua resposta no NoSigilo 👀`,
    `${safeName}, seu perfil recebeu atenção enquanto você estava fora 💜`,
    `[${appName}] Você tem notificações que não pode perder, ${safeName}`,
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff7fa;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:580px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
        <span style="color:white;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${escapeHtml(appName)}</span>
      </div>
    </div>

    <!-- Card -->
    <div style="background:white;border-radius:20px;border:1px solid #f4c7d7;padding:36px 32px;box-shadow:0 4px 24px rgba(232,62,104,0.06);">

      <!-- Greeting -->
      <p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 6px;">Oi, ${safeName}! 👋</p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 24px;">
        Sentimos sua falta. Enquanto você esteve fora, <strong style="color:#e83e68;">algumas coisas aconteceram no seu perfil</strong> que merecem sua atenção agora.
      </p>

      <!-- Notification highlights -->
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c81e58;margin:0 0 12px;">
        📬 O que está esperando por você
      </p>
      <div style="margin-bottom:24px;">
        ${highlightsHtml}
      </div>

      <!-- Urgency block -->
      <div style="background:linear-gradient(135deg,#fff1f5 0%,#fde8ef 100%);border-left:4px solid #e83e68;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:28px;">
        <p style="font-size:14px;color:#2b1720;line-height:1.6;margin:0;">
          <strong>Não deixe essas conexões esfriarem.</strong> Quem não é visto, não é lembrado — e alguém pode perder o interesse se você demorar muito para responder.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:28px;">
        <a href="${siteUrl}/feed"
           style="display:inline-block;background:#e83e68;color:white;font-size:17px;font-weight:700;padding:16px 40px;border-radius:14px;text-decoration:none;letter-spacing:-0.2px;box-shadow:0 4px 16px rgba(232,62,104,0.35);">
          Ver minhas notificações agora →
        </a>
      </div>

      <!-- Social proof -->
      <div style="border-top:1px solid #f4c7d7;padding-top:20px;">
        <p style="font-size:13px;color:#9a6b7a;text-align:center;line-height:1.6;margin:0 0 6px;">
          🔒 <strong>Discret. Seguro. Real.</strong><br>
          Mais de 600 perfis verificados já estão se conectando agora mesmo.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px;">
      <p style="font-size:12px;color:#b08090;line-height:1.6;margin:0;">
        Você está recebendo este e-mail porque tem uma conta no ${escapeHtml(appName)}.<br>
        <a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">${siteUrl.replace('https://', '')}</a>
      </p>
    </div>

  </div>
</body>
</html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: options.fromEmail,
      to: [payload.to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_error:${response.status}:${body}`);
  }

  return { skipped: false as const };
}
