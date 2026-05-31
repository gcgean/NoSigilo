import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './env.js';
import { initDb, type DbHandle } from './db.js';
import { createApp, ensureAdministrativeAccess, seedDemo } from './app.js';
import { seedBrazilianCities } from './seedCities.js';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { sendReengagementEmail, sendWeeklySummaryEmail } from './email.js';
import { randomUUID } from 'node:crypto';

// ─── Automation Scheduler ─────────────────────────────────────────────────────
// Runs every hour and checks if daily/weekly tasks need to fire.
// Timestamps are stored in-memory (survives restarts via re-check logic).

let lastDailyRunDate = '';    // "YYYY-MM-DD" — reengagement emails
let lastWeeklyRunDate = '';   // "YYYY-MM-DD" — weekly summary emails
let lastOnlinePushDate = '';  // "YYYY-MM-DD" — online push notification

// Helper: given a user's looking_for_json array, build a SQL WHERE fragment
// that matches profile genders the user is interested in.
function buildGenderMatchClause(lookingForJson: string | null, tableAlias = 'u2'): string {
  let lookingFor: string[] = [];
  try { lookingFor = JSON.parse(lookingForJson || '[]'); } catch { /* ignore */ }
  if (!Array.isArray(lookingFor) || lookingFor.length === 0) return '';

  const conds: string[] = [];
  let wantsCasal = false;
  const exactSet = new Set<string>();

  for (const pref of lookingFor) {
    const l = String(pref || '').toLowerCase().trim();
    if (l.startsWith('hom') || l === 'man' || l === 'male') {
      exactSet.add('Homem'); exactSet.add('homem');
    } else if (l.startsWith('mul') || l === 'woman' || l === 'female') {
      exactSet.add('Mulher'); exactSet.add('mulher');
    } else if (l.startsWith('cas') || l === 'couple') {
      wantsCasal = true;
    } else {
      exactSet.add(pref);
    }
  }

  const exact = [...exactSet];
  if (exact.length > 0) conds.push(`${tableAlias}.gender IN (${exact.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`);
  if (wantsCasal) conds.push(`${tableAlias}.gender LIKE 'Casal%'`);
  if (conds.length === 0) return '';
  return `AND (${tableAlias}.gender IS NULL OR ${tableAlias}.gender = '' OR ${conds.join(' OR ')})`;
}

async function runDailyReengagement(db: DbHandle) {
  console.log('[scheduler] Running daily reengagement (min 7 days inactive)...');
  const now = new Date().toISOString();
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  // Do not email same user more than once every 7 days
  const cooldown = ago(7);

  // Fetch users inactive 7–90 days, not emailed in last 7 days
  // Include looking_for_json + gender so we can personalise the email
  const users = await db.queryAll(
    `SELECT u.id, u.name, u.email, u.last_seen_at, u.city, u.state,
            u.gender, u.looking_for_json,
            (SELECT COUNT(*) FROM profile_visits pv
               WHERE pv.visited_user_id = u.id AND pv.created_at > u.last_seen_at) as visits,
            (SELECT COUNT(*) FROM likes l
               WHERE l.target_type = 'user' AND l.target_id = u.id
               AND l.created_at > u.last_seen_at) as likes,
            (SELECT COUNT(*) FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)
               AND m.sender_id != u.id AND m.created_at > u.last_seen_at
               AND m.is_read = 0) as messages
     FROM users u
     WHERE u.email IS NOT NULL AND u.email != ''
       AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       AND u.last_seen_at IS NOT NULL
       AND u.last_seen_at < ?
       AND u.last_seen_at > ?
       AND COALESCE(
             (SELECT re.sent_at FROM reengagement_emails re
              WHERE re.user_id = u.id ORDER BY re.sent_at DESC LIMIT 1),
             '1970-01-01'
           ) < ?
     LIMIT 500`,
    [ago(7), ago(90), cooldown]
  ) as any[];

  let sent = 0;
  let errs = 0;
  for (const u of users) {
    try {
      // Count new matching profiles in user's city since last login
      const genderClause = buildGenderMatchClause(u.looking_for_json, 'u2');
      const newMatchRow = u.city ? await db.queryOne(
        `SELECT COUNT(*) as c FROM users u2
         WHERE u2.city = ? AND u2.id != ?
           AND u2.created_at > ?
           AND u2.is_banned = 0
           ${genderClause}`,
        [u.city, u.id, u.last_seen_at]
      ) as any : null;
      const newMatches = Number(newMatchRow?.c || 0);

      await sendReengagementEmail(
        { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: env.APP_NAME, siteUrl: env.FRONTEND_ORIGIN },
        {
          to: u.email,
          userName: String(u.name || 'você'),
          stats: {
            visits: Number(u.visits || 0),
            likes: Number(u.likes || 0),
            messages: Number(u.messages || 0),
            matches: newMatches, // new compatible profiles since last visit
          },
        }
      );
      await db.run(
        `INSERT INTO reengagement_emails (id, user_id, sent_at, status) VALUES (?, ?, ?, ?)`,
        [randomUUID(), u.id, now, 'sent']
      );
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errs++;
      console.error('[scheduler/reengagement] error for user', u.id, err);
    }
  }
  console.log(`[scheduler] Reengagement done: ${sent} sent, ${errs} errors, ${users.length} candidates`);
}

async function runWeeklySummary(db: DbHandle) {
  console.log('[scheduler] Running weekly summary emails...');
  const now = new Date().toISOString();
  const ago7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const ago30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ago14 = new Date(Date.now() - 14 * 86_400_000).toISOString();

  // Fetch base user info + looking_for for personalized filtering
  const users = await db.queryAll(
    `SELECT u.id, u.name, u.email, u.city, u.state, u.last_seen_at,
            u.gender, u.looking_for_json,
            (SELECT COUNT(*) FROM profile_visits pv
               WHERE pv.visited_user_id = u.id AND pv.created_at >= ?) as visits,
            (SELECT COUNT(*) FROM likes l
               WHERE l.target_type = 'user' AND l.target_id = u.id
               AND l.created_at >= ?) as likes,
            (SELECT COUNT(*) FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)
               AND m.sender_id != u.id AND m.is_read = 0) as unread_msgs
     FROM users u
     WHERE u.email IS NOT NULL AND u.email != ''
       AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       AND u.last_seen_at >= ?
       AND COALESCE(
             (SELECT ws.sent_at FROM reengagement_emails ws
              WHERE ws.user_id = u.id AND ws.status = 'weekly_sent'
              ORDER BY ws.sent_at DESC LIMIT 1),
             '1970-01-01'
           ) < ?
     LIMIT 1000`,
    [ago7, ago7, ago30, ago14]
  ) as any[];

  let sent = 0;
  let errs = 0;
  for (const u of users) {
    try {
      // Count new + active profiles that match user's interest in their city
      const genderClause = buildGenderMatchClause(u.looking_for_json, 'u2');
      const [newRow, activeRow] = await Promise.all([
        u.city ? db.queryOne(
          `SELECT COUNT(*) as c FROM users u2
           WHERE u2.city = ? AND u2.id != ? AND u2.created_at >= ?
             AND u2.is_banned = 0 ${genderClause}`,
          [u.city, u.id, ago7]
        ) as Promise<any> : Promise.resolve({ c: 0 }),
        u.city ? db.queryOne(
          `SELECT COUNT(*) as c FROM users u2
           WHERE u2.city = ? AND u2.id != ? AND u2.last_seen_at >= ?
             AND u2.is_banned = 0 ${genderClause}`,
          [u.city, u.id, ago7]
        ) as Promise<any> : Promise.resolve({ c: 0 }),
      ]);

      await sendWeeklySummaryEmail(
        { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: env.APP_NAME, siteUrl: env.FRONTEND_ORIGIN },
        {
          to: u.email,
          userName: String(u.name || 'você'),
          stats: {
            profileVisits: Number(u.visits || 0),
            likesReceived: Number(u.likes || 0),
            unreadMessages: Number(u.unread_msgs || 0),
            newInCity: Number(newRow?.c || 0),      // only matching-gender profiles
            activeInCity: Number(activeRow?.c || 0), // only matching-gender active
          },
        }
      );
      await db.run(
        `INSERT INTO reengagement_emails (id, user_id, sent_at, status) VALUES (?, ?, ?, ?)`,
        [randomUUID(), u.id, now, 'weekly_sent']
      );
      sent++;
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errs++;
      console.error('[scheduler/weekly] error for user', u.id, err);
    }
  }
  console.log(`[scheduler] Weekly summary done: ${sent} sent, ${errs} errors, ${users.length} candidates`);
}

async function runNearbyOnlinePush(db: DbHandle, onlineCount: number) {
  console.log(`[scheduler] Sending "online now" push to inactive users (${onlineCount} online)...`);
  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const ago7 = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // Fetch inactive users with push subscriptions + their preferences
  const users = await db.queryAll(
    `SELECT u.id, u.city, u.looking_for_json FROM users u
     JOIN push_subscriptions ps ON ps.user_id = u.id
     WHERE u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       AND (u.last_seen_at IS NULL OR u.last_seen_at < ?)
     GROUP BY u.id
     LIMIT 300`,
    [twoHoursAgo]
  ) as any[];

  let sent = 0;
  for (const u of users) {
    try {
      // Count compatible profiles online in user's city
      const genderClause = buildGenderMatchClause(u.looking_for_json, 'u2');
      const compatRow = u.city ? await db.queryOne(
        `SELECT COUNT(*) as c FROM users u2
         WHERE u2.city = ? AND u2.id != ? AND u2.last_seen_at >= ?
           AND u2.is_banned = 0 ${genderClause}`,
        [u.city, u.id, ago7]
      ) as any : null;
      const compatCount = Number(compatRow?.c || 0);

      // Build personalized message
      const body = compatCount > 0
        ? `${compatCount} perfil${compatCount > 1 ? 's' : ''} compatível${compatCount > 1 ? 'is' : ''} ativo${compatCount > 1 ? 's' : ''} perto de você agora.`
        : `${onlineCount} pessoas ativas na plataforma agora. Entre e conecte-se!`;

      const subs = await db.queryAll(
        'SELECT endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?',
        [u.id]
      ) as any[];

      for (const sub of subs) {
        const parsed = JSON.parse(String(sub.subscription_json || '{}'));
        if (!parsed?.endpoint) continue;
        const { default: webpush } = await import('web-push');
        await webpush.sendNotification(parsed, JSON.stringify({
          title: '🔥 Usuários online agora',
          body,
          url: '/match',
          tag: 'online-now',
        })).catch(() => {});
      }
      sent++;
    } catch { /* ignore */ }
  }
  console.log(`[scheduler] Online push sent to ${sent} users`);
}

function startScheduler(db: DbHandle, presence?: { countOnline: () => number }) {
  const check = async () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const weekday = now.getUTCDay(); // 0=Sun, 1=Mon

    // Daily reengagement emails — 8am UTC
    if (hour === 8 && lastDailyRunDate !== dateStr) {
      lastDailyRunDate = dateStr;
      runDailyReengagement(db).catch(err => console.error('[scheduler/daily] fatal', err));
    }

    // Weekly summary emails — Monday 9am UTC
    if (weekday === 1 && hour === 9 && lastWeeklyRunDate !== dateStr) {
      lastWeeklyRunDate = dateStr;
      runWeeklySummary(db).catch(err => console.error('[scheduler/weekly] fatal', err));
    }

    // Push: "users online in your region" — every day at 20:00 UTC (prime time)
    // Only fires if there are 5+ users online
    if (hour === 20 && lastOnlinePushDate !== dateStr) {
      lastOnlinePushDate = dateStr;
      const onlineCount = presence?.countOnline() ?? 0;
      if (onlineCount >= 5) {
        runNearbyOnlinePush(db, onlineCount).catch(err => console.error('[scheduler/online-push] fatal', err));
      }
    }
  };

  // Check every 30 minutes
  setInterval(check, 30 * 60 * 1000);
  // Also run once on startup (will be a no-op unless it's the right hour)
  check().catch(() => {});
  console.log('[scheduler] Started — daily reengagement at 08:00 UTC, weekly summary on Mondays at 09:00 UTC');
}

async function main() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const db = await initDb({
    databaseFile: env.DATABASE_FILE,
    migrationsDir,
    pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
    databaseUrl: env.DATABASE_URL || undefined,
  });

  await seedBrazilianCities(db);
  if (env.SEED_DEMO) {
    await seedDemo(db, env);
  }
  await ensureAdministrativeAccess(db);

  const app = createApp({ db, env });
  const httpServer = createServer(app);
  const onlineCounts = new Map<string, number>();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.FRONTEND_ORIGIN, methods: ['GET', 'POST'] },
  });
  app.set('io', io);
  app.set('presence', {
    isOnline: (userId: string) => {
      const n = onlineCounts.get(userId);
      return typeof n === 'number' && n > 0;
    },
    countOnline: () => {
      let total = 0;
      for (const value of onlineCounts.values()) {
        if (value > 0) total += 1;
      }
      return total;
    },
  });
  io.use((socket, next) => {
    const token = (socket.handshake.auth as any)?.token;
    if (!token || typeof token !== 'string') {
      next(new Error('unauthorized'));
      return;
    }
    try {
      jwt.verify(token, env.JWT_SECRET);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    const token = (socket.handshake.auth as any)?.token;
    let userId: string | null = null;
    try {
      const decoded: any = jwt.verify(String(token), env.JWT_SECRET);
      if (decoded?.sub) userId = String(decoded.sub);
    } catch {}
    if (userId) {
      onlineCounts.set(userId, (onlineCounts.get(userId) ?? 0) + 1);
      socket.join(`user:${userId}`);
      io.emit('presence.changed', { userId, isOnline: true });
    }

    socket.on('join.conversation', async (conversationId: string) => {
      if (typeof conversationId !== 'string' || conversationId.length === 0) return;
      if (!userId) return;
      // Only allow joining if user is a participant
      try {
        const conv = await db.queryOne(
          'SELECT id FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)',
          [conversationId, userId, userId]
        );
        if (conv) {
          socket.join(conversationId);
        }
      } catch {
        // ignore db errors in socket handler
      }
    });

    socket.on('disconnect', async () => {
      if (!userId) return;
      const next = (onlineCounts.get(userId) ?? 1) - 1;
      if (next <= 0) {
        onlineCounts.delete(userId);
        const now = new Date().toISOString();
        try {
          await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [now, userId]);
        } catch (err) {
          console.error('Failed to update last_seen_at:', err);
        }
        io.emit('presence.changed', { userId, isOnline: false, lastSeenAt: now });
      } else {
        onlineCounts.set(userId, next);
      }
    });
  });

  httpServer.listen(env.PORT, () => {
    console.log(`nosigilo-backend listening on http://localhost:${env.PORT}`);
  });

  // Start automatic email scheduler (reengagement + weekly summary)
  // Pass presence so push "users online" can check real counts
  startScheduler(db, app.get('presence') as { countOnline: () => number } | undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
