import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './env.js';
import { initDb } from './db.js';
import { createApp, seedDemo } from './app.js';
import { seedBrazilianCities } from './seedCities.js';
import path from 'node:path';
import jwt from 'jsonwebtoken';

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
    await seedDemo(db, { FRONTEND_ORIGIN: env.FRONTEND_ORIGIN, JWT_SECRET: env.JWT_SECRET, TRIAL_DAYS: env.TRIAL_DAYS });
  }

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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
