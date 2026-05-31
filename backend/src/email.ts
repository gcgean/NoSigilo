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

  // Subject lines — psychologically provocative, high open-rate curiosity triggers
  const subjects = [
    `${safeName}, alguém te olhou e não disse nada... 👀`,
    `Isso aconteceu no seu perfil enquanto você sumiu, ${safeName} 😏`,
    `${safeName}... alguém está esperando. Mas por quanto tempo? ⏳`,
    `Seu perfil atraiu atenção — mas você ainda não viu quem 🔥`,
    `${safeName}, tem coisa guardada pra você no nosigilo.net 💌`,
    `Eles curtiram, mandaram mensagem... e você nem sabe 😮`,
    `Alguém quase desistiu de esperar por você, ${safeName} 💜`,
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
      <a href="${siteUrl}" style="text-decoration:none;">
        <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
          <span style="color:white;font-size:20px;font-weight:800;letter-spacing:-0.5px;">nosigilo.net</span>
        </div>
      </a>
    </div>

    <!-- Card -->
    <div style="background:white;border-radius:20px;border:1px solid #f4c7d7;padding:36px 32px;box-shadow:0 4px 24px rgba(232,62,104,0.06);">

      <!-- Greeting -->
      <p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 6px;">Oi, ${safeName}! 👀</p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 8px;">
        Enquanto você estava fora, <strong style="color:#e83e68;">alguém ficou de olho no seu perfil</strong> — e não é qualquer um.
      </p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 24px;">
        Essa pessoa ainda não abordou. Mas quanto tempo acha que ela vai esperar?
      </p>

      <!-- Notification highlights -->
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c81e58;margin:0 0 12px;">
        🔐 Guardado pra você
      </p>
      <div style="margin-bottom:24px;">
        ${highlightsHtml}
      </div>

      <!-- Urgency block -->
      <div style="background:linear-gradient(135deg,#fff1f5 0%,#fde8ef 100%);border-left:4px solid #e83e68;border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:20px;">
        <p style="font-size:14px;color:#2b1720;line-height:1.6;margin:0;">
          😬 <strong>Atenção:</strong> perfis que demoram para responder perdem espaço para quem está ativo. Pessoas curiosas no nosigilo.net não ficam esperando muito — elas seguem em frente.
        </p>
      </div>

      <!-- Extra hook -->
      <div style="background:#2b1720;border-radius:12px;padding:16px 20px;margin-bottom:28px;text-align:center;">
        <p style="font-size:15px;color:#fff;line-height:1.7;margin:0;">
          Tem <strong style="color:#f472a0;">gente online agora mesmo</strong> procurando alguém com o seu perfil.<br>
          <span style="font-size:13px;color:#d4a0b5;">Quem chega primeiro, conecta primeiro.</span>
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${siteUrl}"
           style="display:inline-block;background:#e83e68;color:white;font-size:18px;font-weight:800;padding:18px 44px;border-radius:14px;text-decoration:none;letter-spacing:-0.2px;box-shadow:0 6px 20px rgba(232,62,104,0.45);">
          Quero ver quem me olhou →
        </a>
      </div>

      <!-- PS urgency -->
      <p style="font-size:13px;color:#9a6b7a;text-align:center;margin:0 0 20px;">
        ⚡ Acesse agora — essas notificações somem se ficarem sem resposta por muito tempo.
      </p>

      <!-- Social proof -->
      <div style="border-top:1px solid #f4c7d7;padding-top:20px;">
        <p style="font-size:13px;color:#9a6b7a;text-align:center;line-height:1.6;margin:0;">
          🔒 <strong>Discreto. Seguro. Real.</strong><br>
          Mais de 600 perfis verificados conectando agora mesmo em <strong>nosigilo.net</strong>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px;">
      <p style="font-size:12px;color:#b08090;line-height:1.6;margin:0;">
        Você está recebendo este e-mail porque tem uma conta no nosigilo.net.<br>
        <a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">nosigilo.net</a>
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

// ─── Weekly Summary Email ─────────────────────────────────────────────────────

export type WeeklySummaryOptions = {
  apiKey?: string;
  fromEmail?: string;
  appName?: string;
  siteUrl?: string;
};

export type WeeklySummaryPayload = {
  to: string;
  userName: string;
  stats: {
    profileVisits: number;
    likesReceived: number;
    newInCity: number;
    activeInCity: number;
    unreadMessages: number;
  };
};

export async function sendWeeklySummaryEmail(
  options: WeeklySummaryOptions,
  payload: WeeklySummaryPayload
) {
  if (!options.apiKey || !options.fromEmail) return { skipped: true as const };

  const appName = options.appName || 'NoSigilo';
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const safeName = (payload.userName.split(' ')[0] || payload.userName).replace(/[<>&"']/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]||c));
  const { profileVisits, likesReceived, newInCity, activeInCity, unreadMessages } = payload.stats;

  const rows: {icon:string;text:string}[] = [];
  if (profileVisits > 0)  rows.push({ icon: '👁️', text: `<strong>${profileVisits}</strong> ${profileVisits === 1 ? 'pessoa visitou' : 'pessoas visitaram'} seu perfil` });
  if (likesReceived > 0)  rows.push({ icon: '❤️', text: `<strong>${likesReceived}</strong> curtida${likesReceived > 1 ? 's' : ''} no seu perfil` });
  if (unreadMessages > 0) rows.push({ icon: '💬', text: `<strong>${unreadMessages}</strong> mensagem${unreadMessages > 1 ? 'ns' : ''} sem resposta` });
  if (newInCity > 0)      rows.push({ icon: '🆕', text: `<strong>${newInCity}</strong> novo${newInCity > 1 ? 's' : ''} perfil${newInCity > 1 ? 's' : ''} na sua região` });
  if (activeInCity > 0)   rows.push({ icon: '🔥', text: `<strong>${activeInCity}</strong> usuário${activeInCity > 1 ? 's' : ''} ativo${activeInCity > 1 ? 's' : ''} perto de você` });

  const statsHtml = rows.length > 0
    ? rows.map(r => `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:#fff1f5;margin-bottom:8px;"><span style="font-size:20px;width:28px;text-align:center;">${r.icon}</span><span style="font-size:15px;color:#2b1720;line-height:1.5;">${r.text}</span></div>`).join('')
    : `<div style="padding:14px;border-radius:12px;background:#fff1f5;font-size:15px;color:#6b4b57;text-align:center;">Novos perfis incríveis entraram esta semana. Confira quem está online.</div>`;

  const subjects = [
    `${safeName}, o que rolou na sua ausência vai te surpreender 😏`,
    `Tem alguém de olho em você no nosigilo.net, ${safeName} 👀`,
    `${safeName}... eles agiram. E você ainda não sabe 🔥`,
    `Seu resumo chegou — e tem coisa boa te esperando, ${safeName} 💌`,
    `${safeName}, 7 dias de ausência. Veja o que ficou guardado pra você ⏳`,
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#fff7fa;font-family:Arial,sans-serif;"><div style="max-width:580px;margin:0 auto;padding:24px 16px;"><div style="text-align:center;margin-bottom:24px;"><a href="${siteUrl}" style="text-decoration:none;"><div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;"><span style="color:white;font-size:20px;font-weight:800;">nosigilo.net</span></div></a></div><div style="background:white;border-radius:20px;border:1px solid #f4c7d7;padding:36px 32px;"><p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#c81e58;margin:0 0 8px;">📅 Resumo Semanal</p><p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 6px;">Oi, ${safeName}! 👋</p><p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 24px;">O que aconteceu no seu perfil nos <strong>últimos 7 dias</strong>:</p><div style="margin-bottom:24px;">${statsHtml}</div><div style="text-align:center;margin-bottom:24px;"><a href="${siteUrl}" style="display:inline-block;background:#e83e68;color:white;font-size:17px;font-weight:700;padding:16px 40px;border-radius:14px;text-decoration:none;">Ver em nosigilo.net →</a></div><div style="border-top:1px solid #f4c7d7;padding-top:16px;text-align:center;"><p style="font-size:12px;color:#b08090;margin:0;">Você recebe este e-mail por ter conta no nosigilo.net.<br><a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">nosigilo.net</a></p></div></div></div></body></html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_weekly_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}
