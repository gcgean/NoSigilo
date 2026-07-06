import jwt from 'jsonwebtoken';
import { env } from './env.js';

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

// Link de descadastro (1 clique) assinado pelo e-mail do destinatário.
export function buildUnsubscribeUrl(email: string, siteUrl?: string) {
  const base = (siteUrl || env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '');
  const token = jwt.sign({ email, purpose: 'unsubscribe' }, env.JWT_SECRET);
  return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

// Rodapé de descadastro — exigido por boas práticas anti-spam/Gmail. Anexado
// automaticamente nos e-mails de marketing a partir do e-mail do destinatário.
function withUnsubscribe(html: string, email: string, siteUrl?: string) {
  if (!email) return html;
  const url = buildUnsubscribeUrl(email, siteUrl);
  const footer = `
    <div style="max-width:560px;margin:14px auto 0;text-align:center;font-family:Arial,sans-serif;">
      <p style="font-size:12px;color:#9aa0a6;line-height:1.5;margin:0;">
        Não quer mais receber estes e-mails?
        <a href="${url}" style="color:#9aa0a6;text-decoration:underline;">Descadastrar com 1 clique</a>.
      </p>
    </div>`;
  return html + footer;
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

// ─── E-mail de moderação (banimento, advertência, retorno de denúncia) ────────

type ModerationEmailOptions = { apiKey?: string; fromEmail?: string; appName?: string; siteUrl?: string };

export async function sendModerationEmail(
  options: ModerationEmailOptions,
  payload: { to: string; userName?: string | null; subject: string; heading: string; lines: string[] }
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }
  const appName = options.appName || 'NoSigilo';
  const safeName = payload.userName ? escapeHtml(String(payload.userName).split(' ')[0]) : '';
  const greeting = safeName ? `Olá, ${safeName}.` : 'Olá.';
  const paragraphs = payload.lines
    .map((l) => `<p style="font-size:15px; line-height:1.7; margin:0 0 14px; color:#3a2630;">${escapeHtml(l)}</p>`)
    .join('');
  const html = `
    <div style="font-family: Arial, sans-serif; background:#fff7fa; padding:24px; color:#2b1720;">
      <div style="max-width:560px; margin:0 auto; background:white; border:1px solid #f4c7d7; border-radius:18px; padding:32px;">
        <h1 style="margin:0 0 16px; font-size:24px; color:#e83e68;">${appName}</h1>
        <h2 style="margin:0 0 14px; font-size:19px; color:#2b1720;">${escapeHtml(payload.heading)}</h2>
        <p style="font-size:15px; line-height:1.7; margin:0 0 14px; color:#3a2630;">${greeting}</p>
        ${paragraphs}
        <p style="font-size:12px; line-height:1.6; margin:22px 0 0; color:#9a7e88;">${appName} — aviso automático da moderação.</p>
      </div>
    </div>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject: payload.subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_moderation_error:${response.status}:${body}`);
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
      html: withUnsubscribe(html, payload.to),
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
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html: withUnsubscribe(html, payload.to) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_weekly_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}

// ─── Promoter Campaign Email ─────────────────────────────────────────────────
export async function sendPromoterCampaignEmail(
  options: { apiKey?: string; fromEmail?: string; appName?: string; siteUrl?: string },
  payload: { to: string; userName?: string | null }
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }

  const appName = options.appName || 'NoSigilo';
  const siteUrl = options.siteUrl || 'https://nosigilo.net';
  const safeName = payload.userName ? escapeHtml(payload.userName) : 'você';
  const promoterUrl = `${siteUrl}/ganhe`;

  const subjects = [
    `💰 Ganhe até R$1.980/mês indicando a plataforma — 100% grátis`,
    `💰 ${safeName}, ganhe até R$1.980 todo mês sem investir nada`,
    `💸 Renda extra recorrente: R$1,98 por assinatura confirmada`,
    `🚀 Ganhe até R$1.980/mês divulgando o ${appName} — grátis para participar`,
    `🔥 Até R$1.980 todo mês no Pix — veja como no ${appName}`,
  ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f0fdf4;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${siteUrl}" style="text-decoration:none;">
      <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
        <span style="color:white;font-size:20px;font-weight:800;">${appName}</span>
      </div>
    </a>
  </div>
  <div style="background:white;border-radius:20px;border:1px solid #bbf7d0;padding:36px 32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">💰</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#15803d;">Ganhe dinheiro divulgando o ${appName}!</h1>
      <p style="font-size:15px;color:#4b5563;margin:0;">Oi, ${safeName}! Temos uma novidade incrível para você.</p>
    </div>

    <p style="font-size:16px;line-height:1.6;color:#1f2937;margin:0 0 20px;">
      Agora você pode <strong>ganhar renda extra todo mês</strong> simplesmente indicando pessoas para o ${appName}.
      Cada assinatura confirmada que vier pelo seu link gera <strong style="color:#15803d;">R$1,98 de comissão</strong> direto no seu Pix.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px;margin:0 0 24px;">
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15803d;margin:0 0 12px;">✨ Como funciona</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">1</span>
          <span>Cadastre-se como promotor e pegue seu link exclusivo</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">2</span>
          <span>Compartilhe nas redes sociais, grupos e com amigos</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">3</span>
          <span>Receba <strong>R$1,98 por assinatura</strong> confirmada, todo mês via Pix</span>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:12px;margin:0 0 24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#fef9c3;border-radius:12px;padding:16px;text-align:center;border:1px solid #fde047;">
        <p style="font-size:22px;font-weight:800;color:#854d0e;margin:0;">20%</p>
        <p style="font-size:12px;color:#713f12;margin:4px 0 0;">de comissão</p>
      </div>
      <div style="flex:1;min-width:140px;background:#dcfce7;border-radius:12px;padding:16px;text-align:center;border:1px solid #86efac;">
        <p style="font-size:22px;font-weight:800;color:#15803d;margin:0;">R$0</p>
        <p style="font-size:12px;color:#166534;margin:4px 0 0;">para começar</p>
      </div>
      <div style="flex:1;min-width:140px;background:#e0f2fe;border-radius:12px;padding:16px;text-align:center;border:1px solid #7dd3fc;">
        <p style="font-size:22px;font-weight:800;color:#0369a1;margin:0;">Pix</p>
        <p style="font-size:12px;color:#075985;margin:4px 0 0;">todo mês</p>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${promoterUrl}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:white;font-size:17px;font-weight:700;padding:18px 44px;border-radius:14px;text-decoration:none;">
        💰 Quero ser promotor agora →
      </a>
      <p style="font-size:12px;color:#6b7280;margin-top:10px;">Gratuito. Sem investimento. Comece hoje.</p>
    </div>

    <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">Você recebe este e-mail por ter conta no ${appName}.<br>
      <a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">${appName.toLowerCase()}</a></p>
    </div>
  </div>
</div>
</body></html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html: withUnsubscribe(html, payload.to) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_promoter_campaign_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}

// ─── Promoter Incentive Email (para quem JÁ é promotor — reforça o engajamento) ──
export async function sendPromoterIncentiveEmail(
  options: { apiKey?: string; fromEmail?: string; appName?: string; siteUrl?: string },
  payload: {
    to: string;
    promoterName: string;
    totalReferred: number;
    totalEarnedCents: number;
  }
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }

  const appName = options.appName || 'NoSigilo';
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const dashboardUrl = `${siteUrl}/promoter`;
  const safeName = escapeHtml(payload.promoterName.split(' ')[0] || payload.promoterName);
  const earnedBRL = (payload.totalEarnedCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const hasHistory = payload.totalReferred > 0;

  const subjects = hasHistory
    ? [
        `🚀 ${safeName}, você já ganhou ${earnedBRL} — continue indicando!`,
        `💰 Faltam poucos passos para o próximo Pix, ${safeName}`,
        `🔥 Seu link já rendeu ${payload.totalReferred} assinatura(s) — bora fazer mais?`,
      ]
    : [
        `💰 ${safeName}, seu link de promotor está esperando a primeira indicação`,
        `🚀 Ainda não ganhou sua primeira comissão? Vamos mudar isso, ${safeName}`,
        `👋 ${safeName}, compartilhe seu link e comece a ganhar hoje`,
      ];
  const subject = subjects[Math.floor(Math.random() * subjects.length)];

  const statsHtml = hasHistory
    ? `
    <div style="display:flex;gap:12px;margin:0 0 24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#dcfce7;border-radius:12px;padding:16px;text-align:center;border:1px solid #86efac;">
        <p style="font-size:22px;font-weight:800;color:#15803d;margin:0;">${payload.totalReferred}</p>
        <p style="font-size:12px;color:#166534;margin:4px 0 0;">assinatura(s) indicada(s)</p>
      </div>
      <div style="flex:1;min-width:140px;background:#fef9c3;border-radius:12px;padding:16px;text-align:center;border:1px solid #fde047;">
        <p style="font-size:22px;font-weight:800;color:#854d0e;margin:0;">${earnedBRL}</p>
        <p style="font-size:12px;color:#713f12;margin:4px 0 0;">já ganho no total</p>
      </div>
    </div>`
    : `
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:14px;padding:16px 20px;margin:0 0 24px;text-align:center;">
      <p style="font-size:14px;color:#713f12;margin:0;">Você ainda não teve nenhuma indicação confirmada — mas seu link já está pronto e cada assinatura vale <strong>R$1,98 recorrente</strong> todo mês.</p>
    </div>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f0fdf4;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${siteUrl}" style="text-decoration:none;">
      <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
        <span style="color:white;font-size:20px;font-weight:800;">${appName}</span>
      </div>
    </a>
  </div>
  <div style="background:white;border-radius:20px;border:1px solid #bbf7d0;padding:36px 32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">${hasHistory ? '🚀' : '👋'}</div>
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#15803d;">
        ${hasHistory ? `Continue ganhando, ${safeName}!` : `Vamos começar, ${safeName}?`}
      </h1>
      <p style="font-size:15px;color:#4b5563;margin:0;">
        ${hasHistory
          ? 'Seu link de promotor já está gerando resultado. Compartilhar mais é o caminho mais rápido para o próximo Pix.'
          : 'Seu link de promotor já está ativo — falta só compartilhar para começar a receber comissões todo mês.'}
      </p>
    </div>

    ${statsHtml}

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;padding:20px;margin:0 0 24px;">
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15803d;margin:0 0 12px;">💡 Ideias rápidas para indicar hoje</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">1</span>
          <span>Poste seu link nos stories e grupos de WhatsApp/Telegram</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">2</span>
          <span>Comente em fóruns e comunidades do meio liberal</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:14px;color:#1f2937;">
          <span style="background:#15803d;color:white;border-radius:50%;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">3</span>
          <span>Receba <strong>R$1,98 por assinatura</strong> confirmada, todo mês via Pix</span>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#16a34a,#15803d);color:white;font-size:17px;font-weight:700;padding:18px 44px;border-radius:14px;text-decoration:none;">
        🔗 Ver meu link e indicar agora →
      </a>
      <p style="font-size:12px;color:#6b7280;margin-top:10px;">Acesse seu painel de promotor para copiar o link e compartilhar.</p>
    </div>

    <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">Você recebe este e-mail por ser promotor(a) ativo(a) no ${appName}.<br>
      <a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">${appName.toLowerCase()}</a></p>
    </div>
  </div>
</div>
</body></html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html: withUnsubscribe(html, payload.to) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_promoter_incentive_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}

// ─── Promoter Monthly Summary Email ──────────────────────────────────────────
export async function sendPromoterMonthlySummaryEmail(
  options: { apiKey?: string; fromEmail?: string; appName?: string; siteUrl?: string },
  payload: {
    to: string;
    promoterName: string;
    period: string; // 'YYYY-MM'
    totalSubscriptions: number;
    commissionCents: number;   // total em centavos
    pendingCents: number;      // ainda pendente de aprovação
    approvedCents: number;     // aprovado aguardando pagamento
    paidCents: number;         // já pago
    dueDate: string;           // '10/MM/YYYY' — data de pagamento prevista
  }
) {
  if (!options.apiKey || !options.fromEmail) {
    return { skipped: true as const };
  }

  const appName  = options.appName  || 'NoSigilo';
  const siteUrl  = options.siteUrl  || 'https://nosigilo.net';
  const safeName = escapeHtml(payload.promoterName);
  const [year, month] = payload.period.split('-');
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const monthLabel = `${monthNames[parseInt(month, 10) - 1]} / ${year}`;

  const fmt = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const subject = `💰 Seu resumo de comissões de ${monthLabel} — ${appName}`;

  const statusRows = [
    payload.pendingCents  > 0 ? `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;">⏳ Pendente de aprovação</td><td style="padding:8px 12px;font-size:14px;font-weight:700;color:#d97706;text-align:right;">${fmt(payload.pendingCents)}</td></tr>` : '',
    payload.approvedCents > 0 ? `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;">✅ Aprovado (aguardando Pix)</td><td style="padding:8px 12px;font-size:14px;font-weight:700;color:#2563eb;text-align:right;">${fmt(payload.approvedCents)}</td></tr>` : '',
    payload.paidCents     > 0 ? `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;">💸 Já pago via Pix</td><td style="padding:8px 12px;font-size:14px;font-weight:700;color:#16a34a;text-align:right;">${fmt(payload.paidCents)}</td></tr>` : '',
  ].filter(Boolean).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f0fdf4;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${siteUrl}" style="text-decoration:none;">
      <div style="display:inline-block;background:#e83e68;border-radius:16px;padding:10px 22px;">
        <span style="color:white;font-size:20px;font-weight:800;">${appName}</span>
      </div>
    </a>
  </div>
  <div style="background:white;border-radius:20px;border:1px solid #bbf7d0;padding:36px 32px;">
    <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15803d;margin:0 0 8px;">💰 Resumo Mensal — Programa de Promotores</p>
    <h1 style="font-size:22px;font-weight:800;color:#1f2937;margin:0 0 6px;">Oi, ${safeName}! 👋</h1>
    <p style="font-size:15px;color:#6b7280;margin:0 0 24px;">Aqui está o seu resumo de comissões referente a <strong style="color:#1f2937;">${monthLabel}</strong>.</p>

    <!-- Big number -->
    <div style="background:linear-gradient(135deg,#16a34a,#15803d);border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
      <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0 0 4px;">Total de comissões geradas</p>
      <p style="color:white;font-size:38px;font-weight:900;margin:0 0 4px;">${fmt(payload.commissionCents)}</p>
      <p style="color:rgba(255,255,255,0.75);font-size:13px;margin:0;">${payload.totalSubscriptions} assinatura${payload.totalSubscriptions !== 1 ? 's' : ''} confirmada${payload.totalSubscriptions !== 1 ? 's' : ''} via seu convite</p>
    </div>

    <!-- Breakdown table -->
    ${statusRows ? `
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;font-size:12px;text-align:left;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
          <th style="padding:8px 12px;font-size:12px;text-align:right;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Valor</th>
        </tr>
      </thead>
      <tbody>${statusRows}</tbody>
    </table>` : ''}

    <!-- Payment date -->
    <div style="background:#fefce8;border:1px solid #fde047;border-radius:12px;padding:14px 16px;margin:0 0 24px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:20px;">📅</span>
      <div>
        <p style="font-size:13px;font-weight:700;color:#854d0e;margin:0 0 2px;">Previsão de pagamento</p>
        <p style="font-size:13px;color:#713f12;margin:0;">Pagamentos aprovados são realizados via Pix até <strong>${payload.dueDate}</strong>.</p>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${siteUrl}/promoter" style="display:inline-block;background:#e83e68;color:white;font-size:16px;font-weight:700;padding:15px 36px;border-radius:14px;text-decoration:none;">
        Ver meu painel completo →
      </a>
    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #e5e7eb;padding-top:16px;text-align:center;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        Você recebe este e-mail por ser promotor do ${appName}.<br>
        Dúvidas? Acesse <a href="${siteUrl}/promoter" style="color:#e83e68;text-decoration:none;">seu painel de promotor</a>.
      </p>
    </div>
  </div>
</div>
</body></html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html: withUnsubscribe(html, payload.to) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_promoter_monthly_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}

// ─── Win-back Campaign Email (usuários que entraram 1x e não voltaram) ───────
type WinbackOptions = {
  apiKey?: string;
  fromEmail?: string;
  appName?: string;
  siteUrl?: string;
};

type WinbackPayload = {
  to: string;
  userName: string;
  claimUrl: string;            // link que concede 30 dias grátis
  priceLabel?: string;         // ex.: "9,90"
  stats?: {
    visits?: number;
    likes?: number;
    messages?: number;
  };
};

export async function sendWinbackEmail(options: WinbackOptions, payload: WinbackPayload) {
  if (!options.apiKey || !options.fromEmail) return { skipped: true as const };

  const appName = options.appName || 'NoSigilo';
  const siteUrl = (options.siteUrl || 'https://nosigilo.net').replace(/\/$/, '');
  const safeName = escapeHtml(payload.userName.split(' ')[0] || payload.userName);
  const claimUrl = payload.claimUrl;
  const price = payload.priceLabel || '9,90';
  const visits = payload.stats?.visits ?? 0;
  const likes = payload.stats?.likes ?? 0;
  const messages = payload.stats?.messages ?? 0;

  // O que ele perdeu — gatilho de prova social + FOMO. Se não houver dados
  // reais, usamos uma frase de escassez genérica (sempre verdadeira).
  const missed: string[] = [];
  if (visits > 0) missed.push(`<strong>${visits}</strong> ${visits === 1 ? 'pessoa visitou' : 'pessoas visitaram'} seu perfil`);
  if (likes > 0) missed.push(`<strong>${likes}</strong> ${likes === 1 ? 'curtida' : 'curtidas'} no seu perfil`);
  if (messages > 0) missed.push(`<strong>${messages}</strong> ${messages === 1 ? 'mensagem' : 'mensagens'} esperando resposta`);
  const missedHtml = (missed.length ? missed : [
    'Vários perfis novos e verificados entraram na sua região',
    'Gente compatível com você esteve online procurando conexões',
  ]).map((m) => `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:10px;background:#fff1f5;margin-bottom:8px;">
        <span style="font-size:18px;">💜</span>
        <span style="font-size:15px;color:#2b1720;line-height:1.4;">${m}</span>
      </div>`).join('');

  const subjects = [
    `${safeName}, abrimos 30 dias grátis pra você voltar 🎁`,
    `Sentimos sua falta, ${safeName} — 30 dias grátis te esperando 💜`,
    `${safeName}, você entrou e sumiu... veja o que perdeu (e ganhe 30 dias) 👀`,
    `Um presente pra você voltar, ${safeName}: 30 dias grátis ⏳`,
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

    <div style="background:white;border-radius:20px;border:1px solid #f4c7d7;padding:36px 32px;box-shadow:0 4px 24px rgba(232,62,104,0.06);">

      <!-- Greeting -->
      <p style="font-size:22px;font-weight:700;color:#2b1720;margin:0 0 6px;">Oi, ${safeName} 💜</p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 8px;">
        Você criou sua conta, deu uma espiada... e foi embora. A gente entende — mas <strong style="color:#e83e68;">muita coisa aconteceu desde então</strong>.
      </p>
      <p style="font-size:15px;color:#6b4b57;line-height:1.6;margin:0 0 24px;">
        E preparamos algo pra você voltar do jeito certo.
      </p>

      <!-- Gift / offer block -->
      <div style="background:linear-gradient(135deg,#e83e68 0%,#b5179e 100%);border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px;">🎁 Presente de boas-vindas</p>
        <p style="color:#fff;font-size:34px;font-weight:900;margin:0 0 4px;">30 DIAS GRÁTIS</p>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:0;">Acesso premium completo, sem pagar nada agora.</p>
      </div>

      <!-- What you missed -->
      <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#c81e58;margin:0 0 12px;">
        🔐 O que rolou enquanto você esteve fora
      </p>
      <div style="margin-bottom:24px;">
        ${missedHtml}
      </div>

      <!-- Scarcity / urgency -->
      <div style="background:#2b1720;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;">
        <p style="font-size:15px;color:#fff;line-height:1.7;margin:0;">
          Tem <strong style="color:#f472a0;">gente online agora mesmo</strong> procurando alguém com o seu perfil.<br>
          <span style="font-size:13px;color:#d4a0b5;">Quem volta primeiro, conecta primeiro.</span>
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:14px;">
        <a href="${claimUrl}"
           style="display:inline-block;background:#e83e68;color:white;font-size:18px;font-weight:800;padding:18px 40px;border-radius:14px;text-decoration:none;letter-spacing:-0.2px;box-shadow:0 6px 20px rgba(232,62,104,0.45);">
          Ativar meus 30 dias grátis →
        </a>
      </div>
      <p style="font-size:12px;color:#9a6b7a;text-align:center;margin:0 0 24px;">
        Basta entrar pelo botão acima — os 30 dias são liberados automaticamente.
      </p>

      <!-- Price reassurance -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;text-align:center;margin-bottom:20px;">
        <p style="font-size:14px;color:#15803d;line-height:1.6;margin:0;">
          E depois dos 30 dias? Só <strong style="font-size:18px;">R$ ${price}/mês</strong> — menos que um lanche. 🍔<br>
          <span style="font-size:13px;color:#16a34a;">Sem fidelidade. Cancele quando quiser.</span>
        </p>
      </div>

      <!-- Social proof -->
      <div style="border-top:1px solid #f4c7d7;padding-top:20px;">
        <p style="font-size:13px;color:#9a6b7a;text-align:center;line-height:1.6;margin:0;">
          🔒 <strong>Discreto. Seguro. Real.</strong><br>
          Mais de 600 perfis verificados conectando agora em <strong>nosigilo.net</strong>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:20px;">
      <p style="font-size:12px;color:#b08090;line-height:1.6;margin:0;">
        Você está recebendo este e-mail porque criou uma conta no nosigilo.net.<br>
        <a href="${siteUrl}" style="color:#e83e68;text-decoration:none;">nosigilo.net</a>
      </p>
    </div>

  </div>
</body>
</html>`.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject, html: withUnsubscribe(html, payload.to) }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_winback_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}

// ─── Admin Alert Email ────────────────────────────────────────────────────────
export async function sendAdminAlertEmail(
  options: { apiKey?: string; fromEmail?: string; appName?: string },
  payload: { to: string; subject: string; title: string; body: string }
) {
  if (!options.apiKey || !options.fromEmail) return { skipped: true as const };

  const appName = options.appName || 'NoSigilo';
  const safeTitle = escapeHtml(payload.title);
  const safeBody = escapeHtml(payload.body).replace(/\n/g, '<br>');
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const html = `
    <div style="font-family:Arial,sans-serif;background:#fff1f2;padding:24px;color:#1f2937;">
      <div style="max-width:600px;margin:0 auto;background:white;border:1px solid #fca5a5;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 4px;font-size:20px;color:#dc2626;">[${appName}] Alerta do Sistema</h1>
        <p style="margin:0 0 20px;font-size:13px;color:#9ca3af;">${now}</p>
        <h2 style="margin:0 0 12px;font-size:17px;color:#1f2937;">${safeTitle}</h2>
        <pre style="background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px;font-size:13px;white-space:pre-wrap;word-break:break-all;color:#7f1d1d;">${safeBody}</pre>
        <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">Este e-mail foi gerado automaticamente pelo servidor ${appName}.</p>
      </div>
    </div>
  `.trim();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.fromEmail, to: [payload.to], subject: payload.subject, html }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`resend_admin_alert_error:${response.status}:${body}`);
  }
  return { skipped: false as const };
}
