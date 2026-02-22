import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, existsSync, createReadStream, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';
import { nearestCity, searchCities } from './seedCities.js';

type Env = {
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
  TRIAL_DAYS: number;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  sexualOrientation?: string | null;
  ethnicity?: string | null;
  hair?: string | null;
  eyes?: string | null;
  height?: string | null;
  bodyType?: string | null;
  smokes?: string | null;
  drinks?: string | null;
  profession?: string | null;
  zodiacSign?: string | null;
  lookingFor?: string[] | null;
  isVerified: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  allowMessages?: string | null;
  createdAt?: string | null;
  lastSeenAt?: string | null;
  isOnline?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function hasPremiumAccess(userRow: any) {
  if (!userRow) return false;
  if (userRow.is_premium) return true;
  const ends = userRow.trial_ends_at ? new Date(String(userRow.trial_ends_at)) : null;
  if (ends && !Number.isNaN(ends.getTime()) && ends.getTime() > Date.now()) return true;
  return false;
}

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function createNotification(
  options: { db: DbHandle; io?: SocketIOServer },
  data: { userId: string; type: string; title: string; description?: string | null; dataJson?: any }
) {
  const id = randomUUID();
  const createdAt = nowIso();
  await run(
    options.db,
    'INSERT INTO notifications (id, user_id, type, title, description, data_json, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    [id, data.userId, data.type, data.title, data.description ?? null, data.dataJson ? JSON.stringify(data.dataJson) : null, createdAt]
  );
  await options.db.persist();
  options.io?.to(`user:${data.userId}`).emit('notification.created', {
    id,
    type: data.type,
    title: data.title,
    description: data.description ?? null,
    data: data.dataJson ?? null,
    isRead: false,
    createdAt,
  });
  return id;
}

async function canSendMessage(options: { db: DbHandle }, data: { fromUserId: string; toUserId: string }) {
  if (data.fromUserId === data.toUserId) return true;
  const row = (await queryOne(options.db, 'SELECT allow_messages FROM users WHERE id = ? LIMIT 1', [data.toUserId])) as any;
  const setting = row?.allow_messages ? String(row.allow_messages) : 'everyone';
  if (setting === 'everyone') return true;
  if (setting === 'nobody') return false;
  if (setting === 'friends') {
    const friend = (await queryOne(
      options.db,
      `SELECT 1 FROM friend_requests
       WHERE status = 'accepted'
         AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
       LIMIT 1`,
      [data.fromUserId, data.toUserId, data.toUserId, data.fromUserId]
    )) as any;
    return !!friend;
  }
  if (setting === 'matches') {
    const match = (await queryOne(
      options.db,
      `SELECT 1
       FROM likes a
       JOIN likes b ON b.user_id = ? AND b.target_type = 'user' AND b.target_id = ?
       WHERE a.user_id = ? AND a.target_type = 'user' AND a.target_id = ?
       LIMIT 1`,
      [data.toUserId, data.fromUserId, data.fromUserId, data.toUserId]
    )) as any;
    return !!match;
  }
  return true;
}

function extensionForMime(mime: string, originalName: string) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (ext) return ext;
  const m = (mime || '').toLowerCase();
  if (m === 'image/jpeg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'video/mp4') return '.mp4';
  if (m === 'video/webm') return '.webm';
  if (m === 'video/quicktime') return '.mov';
  return '';
}

function sendLocalFile(req: express.Request, res: express.Response, options: { filePath: string; mimeType?: string | null }) {
  const stat = statSync(options.filePath);
  const total = stat.size;
  const mimeType = options.mimeType ? String(options.mimeType) : undefined;
  const range = typeof req.headers.range === 'string' ? req.headers.range : '';

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');

  if (!range) {
    res.status(200);
    if (mimeType) res.type(mimeType);
    res.setHeader('Content-Length', total);
    createReadStream(options.filePath).pipe(res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > end || start >= total) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }

  const safeEnd = Math.min(end, total - 1);
  const chunkSize = safeEnd - start + 1;
  res.status(206);
  if (mimeType) res.type(mimeType);
  res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${total}`);
  res.setHeader('Content-Length', chunkSize);
  createReadStream(options.filePath, { start, end: safeEnd }).pipe(res);
}

function rowToPublicUser(row: any, isOnline?: boolean): PublicUser {
  const lookingFor = safeJsonParse(row.looking_for_json);
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    avatar: row.avatar ?? null,
    bio: row.bio ?? null,
    status: row.status ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    birthDate: row.birth_date ?? null,
    gender: row.gender ?? null,
    maritalStatus: row.marital_status ?? null,
    sexualOrientation: row.sexual_orientation ?? null,
    ethnicity: row.ethnicity ?? null,
    hair: row.hair ?? null,
    eyes: row.eyes ?? null,
    height: row.height ?? null,
    bodyType: row.body_type ?? null,
    smokes: row.smokes ?? null,
    drinks: row.drinks ?? null,
    profession: row.profession ?? null,
    zodiacSign: row.zodiac_sign ?? null,
    lookingFor: Array.isArray(lookingFor) ? lookingFor : null,
    isVerified: !!row.is_verified,
    isPremium: !!row.is_premium,
    isAdmin: !!row.is_admin,
    trialStartedAt: row.trial_started_at ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    allowMessages: row.allow_messages ?? null,
    createdAt: row.created_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    isOnline: isOnline ?? false,
  };
}

function issueToken(env: Env, user: { id: string; isAdmin: boolean }) {
  return jwt.sign({ sub: user.id, admin: user.isAdmin }, env.JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(env: Env, db: DbHandle): express.RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const token = header.slice('Bearer '.length);
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      const userId = String(decoded.sub || '');
      const isAdmin = !!decoded.admin;
      const userRow = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [userId])) as any;
      if (!userRow) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      req.auth = { userId, isAdmin: isAdmin && !!userRow.is_admin };
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
}

function requireAdmin(): express.RequestHandler {
  return (req, res, next) => {
    if (!req.auth?.isAdmin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

export async function seedDemo(db: DbHandle, env: Env) {
  const countRow = (await queryOne(db, 'SELECT COUNT(1) as c FROM users')) as any;
  if (Number(countRow?.c || 0) > 0) return;

  const createdAt = nowIso();
  const trialEndsAt = addDaysIso(createdAt, env.TRIAL_DAYS);

  const demoUserId = randomUUID();
  await run(
    db,
    `
    INSERT INTO users (
      id, email, password_hash, name, avatar, bio, status, city, state, birth_date, gender, marital_status,
      sexual_orientation, ethnicity, hair, eyes, height, body_type, smokes, drinks, profession, zodiac_sign,
      looking_for_json, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      demoUserId,
      'demo@nosigilo.com',
      bcrypt.hashSync('demo123', 10),
      'Marina Santos',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
      'Apaixonada por viagens e novas experiências ✨',
      'Vamos conversar?',
      'São Paulo',
      'SP',
      '1996-05-20',
      'Mulher',
      'Solteiro(a)',
      'Heterossexual',
      'Branco',
      'Castanhos',
      'Castanhos',
      '1.68 m',
      'Atlético(a)',
      'Não',
      'Socialmente',
      'Designer',
      'Gêmeos',
      JSON.stringify(['Mulher', 'Casal (Ele/Ela)']),
      1,
      0,
      0,
      createdAt,
      createdAt,
      trialEndsAt,
    ]
  );

  const adminUserId = randomUUID();
  await run(
    db,
    `
    INSERT INTO users (
      id, email, password_hash, name, avatar, bio, status, city, state, birth_date, gender, marital_status,
      sexual_orientation, ethnicity, hair, eyes, height, body_type, smokes, drinks, profession, zodiac_sign,
      looking_for_json, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      adminUserId,
      'admin@nosigilo.com',
      bcrypt.hashSync('admin123', 10),
      'Admin NoSigilo',
      null,
      null,
      null,
      'São Paulo',
      'SP',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      1,
      1,
      1,
      createdAt,
      createdAt,
      trialEndsAt,
    ]
  );

  await run(
    db,
    'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [randomUUID(), demoUserId, 'Bem-vindo(a) ao NoSigilo.', null, createdAt]
  );

  await db.persist();
}

export function createApp(options: { db: DbHandle; env: Env }) {
  const { db, env } = options;
  const persist = () => db.persist();
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.use(express.json({ limit: '2mb' }));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRootDir = path.join(__dirname, '..');
  const repoRootDir = path.join(backendRootDir, '..');

  const storageRootDir = path.join(backendRootDir, 'storage');
  const uploadsDir = path.join(storageRootDir, 'public');
  const privateUploadsDir = path.join(storageRootDir, 'private');
  const legacyUploadsDirCandidates = [
    path.join(repoRootDir, 'storage', 'public'),
    path.join(backendRootDir, 'uploads'),
    path.join(repoRootDir, 'uploads'),
    path.join(process.cwd(), 'uploads'),
  ];
  const legacyPrivateUploadsDirCandidates = [
    path.join(repoRootDir, 'storage', 'private'),
    path.join(backendRootDir, 'uploads', 'private'),
    path.join(repoRootDir, 'uploads', 'private'),
    path.join(process.cwd(), 'uploads', 'private'),
  ];
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(privateUploadsDir, { recursive: true });

  app.get('/uploads/:filename', async (req, res) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      res.status(400).end();
      return;
    }
    const media = (await queryOne(db, 'SELECT filename, mime_type, is_private FROM media WHERE filename = ? LIMIT 1', [filename])) as any;
    if (!media || media.is_private) {
      res.status(404).end();
      return;
    }
    const filePath = path.join(uploadsDir, filename);
    if (!existsSync(filePath)) {
      for (const legacyDir of legacyUploadsDirCandidates) {
        const legacyPath = path.join(legacyDir, filename);
        if (!existsSync(legacyPath)) continue;
        sendLocalFile(req, res, { filePath: legacyPath, mimeType: media.mime_type ? String(media.mime_type) : null });
        return;
      }
      res.status(404).end();
      return;
    }
    sendLocalFile(req, res, { filePath, mimeType: media.mime_type ? String(media.mime_type) : null });
  });

  app.get('/private-uploads/:mediaId', async (req, res) => {
    const mediaId = String(req.params.mediaId || '');
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!decoded || String(decoded.mediaId || '') !== mediaId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const media = (await queryOne(db, 'SELECT filename, mime_type, is_private FROM media WHERE id = ? LIMIT 1', [mediaId])) as any;
    if (!media || !media.is_private) {
      res.status(404).end();
      return;
    }
    const filePath = path.join(privateUploadsDir, String(media.filename));
    if (!existsSync(filePath)) {
      for (const legacyDir of legacyPrivateUploadsDirCandidates) {
        const legacyPath = path.join(legacyDir, String(media.filename));
        if (!existsSync(legacyPath)) continue;
        sendLocalFile(req, res, { filePath: legacyPath, mimeType: media.mime_type ? String(media.mime_type) : null });
        return;
      }
      res.status(404).end();
      return;
    }
    sendLocalFile(req, res, { filePath, mimeType: media.mime_type ? String(media.mime_type) : null });
  });

  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      const isPrivate = String(req.query.isPrivate || '') === '1';
      const dir = isPrivate ? privateUploadsDir : uploadsDir;
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = extensionForMime(file.mimetype || '', file.originalname || '');
      cb(null, `${randomUUID()}${ext}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 60 * 1024 * 1024 } });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'nosigilo-backend', time: nowIso() });
  });

  app.post('/api/auth/check-email', async (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const existing = await queryOne(db, 'SELECT id FROM users WHERE email = ?', [email]);
    res.json({ available: !existing });
  });

  app.post('/api/auth/register', async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1),
      birthDate: z.string().optional(),
      gender: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      lookingFor: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const name = parsed.data.name.trim();

    const existingEmail = await queryOne(db, 'SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail) {
      res.status(409).json({ error: 'email_in_use' });
      return;
    }

    const existingName = await queryOne(db, 'SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [name]);
    if (existingName) {
      res.status(409).json({ error: 'name_in_use' });
      return;
    }

    const createdAt = nowIso();
    const trialEndsAt = addDaysIso(createdAt, env.TRIAL_DAYS);
    const id = randomUUID();

    await run(
      db,
      `
      INSERT INTO users (
        id, email, password_hash, name, avatar, bio, status, city, state, birth_date, gender, marital_status,
        sexual_orientation, ethnicity, hair, eyes, height, body_type, smokes, drinks, profession, zodiac_sign,
        looking_for_json, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        email,
        bcrypt.hashSync(parsed.data.password, 10),
        parsed.data.name,
        null,
        null,
        null,
        parsed.data.city ?? null,
        parsed.data.state ?? null,
        parsed.data.birthDate ?? null,
        parsed.data.gender ?? null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        parsed.data.lookingFor ? JSON.stringify(parsed.data.lookingFor) : null,
        0,
        0,
        0,
        createdAt,
        createdAt,
        trialEndsAt,
      ]
    );
    await persist();

    const row = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [id]);
    const presence = req.app.get('presence');
    const user = rowToPublicUser(row, presence?.isOnline(String(row.id)));
    res.json({ token: issueToken(env, { id: user.id, isAdmin: user.isAdmin }), user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const row = (await queryOne(db, 'SELECT * FROM users WHERE email = ?', [email])) as any;
    if (!row) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    const ok = bcrypt.compareSync(parsed.data.password, String(row.password_hash));
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    const presence = req.app.get('presence');
    const user = rowToPublicUser(row, presence?.isOnline(String(row.id)));
    res.json({ token: issueToken(env, { id: user.id, isAdmin: user.isAdmin }), user });
  });

  app.get('/api/auth/me', requireAuth(env, db), async (req, res) => {
    const row = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.auth!.userId]);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id))));
  });

  app.post('/api/auth/refresh', requireAuth(env, db), async (req, res) => {
    const row = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [req.auth!.userId])) as any;
    res.json({ token: issueToken(env, { id: String(row.id), isAdmin: !!row.is_admin }) });
  });

  app.get('/api/auth/google', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });

  app.get('/api/feed', requireAuth(env, db), async (req, res) => {
    const viewerRow = await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId]);
    const viewerHasPremium = hasPremiumAccess(viewerRow);
    const page = Number(req.query.page || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (Math.max(1, page) - 1) * limit;
    const rows = await queryAll(
      db,
      `
      SELECT p.id, p.content, p.created_at, p.media_ids_json,
        u.id as author_id, u.name as author_name, u.avatar as author_avatar
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [limit + 1, offset]
    );

    const slice = rows.slice(0, limit);
    const postIds = slice.map((r: any) => String(r.id));

    const mediaIdSet = new Set<string>();
    const mediaIdsByPostId = new Map<string, string[]>();
    for (const r of slice as any[]) {
      const ids = Array.isArray(safeJsonParse(r.media_ids_json)) ? safeJsonParse(r.media_ids_json) : [];
      const list = ids.filter((x: any) => typeof x === 'string') as string[];
      mediaIdsByPostId.set(String(r.id), list);
      for (const mid of list) mediaIdSet.add(mid);
    }

    const mediaById = new Map<string, { id: string; url: string | null; mimeType: string | null; isLocked?: boolean }>();
    if (mediaIdSet.size > 0) {
      const mediaIds = Array.from(mediaIdSet);
      const placeholders = mediaIds.map(() => '?').join(', ');
      const mediaRows = await queryAll(
        db,
        `SELECT id, filename, mime_type FROM media WHERE is_private = 0 AND id IN (${placeholders})`,
        mediaIds
      );
      for (const mr of mediaRows as any[]) {
        const mimeType = mr.mime_type ? String(mr.mime_type) : null;
        const locked = !viewerHasPremium && !!mimeType && mimeType.startsWith('video/');
        mediaById.set(String(mr.id), {
          id: String(mr.id),
          url: locked ? null : `/uploads/${mr.filename}`,
          mimeType,
          isLocked: locked ? true : undefined,
        });
      }
    }

    const likesCountByPostId = new Map<string, number>();
    const commentsCountByPostId = new Map<string, number>();
    const likedByMeSet = new Set<string>();
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(', ');
      const likeCounts = await queryAll(
        db,
        `SELECT target_id, COUNT(*) as c FROM likes WHERE target_type = 'post' AND target_id IN (${placeholders}) GROUP BY target_id`,
        postIds
      );
      for (const lr of likeCounts as any[]) likesCountByPostId.set(String(lr.target_id), Number(lr.c || 0));

      const commentCounts = await queryAll(
        db,
        `SELECT target_id, COUNT(*) as c FROM comments WHERE target_type = 'post' AND target_id IN (${placeholders}) GROUP BY target_id`,
        postIds
      );
      for (const cr of commentCounts as any[]) commentsCountByPostId.set(String(cr.target_id), Number(cr.c || 0));

      const likedByMeRows = await queryAll(
        db,
        `SELECT target_id FROM likes WHERE target_type = 'post' AND user_id = ? AND target_id IN (${placeholders})`,
        [req.auth!.userId, ...postIds]
      );
      for (const r of likedByMeRows as any[]) likedByMeSet.add(String(r.target_id));
    }

    res.json({
      posts: slice.map((r: any) => ({
        id: r.id,
        content: r.content,
        createdAt: r.created_at,
        author: { id: r.author_id, name: r.author_name, avatar: r.author_avatar },
        mediaIds: mediaIdsByPostId.get(String(r.id)) ?? [],
        media: (mediaIdsByPostId.get(String(r.id)) ?? []).map((mid) => mediaById.get(mid)).filter(Boolean),
        likesCount: likesCountByPostId.get(String(r.id)) ?? 0,
        commentsCount: commentsCountByPostId.get(String(r.id)) ?? 0,
        likedByMe: likedByMeSet.has(String(r.id)),
      })),
      hasMore: rows.length > limit,
    });
  });

  app.post('/api/posts', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ content: z.string().optional(), mediaIds: z.array(z.string()).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const content = String(parsed.data.content || '').trim();
    const mediaIds = Array.isArray(parsed.data.mediaIds) ? parsed.data.mediaIds.filter((v) => typeof v === 'string') : [];
    if (content.length === 0 && mediaIds.length === 0) {
      res.status(400).json({ error: 'empty_post' });
      return;
    }
    const id = randomUUID();
    await run(db, 'INSERT INTO posts (id, user_id, content, media_ids_json, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      content,
      mediaIds.length > 0 ? JSON.stringify(mediaIds) : null,
      nowIso(),
    ]);
    await persist();
    res.json({ id });
  });

  app.delete('/api/posts/:postId', requireAuth(env, db), async (req, res) => {
    const postId = String(req.params.postId || '');
    const post = (await queryOne(db, 'SELECT id, user_id FROM posts WHERE id = ?', [postId])) as any;
    if (!post) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (String(post.user_id) !== req.auth!.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    await run(db, "DELETE FROM likes WHERE target_type = 'post' AND target_id = ?", [postId]);
    await run(db, "DELETE FROM comments WHERE target_type = 'post' AND target_id = ?", [postId]);
    await run(db, 'DELETE FROM posts WHERE id = ? AND user_id = ?', [postId, req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/photos/recent', requireAuth(env, db), async (req, res) => {
    const rows = await queryAll(
      db,
      "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND mime_type LIKE 'image/%' ORDER BY created_at DESC LIMIT 20",
      [req.auth!.userId]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        url: r.is_private ? `/private-uploads/${r.id}?token=${encodeURIComponent(jwt.sign({ mediaId: String(r.id) }, env.JWT_SECRET, { expiresIn: '30m' }))}` : `/uploads/${r.filename}`,
        isPrivate: !!r.is_private,
        isMain: !!r.is_main,
        createdAt: r.created_at,
        mimeType: r.mime_type ? String(r.mime_type) : null,
      }))
    );
  });

  app.get('/api/profile/stats', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    
    const likesCount = await queryOne(db, "SELECT COUNT(*) as c FROM likes WHERE target_type = 'user' AND target_id = ?", [userId]);
    const visitsCount = await queryOne(db, "SELECT COUNT(*) as c FROM profile_visits WHERE visited_user_id = ?", [userId]);
    const matchesCount = await queryOne(
      db, 
      `SELECT COUNT(*) as c FROM likes a
       JOIN likes b ON b.user_id = a.target_id AND b.target_id = a.user_id
       WHERE a.user_id = ? AND a.target_type = 'user' AND b.target_type = 'user'`, 
      [userId]
    );

    res.json({
      likes: Number(likesCount?.c || 0),
      visits: Number(visitsCount?.c || 0),
      matches: Number(matchesCount?.c || 0)
    });
  });

  app.get('/api/profile', requireAuth(env, db), async (req, res) => {
    const row = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.auth!.userId]);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id))));
  });

  app.put('/api/profile', requireAuth(env, db), async (req, res) => {
    const schema = z
      .object({
        name: z.string().min(1).optional(),
        avatar: z.string().url().optional().nullable(),
        bio: z.string().optional().nullable(),
        status: z.string().optional().nullable(),
        city: z.string().optional().nullable(),
        state: z.string().optional().nullable(),
        birthDate: z.string().optional().nullable(),
        gender: z.string().optional().nullable(),
        maritalStatus: z.string().optional().nullable(),
        sexualOrientation: z.string().optional().nullable(),
        ethnicity: z.string().optional().nullable(),
        hair: z.string().optional().nullable(),
        eyes: z.string().optional().nullable(),
        height: z.string().optional().nullable(),
        bodyType: z.string().optional().nullable(),
        smokes: z.string().optional().nullable(),
        drinks: z.string().optional().nullable(),
        profession: z.string().optional().nullable(),
        zodiacSign: z.string().optional().nullable(),
        lookingFor: z.array(z.string()).optional().nullable(),
        allowMessages: z.enum(['everyone', 'matches', 'friends', 'nobody']).optional().nullable(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const data = parsed.data;
    const setParts: string[] = [];
    const values: unknown[] = [];
    const map: Record<string, string> = {
      name: 'name',
      avatar: 'avatar',
      bio: 'bio',
      status: 'status',
      city: 'city',
      state: 'state',
      birthDate: 'birth_date',
      gender: 'gender',
      maritalStatus: 'marital_status',
      sexualOrientation: 'sexual_orientation',
      ethnicity: 'ethnicity',
      hair: 'hair',
      eyes: 'eyes',
      height: 'height',
      bodyType: 'body_type',
      smokes: 'smokes',
      drinks: 'drinks',
      profession: 'profession',
      zodiacSign: 'zodiac_sign',
      allowMessages: 'allow_messages',
    };

    for (const [key, col] of Object.entries(map)) {
      if (key in data) {
        setParts.push(`${col} = ?`);
        values.push((data as any)[key]);
      }
    }
    if ('lookingFor' in data) {
      setParts.push('looking_for_json = ?');
      values.push(data.lookingFor ? JSON.stringify(data.lookingFor) : null);
    }

    if (setParts.length > 0) {
      values.push(req.auth!.userId);
      await run(db, `UPDATE users SET ${setParts.join(', ')} WHERE id = ?`, values);
      await persist();
    }

    const row = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [req.auth!.userId]);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id))));
  });

  app.get('/api/profile/visits', requireAuth(env, db), async (req, res) => {
    const user = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const isPremium = !!user?.is_premium;
    const trialEnds = user?.trial_ends_at ? new Date(user.trial_ends_at).getTime() : 0;
    const hasTrial = trialEnds > Date.now();

    if (!isPremium && !hasTrial) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const rows = await queryAll(
      db,
      `
      SELECT v.id, v.created_at, u.id as visitor_id, u.name as visitor_name, u.avatar as visitor_avatar
      FROM profile_visits v
      JOIN users u ON u.id = v.visitor_user_id
      WHERE v.visited_user_id = ?
      ORDER BY v.created_at DESC
      LIMIT 50
    `,
      [req.auth!.userId]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        visitor: { id: r.visitor_id, name: r.visitor_name, avatar: r.visitor_avatar },
      }))
    );
  });

  app.get('/api/users/:userId', requireAuth(env, db), async (req, res) => {
    const userId = req.params.userId;
    const row = await queryOne(db, 'SELECT * FROM users WHERE id = ?', [userId]);
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id))));
  });

  app.get('/api/users/:userId/private-photos/access', requireAuth(env, db), async (req, res) => {
    const ownerId = String(req.params.userId || '');
    const viewerId = req.auth!.userId;
    if (ownerId === viewerId) {
      res.json({ status: 'owner' });
      return;
    }
    const row = (await queryOne(
      db,
      'SELECT id, status FROM private_photo_access_requests WHERE owner_user_id = ? AND requester_user_id = ? LIMIT 1',
      [ownerId, viewerId]
    )) as any;
    if (!row) {
      res.json({ status: 'none' });
      return;
    }
    res.json({ status: String(row.status), requestId: String(row.id) });
  });

  app.get('/api/users/:userId/testimonials', requireAuth(env, db), async (req, res) => {
    const profileUserId = String(req.params.userId || '');
    const viewerId = req.auth!.userId;
    const status = viewerId === profileUserId ? String(req.query.status || 'all') : 'approved';
    const whereStatus =
      status === 'pending' || status === 'approved' || status === 'rejected'
        ? 'AND t.status = ?'
        : status === 'all'
          ? ''
          : 'AND t.status = ?';
    const params: any[] = [profileUserId];
    if (whereStatus.includes('?')) params.push(status === 'all' ? 'approved' : status);
    const rows = await queryAll(
      db,
      `
      SELECT t.id, t.content, t.status, t.created_at, t.updated_at,
        u.id as author_id, u.name as author_name, u.avatar as author_avatar
      FROM testimonials t
      JOIN users u ON u.id = t.author_user_id
      WHERE t.profile_user_id = ?
      ${whereStatus}
      ORDER BY t.created_at DESC
      LIMIT 50
    `,
      params
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        content: r.content,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        author: { id: r.author_id, name: r.author_name, avatar: r.author_avatar },
      }))
    );
  });

  app.get('/api/users/:userId/photos', requireAuth(env, db), async (req, res) => {
    const ownerId = String(req.params.userId || '');
    const viewerId = req.auth!.userId;
    const visibility = String(req.query.visibility || 'public');
    if (visibility !== 'public' && visibility !== 'private') {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (visibility === 'private') {
      if (ownerId !== viewerId) {
        const access = (await queryOne(
          db,
          'SELECT status FROM private_photo_access_requests WHERE owner_user_id = ? AND requester_user_id = ? LIMIT 1',
          [ownerId, viewerId]
        )) as any;
        if (!access || String(access.status) !== 'approved') {
          res.status(403).json({ error: 'private_photos_access_required', status: access ? String(access.status) : 'none' });
          return;
        }
      }
      const rows = await queryAll(
        db,
        "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND is_private = 1 AND mime_type LIKE 'image/%' ORDER BY created_at DESC LIMIT 50",
        [ownerId]
      );
      res.json(
        rows.map((r: any) => ({
          id: r.id,
          url: `/private-uploads/${r.id}?token=${encodeURIComponent(jwt.sign({ mediaId: String(r.id) }, env.JWT_SECRET, { expiresIn: '30m' }))}`,
          isPrivate: true,
          isMain: !!r.is_main,
          createdAt: r.created_at,
          mimeType: r.mime_type ? String(r.mime_type) : null,
        }))
      );
      return;
    }

    const rows = await queryAll(
      db,
      "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND is_private = 0 AND mime_type LIKE 'image/%' ORDER BY created_at DESC LIMIT 50",
      [ownerId]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        url: `/uploads/${r.filename}`,
        isPrivate: false,
        isMain: !!r.is_main,
        createdAt: r.created_at,
        mimeType: r.mime_type ? String(r.mime_type) : null,
      }))
    );
  });

  app.post('/api/private-photos/requests', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const ownerId = parsed.data.userId;
    const requesterId = req.auth!.userId;
    if (ownerId === requesterId) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }
    const owner = (await queryOne(db, 'SELECT id, name FROM users WHERE id = ?', [ownerId])) as any;
    if (!owner) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const requester = (await queryOne(db, 'SELECT id, name FROM users WHERE id = ?', [requesterId])) as any;
    const existing = (await queryOne(
      db,
      'SELECT id, status FROM private_photo_access_requests WHERE owner_user_id = ? AND requester_user_id = ? LIMIT 1',
      [ownerId, requesterId]
    )) as any;
    const now = nowIso();
    if (existing) {
      const st = String(existing.status);
      if (st === 'approved') {
        res.json({ id: String(existing.id), status: 'approved' });
        return;
      }
      await run(db, 'UPDATE private_photo_access_requests SET status = ?, updated_at = ? WHERE id = ?', ['pending', now, String(existing.id)]);
      await persist();
      await createNotification(
        { db, io },
        {
          userId: ownerId,
          type: 'private_photos.request',
          title: 'Solicitação para ver fotos privadas',
          description: `${requester?.name ? String(requester.name) : 'Alguém'} pediu acesso às suas fotos privadas.`,
          dataJson: { requestId: String(existing.id), requesterId, requesterName: requester?.name ? String(requester.name) : null },
        }
      );
      res.json({ id: String(existing.id), status: 'pending' });
      return;
    }
    const id = randomUUID();
    await run(
      db,
      'INSERT INTO private_photo_access_requests (id, owner_user_id, requester_user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ownerId, requesterId, 'pending', now, now]
    );
    await persist();
    await createNotification(
      { db, io },
      {
        userId: ownerId,
        type: 'private_photos.request',
        title: 'Solicitação para ver fotos privadas',
        description: `${requester?.name ? String(requester.name) : 'Alguém'} pediu acesso às suas fotos privadas.`,
        dataJson: { requestId: id, requesterId, requesterName: requester?.name ? String(requester.name) : null },
      }
    );
    res.json({ id, status: 'pending' });
  });

  app.post('/api/private-photos/requests/:requestId/approve', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const requestId = String(req.params.requestId || '');
    const row = (await queryOne(
      db,
      'SELECT id, owner_user_id, requester_user_id, status FROM private_photo_access_requests WHERE id = ? LIMIT 1',
      [requestId]
    )) as any;
    if (!row || String(row.owner_user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await run(db, 'UPDATE private_photo_access_requests SET status = ?, updated_at = ? WHERE id = ?', ['approved', nowIso(), requestId]);
    await persist();
    const owner = (await queryOne(db, 'SELECT name FROM users WHERE id = ?', [req.auth!.userId])) as any;
    await createNotification(
      { db, io },
      {
        userId: String(row.requester_user_id),
        type: 'private_photos.approved',
        title: 'Acesso às fotos privadas',
        description: `${owner?.name ? String(owner.name) : 'O usuário'} autorizou você a ver as fotos privadas.`,
        dataJson: { ownerId: req.auth!.userId, ownerName: owner?.name ? String(owner.name) : null },
      }
    );
    res.json({ ok: true });
  });

  app.post('/api/private-photos/requests/:requestId/deny', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const requestId = String(req.params.requestId || '');
    const row = (await queryOne(
      db,
      'SELECT id, owner_user_id, requester_user_id, status FROM private_photo_access_requests WHERE id = ? LIMIT 1',
      [requestId]
    )) as any;
    if (!row || String(row.owner_user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await run(db, 'UPDATE private_photo_access_requests SET status = ?, updated_at = ? WHERE id = ?', ['denied', nowIso(), requestId]);
    await persist();
    const owner = (await queryOne(db, 'SELECT name FROM users WHERE id = ?', [req.auth!.userId])) as any;
    await createNotification(
      { db, io },
      {
        userId: String(row.requester_user_id),
        type: 'private_photos.denied',
        title: 'Acesso às fotos privadas',
        description: `${owner?.name ? String(owner.name) : 'O usuário'} não autorizou o acesso às fotos privadas.`,
        dataJson: { ownerId: req.auth!.userId, ownerName: owner?.name ? String(owner.name) : null },
      }
    );
    res.json({ ok: true });
  });

  app.post('/api/media/upload', requireAuth(env, db), upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'missing_file' });
      return;
    }

    const isPrivate = String(req.query.isPrivate || '') === '1';
    const mime = req.file.mimetype || '';
    const size = Number(req.file.size || 0);
    const maxVideoBytes = 50 * 1024 * 1024;
    const maxImageBytes = 10 * 1024 * 1024;
    const maxOtherBytes = 5 * 1024 * 1024;
    if (isPrivate && !mime.startsWith('image/')) {
      res.status(400).json({ error: 'private_photos_images_only' });
      return;
    }
    if (mime.startsWith('video/') && size > maxVideoBytes) {
      res.status(413).json({ error: 'file_too_large', maxBytes: maxVideoBytes });
      return;
    }
    if (mime.startsWith('image/') && size > maxImageBytes) {
      res.status(413).json({ error: 'file_too_large', maxBytes: maxImageBytes });
      return;
    }
    if (!mime.startsWith('video/') && !mime.startsWith('image/') && size > maxOtherBytes) {
      res.status(413).json({ error: 'file_too_large', maxBytes: maxOtherBytes });
      return;
    }

    const id = randomUUID();
    await run(
      db,
      'INSERT INTO media (id, user_id, filename, original_name, mime_type, size, is_private, is_main, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
      [id, req.auth!.userId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, isPrivate ? 1 : 0, nowIso()]
    );
    await persist();
    if (isPrivate) {
      const token = jwt.sign({ mediaId: id }, env.JWT_SECRET, { expiresIn: '30m' });
      res.json({ id, url: `/private-uploads/${id}?token=${encodeURIComponent(token)}` });
      return;
    }
    res.json({ id, url: `/uploads/${req.file.filename}` });
  });

  app.patch('/api/media/:mediaId/main', requireAuth(env, db), async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = (await queryOne(db, 'SELECT id, filename, is_private FROM media WHERE id = ? AND user_id = ?', [mediaId, req.auth!.userId])) as any;
    if (!media) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (media.is_private) {
      res.status(400).json({ error: 'cannot_set_private_as_main' });
      return;
    }
    await run(db, 'UPDATE media SET is_main = 0 WHERE user_id = ?', [req.auth!.userId]);
    await run(db, 'UPDATE media SET is_main = 1 WHERE id = ?', [mediaId]);
    const avatar = media.filename ? `/uploads/${String(media.filename)}` : null;
    await run(db, 'UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.auth!.userId]);
    await persist();
    res.json({ ok: true, avatar });
  });

  app.delete('/api/media/:mediaId', requireAuth(env, db), async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = (await queryOne(db, 'SELECT id, is_main, is_private FROM media WHERE id = ? AND user_id = ?', [mediaId, req.auth!.userId])) as any;
    await run(db, 'DELETE FROM media WHERE id = ? AND user_id = ?', [mediaId, req.auth!.userId]);
    if (media && media.is_main && !media.is_private) {
      await run(db, 'UPDATE users SET avatar = NULL WHERE id = ?', [req.auth!.userId]);
    }
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/onboarding/suggestions', async (req, res) => {
    const rawLookingFor = String(req.query.lookingFor || '');
    const city = req.query.city ? String(req.query.city) : null;
    const state = req.query.state ? String(req.query.state) : null;
    const lookingFor = rawLookingFor
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    let rows: any[] = [];
    if (lookingFor.length > 0) {
      const placeholders = lookingFor.map(() => '?').join(', ');
      const params: any[] = [...lookingFor];
      const orderParts: string[] = [];
      if (state) {
        orderParts.push('CASE WHEN state = ? THEN 0 ELSE 1 END');
        params.push(state);
      }
      if (city) {
        orderParts.push('CASE WHEN city = ? THEN 0 ELSE 1 END');
        params.push(city);
      }
      const orderBy = orderParts.length > 0 ? `${orderParts.join(', ')}, created_at DESC` : 'created_at DESC';
      rows = await queryAll(
        db,
        `SELECT * FROM users WHERE is_admin = 0 AND gender IN (${placeholders}) ORDER BY ${orderBy} LIMIT 12`,
        params
      );
    }

    if (rows.length === 0) {
      rows = await queryAll(db, 'SELECT * FROM users WHERE is_admin = 0 ORDER BY created_at DESC LIMIT 12');
    }

    res.json(rows.map(rowToPublicUser));
  });

  app.get('/api/match/cards', requireAuth(env, db), async (req, res) => {
    const me = (await queryOne(db, 'SELECT lat, lon FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const myLat = me?.lat ? Number(me.lat) : null;
    const myLon = me?.lon ? Number(me.lon) : null;

    const { city, ageRange, genders, radar, search } = req.query;
    const params: any[] = [req.auth!.userId];
    let whereClause = 'u.id != ?';

    if (city) {
      whereClause += ' AND (u.city LIKE ? OR u.state LIKE ?)';
      params.push(`%${city}%`, `%${city}%`);
    }

    if (search) {
      whereClause += ' AND u.name LIKE ?';
      params.push(`%${search}%`);
    }

    if (ageRange && ageRange !== 'all') {
      const [min, max] = String(ageRange).replace('+', '-99').split('-').map(Number);
      if (min) {
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - (max || 99));
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() - min);
        
        whereClause += ' AND u.birth_date BETWEEN ? AND ?';
        params.push(minDate.toISOString().split('T')[0], maxDate.toISOString().split('T')[0]);
      }
    }

    if (genders) {
      const genderList = String(genders).split(',');
      if (genderList.length > 0) {
        whereClause += ` AND u.gender IN (${genderList.map(() => '?').join(',')})`;
        params.push(...genderList);
      }
    }

    // Distance filter (radar)
    if (radar && myLat !== null && myLon !== null) {
      const distanceKm = Number(radar);
      // Rough approximation: 1 degree latitude is ~111km, longitude varies but we use a fixed scale for simplicity in SQLite
      const latDelta = distanceKm / 111;
      const lonDelta = distanceKm / (111 * Math.cos(myLat * Math.PI / 180));
      
      whereClause += ' AND u.lat BETWEEN ? AND ? AND u.lon BETWEEN ? AND ?';
      params.push(myLat - latDelta, myLat + latDelta, myLon - lonDelta, myLon + lonDelta);
    }

    params.push(nowIso());

    const rows = await queryAll(
      db,
      `
      SELECT u.*,
        (
          SELECT m.filename
          FROM media m
          WHERE m.user_id = u.id AND m.is_main = 1 AND m.is_private = 0
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as main_filename,
        (
          SELECT COUNT(*)
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'image/%'
        ) as photos_count,
        (
          SELECT COUNT(*)
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'video/%'
        ) as videos_count
      FROM users u
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN u.is_premium = 1 OR (u.trial_ends_at IS NOT NULL AND u.trial_ends_at > ?) THEN 0 ELSE 1 END,
        ${myLat !== null && myLon !== null 
          ? `ABS(u.lat - ${myLat}) + ABS(u.lon - ${myLon}) ASC,` 
          : ''}
        u.created_at DESC
      LIMIT 100
    `,
      params
    );
    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    res.json(
      rows.map((r: any) => {
        const u = rowToPublicUser(r, presence?.isOnline ? presence.isOnline(String(r.id)) : false);
        const mainUrl = r.main_filename ? `/uploads/${String(r.main_filename)}` : null;
        const photosCount = Number(r.photos_count || 0);
        const videosCount = Number(r.videos_count || 0);
        return {
          ...u,
          mainMediaUrl: mainUrl,
          mediaSummary: { photosCount, videosCount },
        };
      })
    );
  });

  app.post('/api/match/like', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const targetUserId = parsed.data.userId;
    const myId = req.auth!.userId;

    if (targetUserId === myId) {
      res.status(400).json({ error: 'cannot_like_self' });
      return;
    }

    const existing = (await queryOne(db, 'SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [
      myId,
      'user',
      targetUserId,
    ])) as any;

    if (!existing?.id) {
      await run(db, 'INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)', [
        randomUUID(),
        myId,
        'user',
        targetUserId,
        nowIso(),
      ]);
      await persist();

      // Send notification
      const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [myId])) as any;
      const actorName = actor?.name ? String(actor.name) : 'Alguém';

      await createNotification(
        { db, io },
        {
          userId: targetUserId,
          type: 'profile.liked',
          title: 'Alguém curtiu seu perfil',
          description: `${actorName} curtiu seu perfil no Match.`,
          dataJson: { actorId: myId, actorName },
        }
      );
    }

    res.json({ ok: true });
  });

  app.get('/api/match/suggestions', requireAuth(env, db), (_req, res) => {
    res.json([]);
  });

  app.get('/api/conversations/unread-count', requireAuth(env, db), async (req, res) => {
    const totalMessages = await queryOne(
      db,
      `
      SELECT COUNT(*) as c FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user_a_id = ? OR c.user_b_id = ?)
      AND m.sender_id != ?
      AND m.is_read = 0
    `,
      [req.auth!.userId, req.auth!.userId, req.auth!.userId]
    );
    const totalConversations = await queryOne(
      db,
      `
      SELECT COUNT(DISTINCT m.conversation_id) as c FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user_a_id = ? OR c.user_b_id = ?)
      AND m.sender_id != ?
      AND m.is_read = 0
    `,
      [req.auth!.userId, req.auth!.userId, req.auth!.userId]
    );
    res.json({ 
      messagesCount: Number(totalMessages?.c || 0),
      conversationsCount: Number(totalConversations?.c || 0)
    });
  });

  app.get('/api/conversations', requireAuth(env, db), async (req, res) => {
    const rows = await queryAll(
      db,
      `
      SELECT c.id, c.user_a_id, c.user_b_id, c.created_at,
        ua.name as user_a_name, ua.avatar as user_a_avatar,
        ub.name as user_b_name, ub.avatar as user_b_avatar,
        (
          SELECT COUNT(*) FROM messages m 
          WHERE m.conversation_id = c.id 
          AND m.sender_id != ? 
          AND m.is_read = 0
        ) as unread_count
      FROM conversations c
      JOIN users ua ON ua.id = c.user_a_id
      JOIN users ub ON ub.id = c.user_b_id
      WHERE c.user_a_id = ? OR c.user_b_id = ?
      ORDER BY c.created_at DESC
    `,
      [req.auth!.userId, req.auth!.userId, req.auth!.userId]
    );
    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    res.json(
      rows.map((r: any) => {
        const other =
          r.user_a_id === req.auth!.userId
            ? { 
                id: r.user_b_id, 
                name: r.user_b_name, 
                avatar: r.user_b_avatar,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_b_id)) : false
              }
            : { 
                id: r.user_a_id, 
                name: r.user_a_name, 
                avatar: r.user_a_avatar,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_a_id)) : false
              };
        return { 
          id: r.id, 
          user: other, 
          createdAt: r.created_at,
          unreadCount: Number(r.unread_count || 0)
        };
      })
    );
  });

  app.post('/api/conversations', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const canCreate = await canSendMessage({ db }, { fromUserId: req.auth!.userId, toUserId: parsed.data.userId });
    if (!canCreate) {
      res.status(403).json({ error: 'message_not_allowed' });
      return;
    }
    const pair = [req.auth!.userId, parsed.data.userId].sort((a, b) => a.localeCompare(b));
    const existing = (await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
    if (existing?.id) {
      res.json({ id: existing.id });
      return;
    }
    const id = randomUUID();
    await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [id, pair[0], pair[1], nowIso()]);
    await persist();
    res.json({ id });
  });

  app.delete('/api/conversations/:conversationId', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    
    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    await run(db, 'DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    await run(db, 'DELETE FROM conversations WHERE id = ?', [conversationId]);
    await persist();

    res.json({ ok: true });
  });

  app.post('/api/conversations/:conversationId/read', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    
    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    await run(db, 'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [conversationId, req.auth!.userId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(conversationId).emit('message.read', { conversationId, readerId: req.auth!.userId });

    res.json({ ok: true });
  });

  app.get('/api/conversations/:conversationId/messages', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const viewer = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const canViewReceived = hasPremiumAccess(viewer);

    // Mark messages as read
    await run(db, 'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [conversationId, req.auth!.userId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(conversationId).emit('message.read', { conversationId, readerId: req.auth!.userId });

    const rows = await queryAll(
      db,
      `
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.media_id, m.is_view_once, m.is_viewed, m.is_delivered, m.created_at, m.is_read,
             med.filename as media_filename, med.mime_type as media_mime_type
      FROM messages m
      LEFT JOIN media med ON med.id = m.media_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
      LIMIT 200
    `,
      [conversationId]
    );
    res.json(
      rows.map((m: any) => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        content: canViewReceived || m.sender_id === req.auth!.userId ? m.content : null,
        mediaId: m.is_view_once && m.is_viewed ? null : m.media_id,
        mediaUrl: m.is_view_once && m.is_viewed ? null : (m.media_filename ? `/uploads/${m.media_filename}` : null),
        mediaMimeType: m.is_view_once && m.is_viewed ? null : m.media_mime_type,
        isViewOnce: !!m.is_view_once,
        isViewed: !!m.is_viewed,
        isDelivered: !!m.is_delivered,
        isLocked: !canViewReceived && m.sender_id !== req.auth!.userId,
        createdAt: m.created_at,
        isRead: !!m.is_read
      }))
    );
  });

  app.post('/api/messages/:messageId/view', requireAuth(env, db), async (req, res) => {
    const messageId = req.params.messageId;
    const msg = (await queryOne(db, 'SELECT id, conversation_id, sender_id, is_view_once, is_viewed FROM messages WHERE id = ?', [messageId])) as any;
    
    if (!msg) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (!msg.is_view_once) {
      res.status(400).json({ error: 'not_view_once' });
      return;
    }

    if (msg.is_viewed) {
      res.json({ ok: true });
      return;
    }

    await run(db, 'UPDATE messages SET is_viewed = TRUE WHERE id = ?', [messageId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(msg.conversation_id).emit('message.viewed', { messageId, conversationId: msg.conversation_id });

    res.json({ ok: true });
  });

  app.post('/api/conversations/:conversationId/messages', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ 
      content: z.string().optional(),
      mediaId: z.string().optional(),
      clientId: z.string().optional(),
      isViewOnce: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const otherId = conv.user_a_id === req.auth!.userId ? String(conv.user_b_id) : String(conv.user_a_id);
    const canMessage = await canSendMessage({ db }, { fromUserId: req.auth!.userId, toUserId: otherId });
    if (!canMessage) {
      res.status(403).json({ error: 'message_not_allowed' });
      return;
    }

    const content = parsed.data.content || null;
    const mediaId = parsed.data.mediaId || null;
    const isViewOnce = parsed.data.isViewOnce ? 1 : 0;

    if (!content && !mediaId) {
      res.status(400).json({ error: 'empty_message' });
      return;
    }

    const id = randomUUID();
    const createdAt = nowIso();
    await run(db, 'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      conversationId,
      req.auth!.userId,
      content,
      mediaId,
      isViewOnce,
      1, // is_delivered
      createdAt,
    ]);
    await persist();
    let mediaUrl = null;
    let mediaMimeType = null;
    if (mediaId) {
      const med = await queryOne(db, 'SELECT filename, mime_type FROM media WHERE id = ?', [mediaId]) as any;
      if (med?.filename) {
        mediaUrl = `/uploads/${med.filename}`;
        mediaMimeType = med.mime_type;
      }
    }

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(conversationId).emit('message.created', { 
      id, 
      conversationId, 
      senderId: req.auth!.userId, 
      content, 
      mediaId,
      mediaUrl,
      mediaMimeType,
      clientId: parsed.data.clientId || null,
      isViewOnce: !!isViewOnce,
      isDelivered: true,
      createdAt 
    });
    res.json({ id });
  });

  app.post('/api/likes', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ targetType: z.string().min(1), targetId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const existing = (await queryOne(db, 'SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
    ])) as any;
    if (existing?.id) {
      res.json({ id: String(existing.id) });
      return;
    }

    const id = randomUUID();
    await run(db, 'INSERT INTO likes (id, user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
      nowIso(),
    ]);
    await persist();
    if (parsed.data.targetType === 'post') {
      const post = (await queryOne(db, 'SELECT id, user_id FROM posts WHERE id = ? LIMIT 1', [parsed.data.targetId])) as any;
      const ownerId = post?.user_id ? String(post.user_id) : null;
      if (ownerId && ownerId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        await createNotification(
          { db, io },
          {
            userId: ownerId,
            type: 'post.liked',
            title: 'Curtiram sua publicação',
            description: `${actorName} curtiu sua publicação.`,
            dataJson: { postId: parsed.data.targetId, actorId: req.auth!.userId, actorName },
          }
        );
      }
    }
    res.json({ id });
  });

  app.delete('/api/likes', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ targetType: z.string().min(1), targetId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    await run(db, 'DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
    ]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/likes', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      targetType: z.string().min(1),
      targetId: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const limit = parsed.data.limit ?? 50;
    const rows = await queryAll(
      db,
      `
      SELECT l.id, l.created_at,
        u.id as user_id, u.name as user_name, u.avatar as user_avatar
      FROM likes l
      JOIN users u ON u.id = l.user_id
      WHERE l.target_type = ? AND l.target_id = ?
      ORDER BY l.created_at DESC
      LIMIT ?
    `,
      [parsed.data.targetType, parsed.data.targetId, limit]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        user: { id: r.user_id, name: r.user_name, avatar: r.user_avatar },
      }))
    );
  });

  app.post('/api/comments', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ targetType: z.string().min(1), targetId: z.string().min(1), content: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const id = randomUUID();
    const createdAt = nowIso();
    await run(db, 'INSERT INTO comments (id, user_id, target_type, target_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.content,
      createdAt,
    ]);
    await persist();
    if (parsed.data.targetType === 'post') {
      const post = (await queryOne(db, 'SELECT id, user_id FROM posts WHERE id = ? LIMIT 1', [parsed.data.targetId])) as any;
      const ownerId = post?.user_id ? String(post.user_id) : null;
      if (ownerId && ownerId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        const preview = String(parsed.data.content).slice(0, 140);
        await createNotification(
          { db, io },
          {
            userId: ownerId,
            type: 'post.commented',
            title: 'Novo comentário',
            description: `${actorName} comentou: ${preview}`,
            dataJson: { postId: parsed.data.targetId, commentId: id, actorId: req.auth!.userId, actorName, content: parsed.data.content, createdAt },
          }
        );
      }
    }
    res.json({ id });
  });

  app.get('/api/comments', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      targetType: z.string().min(1),
      targetId: z.string().min(1),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const limit = parsed.data.limit ?? 50;
    const rows = await queryAll(
      db,
      `
      SELECT c.id, c.content, c.created_at,
        u.id as user_id, u.name as user_name, u.avatar as user_avatar
      FROM comments c
      JOIN users u ON u.id = c.user_id
      WHERE c.target_type = ? AND c.target_id = ?
      ORDER BY c.created_at ASC
      LIMIT ?
    `,
      [parsed.data.targetType, parsed.data.targetId, limit]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        content: r.content,
        createdAt: r.created_at,
        user: { id: r.user_id, name: r.user_name, avatar: r.user_avatar },
      }))
    );
  });

  app.post('/api/testimonials', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ profileUserId: z.string().min(1), content: z.string().min(10).max(1000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    if (parsed.data.profileUserId === req.auth!.userId) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }
    const profileExists = await queryOne(db, 'SELECT id FROM users WHERE id = ? LIMIT 1', [parsed.data.profileUserId]);
    if (!profileExists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const id = randomUUID();
    const now = nowIso();
    await run(
      db,
      'INSERT INTO testimonials (id, profile_user_id, author_user_id, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, parsed.data.profileUserId, req.auth!.userId, parsed.data.content, 'pending', now, now]
    );
    await persist();
    const author = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const authorName = author?.name ? String(author.name) : 'Alguém';
    await createNotification(
      { db, io },
      {
        userId: parsed.data.profileUserId,
        type: 'testimonial.pending',
        title: 'Novo depoimento pendente',
        description: `${authorName} enviou um depoimento para o seu perfil.`,
        dataJson: { testimonialId: id, authorId: req.auth!.userId, authorName },
      }
    );
    res.json({ id, status: 'pending' });
  });

  app.post('/api/testimonials/:testimonialId/respond', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ accept: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const testimonialId = String(req.params.testimonialId || '');
    const t = (await queryOne(
      db,
      'SELECT id, profile_user_id, author_user_id, status FROM testimonials WHERE id = ? LIMIT 1',
      [testimonialId]
    )) as any;
    if (!t || String(t.profile_user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const nextStatus = parsed.data.accept ? 'approved' : 'rejected';
    await run(db, 'UPDATE testimonials SET status = ?, updated_at = ? WHERE id = ?', [nextStatus, nowIso(), testimonialId]);
    await persist();
    const owner = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const ownerName = owner?.name ? String(owner.name) : 'O usuário';
    await createNotification(
      { db, io },
      {
        userId: String(t.author_user_id),
        type: parsed.data.accept ? 'testimonial.approved' : 'testimonial.rejected',
        title: parsed.data.accept ? 'Depoimento aprovado' : 'Depoimento recusado',
        description: parsed.data.accept ? `${ownerName} aprovou seu depoimento.` : `${ownerName} recusou seu depoimento.`,
        dataJson: { testimonialId, profileUserId: req.auth!.userId, profileUserName: ownerName },
      }
    );
    res.json({ ok: true });
  });

  app.get('/api/friends', requireAuth(env, db), async (req, res) => {
    const incoming = await queryAll(
      db,
      `
      SELECT fr.id, fr.created_at, fr.status,
        u.id as from_id, u.name as from_name, u.avatar as from_avatar
      FROM friend_requests fr
      JOIN users u ON u.id = fr.from_user_id
      WHERE fr.to_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
      LIMIT 50
    `,
      [req.auth!.userId]
    );

    const outgoing = await queryAll(
      db,
      `
      SELECT fr.id, fr.created_at, fr.status,
        u.id as to_id, u.name as to_name, u.avatar as to_avatar
      FROM friend_requests fr
      JOIN users u ON u.id = fr.to_user_id
      WHERE fr.from_user_id = ? AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
      LIMIT 50
    `,
      [req.auth!.userId]
    );

    const friends = await queryAll(
      db,
      `
      SELECT fr.id, fr.created_at,
        CASE WHEN fr.from_user_id = ? THEN fr.to_user_id ELSE fr.from_user_id END as friend_id,
        u.name as friend_name, u.avatar as friend_avatar
      FROM friend_requests fr
      JOIN users u ON u.id = (CASE WHEN fr.from_user_id = ? THEN fr.to_user_id ELSE fr.from_user_id END)
      WHERE (fr.from_user_id = ? OR fr.to_user_id = ?) AND fr.status = 'accepted'
      ORDER BY fr.created_at DESC
      LIMIT 200
    `,
      [req.auth!.userId, req.auth!.userId, req.auth!.userId, req.auth!.userId]
    );

    res.json({
      incoming: incoming.map((r: any) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        fromUser: { id: r.from_id, name: r.from_name, avatar: r.from_avatar },
      })),
      outgoing: outgoing.map((r: any) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        toUser: { id: r.to_id, name: r.to_name, avatar: r.to_avatar },
      })),
      friends: friends.map((r: any) => ({
        id: r.friend_id,
        name: r.friend_name,
        avatar: r.friend_avatar,
        createdAt: r.created_at,
      })),
    });
  });

  app.post('/api/friends', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const id = randomUUID();
    await run(db, 'INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.userId,
      'pending',
      nowIso(),
    ]);
    await persist();
    res.json({ id });
  });

  app.post('/api/friends/:requestId/respond', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ accept: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const requestId = req.params.requestId;
    const fr = (await queryOne(db, 'SELECT id, to_user_id FROM friend_requests WHERE id = ?', [requestId])) as any;
    if (!fr || String(fr.to_user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await run(db, 'UPDATE friend_requests SET status = ? WHERE id = ?', [parsed.data.accept ? 'accepted' : 'declined', requestId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/notifications', requireAuth(env, db), async (req, res) => {
    const me = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const isPremium = hasPremiumAccess(me);

    const rows = await queryAll(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.auth!.userId]);
    res.json(
      rows.map((n: any) => {
        const type = String(n.type);
        const data = safeJsonParse(n.data_json);
        let title = n.title;
        let description = n.description;

        // Censor for non-premium
        if (!isPremium && (type === 'profile.liked' || type === 'post.liked' || type === 'comment.liked')) {
          if (data && data.actorName) {
            data.actorName = 'Alguém';
          }
          if (data && data.actorId) {
            delete data.actorId;
          }
          if (description) {
            description = description.replace(/.* curtiu/, 'Alguém curtiu');
          }
        }

        return {
          id: n.id,
          type: n.type,
          title,
          description,
          data,
          isRead: !!n.is_read,
          createdAt: n.created_at,
        };
      })
    );
  });

  app.patch('/api/notifications/:notificationId/read', requireAuth(env, db), async (req, res) => {
    await run(db, 'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.notificationId, req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth(env, db), async (req, res) => {
    await run(db, 'UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/cities', async (req, res) => {
    const q = String(req.query.q || '');
    const limit = Number(req.query.limit || 20);
    res.json(await searchCities(db, q, limit));
  });

  app.get('/api/cities/nearest', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const nearest = await nearestCity(db, lat, lon);
    if (!nearest) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(nearest);
  });

  app.put('/api/location', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ lat: z.number(), lng: z.number() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    await run(db, 'UPDATE users SET lat = ?, lon = ? WHERE id = ?', [parsed.data.lat, parsed.data.lng, req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  app.post('/api/users/:targetUserId/visit', requireAuth(env, db), async (req, res) => {
    await run(db, 'INSERT INTO profile_visits (id, visitor_user_id, visited_user_id, created_at) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      req.auth!.userId,
      req.params.targetUserId,
      nowIso(),
    ]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/subscriptions/plans', requireAuth(env, db), (_req, res) => {
    res.json([
      { id: 'basic', name: 'Básico', price: 0, interval: 'month', perks: [] },
      {
        id: 'premium_monthly',
        name: 'Premium Mensal',
        price: 29.9,
        interval: 'mês',
        perks: ['Radar Premium', 'Assistir e postar vídeos', 'Criar eventos', 'Mensagens e recursos premium'],
      },
      {
        id: 'premium_semiannual',
        name: 'Premium Semestral',
        price: 24.9,
        interval: 'mês',
        perks: ['Radar Premium', 'Assistir e postar vídeos', 'Criar eventos', 'Mensagens e recursos premium'],
      },
      {
        id: 'premium_annual',
        name: 'Premium Anual',
        price: 12.99,
        interval: 'mês',
        perks: ['Radar Premium', 'Assistir e postar vídeos', 'Criar eventos', 'Mensagens e recursos premium'],
      },
    ]);
  });

  app.get('/api/subscriptions/discount', requireAuth(env, db), (_req, res) => {
    res.json({ percent: 0 });
  });

  app.post('/api/subscriptions/checkout', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ planId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const planId = parsed.data.planId;
    const isPremium = planId !== 'basic' ? 1 : 0;
    await run(db, 'UPDATE users SET is_premium = ? WHERE id = ?', [isPremium, req.auth!.userId]);
    await persist();
    res.json({ ok: true, planId });
  });

  app.post('/api/events', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const userRow = (await queryOne(db, 'SELECT name, is_premium, trial_ends_at, lat, lon FROM users WHERE id = ?', [req.auth!.userId])) as any;
    if (!hasPremiumAccess(userRow)) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }
    const id = randomUUID();
    const createdAt = nowIso();
    const payload = req.body ?? {};
    await run(db, 'INSERT INTO events (id, user_id, payload_json, created_at) VALUES (?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      JSON.stringify(payload),
      createdAt,
    ]);
    await persist();

    // Notify compatible users
    let notificationsSent = 0;
    const ns = payload.notificationSettings;
    if (ns?.enabled) {
      const myLat = userRow.lat ? Number(userRow.lat) : null;
      const myLon = userRow.lon ? Number(userRow.lon) : null;

      const params: any[] = [req.auth!.userId];
      let where = 'id != ? AND (is_banned = 0 OR is_banned IS NULL)';

      if (ns.onlyVerified) where += ' AND is_verified = 1';
      if (ns.onlyPremium) where += ' AND is_premium = 1';

      if (ns.targetGender && !ns.targetGender.includes('all')) {
        const genderMap: Record<string, string> = {
          female: 'Mulher',
          male: 'Homem',
          couple: 'Casal%',
        };
        const genderFilters = ns.targetGender.map((g: string) => genderMap[g]).filter(Boolean);
        if (genderFilters.length > 0) {
          where += ` AND (${genderFilters.map((f: string) => (f.includes('%') ? 'gender LIKE ?' : 'gender = ?')).join(' OR ')})`;
          params.push(...genderFilters);
        }
      }

      if (ns.ageRange) {
        const [minAge, maxAge] = ns.ageRange;
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - maxAge - 1);
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() - minAge);
        where += ' AND birth_date BETWEEN ? AND ?';
        params.push(minDate.toISOString().split('T')[0], maxDate.toISOString().split('T')[0]);
      }

      if (ns.targetCities && ns.targetCities.length > 0) {
        where += ` AND (${ns.targetCities.map(() => 'city LIKE ?').join(' OR ')})`;
        params.push(...ns.targetCities.map((c: string) => `%${c.split(',')[0].trim()}%`));
      }

      const potentialUsers = (await queryAll(db, `SELECT id, lat, lon FROM users WHERE ${where} LIMIT 500`, params)) as any[];
      
      for (const targetUser of potentialUsers) {
        // Distance check if radius is set
        if (ns.radius && myLat !== null && myLon !== null && targetUser.lat && targetUser.lon) {
          const dist = Math.sqrt(Math.pow(Number(targetUser.lat) - myLat, 2) + Math.pow(Number(targetUser.lon) - myLon, 2)) * 111;
          if (dist > ns.radius) continue;
        }

        notificationsSent++;
        
        // 1. Create System Notification (Sino)
        await createNotification({ db, io }, {
          userId: targetUser.id,
          type: 'event_invitation',
          title: `Novo evento: ${payload.title}`,
          description: `${userRow.name} convidou você para um evento em ${payload.location}.`,
          dataJson: { eventId: id }
        });

        // 2. Create Chat Message (Mensagem)
        // Check if conversation exists or create one
        let conv = (await queryOne(db, 
          'SELECT id FROM conversations WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)', 
          [req.auth!.userId, targetUser.id, targetUser.id, req.auth!.userId]
        )) as any;

        if (!conv) {
          const convId = randomUUID();
          await run(db, 'INSERT INTO conversations (id, user1_id, user2_id, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)', [
            convId, req.auth!.userId, targetUser.id, nowIso(), nowIso()
          ]);
          conv = { id: convId };
        }

        const msgId = randomUUID();
        const msgContent = ns.customMessage 
          ? `${ns.customMessage}\n\nConfira o evento: ${payload.title} em ${payload.location}`
          : `Olá! Criei um novo evento: ${payload.title} em ${payload.location}. Gostaria de participar?`;
        
        await run(db, 'INSERT INTO messages (id, conversation_id, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?)', [
          msgId, conv.id, req.auth!.userId, msgContent, nowIso()
        ]);
        
        await run(db, 'UPDATE conversations SET last_message_at = ? WHERE id = ?', [nowIso(), conv.id]);
        
        io?.to(`user:${targetUser.id}`).emit('message.new', {
          id: msgId,
          conversationId: conv.id,
          senderId: req.auth!.userId,
          content: msgContent,
          createdAt: nowIso()
        });
      }
      await persist();
    }

    res.json({ id, event: { id, ...payload, createdAt, createdBy: userRow.name ?? null }, notificationsSent });
  });

  app.get('/api/events', requireAuth(env, db), async (req, res) => {
    const myEvents = String(req.query.myEvents || '') === 'true';
    const rows = await queryAll(
      db,
      `
      SELECT e.id, e.payload_json, e.created_at, u.name as user_name
      FROM events e
      JOIN users u ON u.id = e.user_id
      WHERE (? = 0 OR e.user_id = ?)
      ORDER BY e.created_at DESC
      LIMIT 200
    `,
      [myEvents ? 1 : 0, req.auth!.userId]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        ...(safeJsonParse(r.payload_json) ?? {}),
        createdAt: r.created_at,
        createdBy: r.user_name,
      }))
    );
  });

  app.get('/api/admin/photos', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const rows = await queryAll(
      db,
      `
      SELECT m.id, m.filename, m.created_at, u.id as user_id, u.name as user_name
      FROM media m
      JOIN users u ON u.id = m.user_id
      ORDER BY m.created_at DESC
      LIMIT 50
    `
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        url: `/uploads/${r.filename}`,
        userId: r.user_id,
        userName: r.user_name,
        uploadedAt: r.created_at,
        status: 'pending',
      }))
    );
  });

  app.put('/api/admin/photos/:photoId/approve', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json({ ok: true });
  });

  app.put('/api/admin/photos/:photoId/reject', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/admin/users', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const rows = await queryAll(db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT 200');
    res.json(rows.map(rowToPublicUser));
  });

  app.put('/api/admin/users/:userId/ban', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json({ ok: true });
  });

  app.put('/api/admin/users/:userId/unban', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/admin/logs', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json([]);
  });

  app.get('/api/admin/finance/summary', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json({ revenue: 0, subscribers: 0, newToday: 0, churnRate: 0 });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.use(((err, _req, res, _next) => {
    if (err && typeof err === 'object' && (err as any).code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'file_too_large' });
      return;
    }
    if (err instanceof Error) {
      const msg = String(err.message || '');
      if (msg.includes('Unexpected end of form') || msg.includes('Multipart') || msg.includes('multipart')) {
        res.status(400).json({ error: 'invalid_multipart' });
        return;
      }
      console.error(err);
    }
    res.status(500).json({ error: 'server_error' });
  }) as express.ErrorRequestHandler);

  return app;
}
