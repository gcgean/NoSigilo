import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, existsSync, createReadStream, statSync, renameSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';
import { nearestCity, searchCities } from './seedCities.js';
import { sendPasswordResetCodeEmail } from './email.js';
import {
  createHubCheckout,
  createHubOrder,
  getHubAccessStatus,
  isHubBillingEnabled,
  listHubPlans,
  resolveHubAccess,
  upsertHubCustomer,
  type HubResolveAccessResult,
} from './hubBilling.js';

type Env = {
  FRONTEND_ORIGIN: string;
  JWT_SECRET: string;
  TRIAL_DAYS: number;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  APP_NAME?: string;
  HUB_BILLING_BASE_URL?: string;
  HUB_BILLING_API_KEY?: string;
  HUB_BILLING_ADMIN_EMAIL?: string;
  HUB_BILLING_ADMIN_PASSWORD?: string;
  HUB_BILLING_PRODUCT_ID?: string;
  HUB_BILLING_WEBHOOK_SECRET?: string;
};

export type PublicUser = {
  id: string;
  email?: string; // only included in own-profile responses
  name: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  birthDate?: string | null;
  partnerBirthDate?: string | null;
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
  invitationStatus?: string | null;
  invitedBy?: { id: string; name: string; avatar?: string | null } | null;
  hubCustomerId?: string | null;
  hubAccessStatus?: string | null;
  hubAccessReason?: string | null;
  hubLicenseEndAt?: string | null;
  hubBanner?: string | null;
  notificationVisits?: boolean;
  billingDocument?: string | null;
  billingLegalName?: string | null;
  billingPersonType?: 'PF' | 'PJ' | null;
  billingPhone?: string | null;
  billingAddressZip?: string | null;
  billingAddressStreet?: string | null;
  billingAddressNumber?: string | null;
  billingAddressDistrict?: string | null;
  billingAddressComplement?: string | null;
  billingAddressCity?: string | null;
  billingAddressState?: string | null;
  subscriptionsEnabled?: boolean;
};

type InviteRow = {
  id: string;
  inviter_user_id: string;
  invite_token: string;
  status: string;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  used_at?: string | null;
  revoked_at?: string | null;
  inviter_name?: string | null;
  inviter_avatar?: string | null;
  entries?: InviteEntryRow[];
};

type InviteEntryRow = {
  id: string;
  invite_link_id: string;
  invitee_user_id: string;
  invitee_email?: string | null;
  created_at: string;
  invitee_name?: string | null;
  invitee_avatar?: string | null;
};

// Admin emails: can be overridden via ADMIN_EMAILS env var (comma-separated)
function getAdminEmails(): Set<string> {
  const envList = process.env.ADMIN_EMAILS;
  if (envList) {
    return new Set(envList.split(',').map(e => e.trim().toLowerCase()).filter(Boolean));
  }
  // Fallback defaults (override with ADMIN_EMAILS env var in production)
  return new Set(['admin@nosigilo.com']);
}
const ADMIN_EMAILS = getAdminEmails();

function nowIso() {
  return new Date().toISOString();
}

const PROFILE_VISIT_NOTIFICATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function addMinutesIso(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseAudiencePreferences(value: string | null | undefined) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function buildAudiencePriorityOrder(column: string, preferences: string[]) {
  const orderParts: string[] = [];
  const params: any[] = [];
  let rank = 0;
  const prefs = Array.from(new Set(preferences));

  const hasCouplePreference = prefs.some((pref) => pref.startsWith('Casal'));
  if (hasCouplePreference) {
    orderParts.push(`CASE WHEN ${column} LIKE ? THEN ${rank++} ELSE ${rank} END`);
    params.push('Casal%');
  }
  if (prefs.includes('Mulher')) {
    orderParts.push(`CASE WHEN ${column} = ? THEN ${rank++} ELSE ${rank} END`);
    params.push('Mulher');
  }
  if (prefs.includes('Homem')) {
    orderParts.push(`CASE WHEN ${column} = ? THEN ${rank++} ELSE ${rank} END`);
    params.push('Homem');
  }

  for (const pref of prefs) {
    if (pref === 'Mulher' || pref === 'Homem' || pref.startsWith('Casal')) continue;
    orderParts.push(`CASE WHEN ${column} = ? THEN ${rank++} ELSE ${rank} END`);
    params.push(pref);
  }

  return { orderParts, params };
}

function baseAudienceRankingSql(column: string) {
  return `CASE
    WHEN ${column} LIKE 'Casal%' THEN 0
    WHEN ${column} = 'Mulher' THEN 1
    WHEN ${column} = 'Homem' THEN 2
    ELSE 3
  END`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function limitText(value: string | null | undefined, max = 255) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function getHeaderValue(req: express.Request, headerName: string) {
  const raw = req.headers[headerName.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] || null;
  return raw ? String(raw) : null;
}

function getRequestIp(req: express.Request) {
  const cfIp = limitText(getHeaderValue(req, 'cf-connecting-ip'), 120);
  if (cfIp) return cfIp;

  const forwardedFor = limitText(getHeaderValue(req, 'x-forwarded-for'), 255);
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp.slice(0, 120);
  }

  return limitText(req.ip, 120);
}

function hashRequestIp(env: Env, ip: string | null) {
  if (!ip) return null;
  return createHmac('sha256', env.JWT_SECRET)
    .update(ip)
    .digest('hex')
    .slice(0, 24);
}

function getReferrerDomain(referrer: string | null) {
  if (!referrer) return null;
  try {
    return limitText(new URL(referrer).hostname.replace(/^www\./, ''), 120);
  } catch {
    return null;
  }
}

function inferOriginType(referrerDomain: string | null, utmSource: string | null) {
  const source = String(utmSource || referrerDomain || '').toLowerCase();
  if (!source) return 'direct';
  if (source.includes('nosigilo.baselider.com.br')) return 'internal';
  if (/(google|bing|yahoo|duckduckgo|search)/.test(source)) return 'search';
  if (/(instagram|facebook|fb|tiktok|x\.com|twitter|telegram|whatsapp|youtube|linkedin|kwai)/.test(source)) return 'social';
  if (/(email|mail|newsletter)/.test(source)) return 'email';
  return 'referral';
}

function getDeviceType(userAgent: string | null, screenWidth?: number | null) {
  const ua = String(userAgent || '').toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  if (typeof screenWidth === 'number' && Number.isFinite(screenWidth)) {
    if (screenWidth < 768) return 'mobile';
    if (screenWidth < 1024) return 'tablet';
  }
  return 'desktop';
}

function decodeOptionalUserId(env: Env, req: express.Request) {
  const authHeader = getHeaderValue(req, 'authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    return typeof payload?.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function isAdministrativeEmail(email?: string | null) {
  return ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

async function getSystemSetting(db: DbHandle, key: string) {
  const row = (await queryOne(db, 'SELECT value FROM system_settings WHERE key = ? LIMIT 1', [key])) as any;
  return row?.value ?? null;
}

async function setSystemSetting(db: DbHandle, key: string, value: string) {
  const timestamp = nowIso();
  await run(
    db,
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, timestamp]
  );
}

async function getSubscriptionsEnabled(db: DbHandle) {
  const raw = await getSystemSetting(db, 'subscriptions_enabled');
  return raw === null ? true : raw !== '0';
}

function hasPremiumAccess(userRow: any, subscriptionsEnabled: boolean = true) {
  if (!subscriptionsEnabled) return true;
  if (!userRow) return false;
  if (userRow.is_premium) return true;
  const ends = userRow.trial_ends_at ? new Date(String(userRow.trial_ends_at)) : null;
  if (ends && !Number.isNaN(ends.getTime()) && ends.getTime() > Date.now()) return true;
  return false;
}

async function userHasPremiumAccess(db: DbHandle, userId: string) {
  const subscriptionsEnabled = await getSubscriptionsEnabled(db);
  if (!subscriptionsEnabled) return true;
  const row = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  return hasPremiumAccess(row, subscriptionsEnabled);
}

export async function ensureAdministrativeAccess(db: DbHandle) {
  if (ADMIN_EMAILS.size === 0) return;
  const emails = Array.from(ADMIN_EMAILS);
  const placeholders = emails.map(() => '?').join(', ');
  await run(
    db,
    `UPDATE users SET is_admin = 1 WHERE LOWER(email) IN (${placeholders})`,
    emails.map((email) => email.toLowerCase())
  );
  await db.persist();
}

function getHubConfig(env: Env) {
  return {
    baseUrl: String(env.HUB_BILLING_BASE_URL || ''),
    apiKey: String(env.HUB_BILLING_API_KEY || ''),
    adminEmail: String(env.HUB_BILLING_ADMIN_EMAIL || ''),
    adminPassword: String(env.HUB_BILLING_ADMIN_PASSWORD || ''),
    productId: String(env.HUB_BILLING_PRODUCT_ID || ''),
  };
}

function shouldUseHubBilling(env: Env) {
  return isHubBillingEnabled(getHubConfig(env));
}

async function syncHubAccessForUser(
  db: DbHandle,
  userId: string,
  result: HubResolveAccessResult & { customerId: string; productId: string }
) {
  await run(
    db,
    `UPDATE users
     SET hub_customer_id = ?,
         hub_product_id = ?,
         hub_license_id = ?,
         hub_access_status = ?,
         hub_access_reason = ?,
         hub_license_end_at = ?,
         hub_banner = ?,
         trial_started_at = ?,
         trial_ends_at = ?,
         is_premium = ?
     WHERE id = ?`,
    [
      result.customerId,
      result.productId,
      result.licenseId ?? null,
      result.accessStatus,
      result.reason ?? null,
      result.licenseEndAt ?? null,
      result.banner ?? null,
      result.trialStartedAt ?? null,
      result.trialEndAt ?? null,
      result.accessStatus === 'licensed' ? 1 : 0,
      userId,
    ]
  );
}

function fallbackSubscriptionPlans() {
  return [
    { id: 'basic', code: 'basic', name: 'Básico', description: 'Plano básico', amount: 0, currency: 'BRL', intervalUnit: 'month', intervalCount: 1, status: 'active', isActive: true },
    { id: 'premium_monthly', code: 'premium_monthly', name: 'Premium Mensal', description: 'Radar Premium, vídeos, eventos e recursos exclusivos', amount: 2990, currency: 'BRL', intervalUnit: 'month', intervalCount: 1, status: 'active', isActive: true },
    { id: 'premium_semiannual', code: 'premium_semiannual', name: 'Premium Semestral', description: 'Radar Premium, vídeos, eventos e recursos exclusivos', amount: 2490, currency: 'BRL', intervalUnit: 'month', intervalCount: 6, status: 'active', isActive: true },
    { id: 'premium_annual', code: 'premium_annual', name: 'Premium Anual', description: 'Radar Premium, vídeos, eventos e recursos exclusivos', amount: 1299, currency: 'BRL', intervalUnit: 'month', intervalCount: 12, status: 'active', isActive: true },
  ];
}

function formatPlanInterval(intervalUnit: string, intervalCount: number) {
  if (intervalUnit === 'month') {
    if (intervalCount === 12) return 'ano';
    if (intervalCount === 6) return '6 meses';
    return 'mês';
  }
  if (intervalUnit === 'year') return 'ano';
  if (intervalUnit === 'week') return 'semana';
  if (intervalUnit === 'day') return 'dia';
  return intervalUnit;
}

function isValidHubSignature(rawBody: Buffer, signature: string, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = signature.replace(/^sha256=/, '');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const receivedBuf = Buffer.from(received, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function normalizeRadarText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function mapUserGenderToRadarAudience(gender: string | null | undefined) {
  const value = String(gender || '').trim();
  if (!value) return null;
  if (value.startsWith('Casal')) return 'couple';
  if (value === 'Mulher') return 'female';
  if (value === 'Homem') return 'male';
  return null;
}

function radarTargetsUser(targetGenders: string[], userGender: string | null | undefined) {
  if (!Array.isArray(targetGenders) || targetGenders.length === 0 || targetGenders.includes('all')) return true;
  const mapped = mapUserGenderToRadarAudience(userGender);
  return !!mapped && targetGenders.includes(mapped);
}

function matchesLookingFor(lookingFor: string[] | null | undefined, otherGender: string | null | undefined) {
  if (!Array.isArray(lookingFor) || lookingFor.length === 0) return true;
  const gender = String(otherGender || '').trim();
  if (!gender) return true;
  return lookingFor.some((pref) => {
    const value = String(pref || '').trim();
    if (!value) return false;
    if (value.startsWith('Casal')) return gender.startsWith('Casal');
    return value === gender;
  });
}

function radarProfilesAreCompatible(
  sender: { gender?: string | null; lookingFor?: string[] | null },
  recipient: { gender?: string | null; lookingFor?: string[] | null }
) {
  return matchesLookingFor(sender.lookingFor ?? null, recipient.gender ?? null) && matchesLookingFor(recipient.lookingFor ?? null, sender.gender ?? null);
}

function startOfCurrentDayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function startOfCurrentWeekIso() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diff);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function replaceFileExtension(filename: string, nextExtension: string) {
  const ext = path.extname(filename);
  if (!ext) return `${filename}${nextExtension}`;
  return `${filename.slice(0, -ext.length)}${nextExtension}`;
}

async function compressUploadedVideo(file: Express.Multer.File) {
  const currentPath = file.path;
  const tempOutputPath = `${currentPath}.compressed.mp4`;
  const nextFilename = replaceFileExtension(file.filename, '.mp4');
  const nextPath = path.join(path.dirname(currentPath), nextFilename);

  const args = [
    '-y',
    '-i', currentPath,
    '-vf', "scale='min(1280,iw)':-2",
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '30',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '128k',
    tempOutputPath,
  ];

  const compressionResult = await new Promise<'ok' | 'skip'>((resolve) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'ignore' });

    ffmpeg.on('error', () => resolve('skip'));
    ffmpeg.on('close', (code) => resolve(code === 0 ? 'ok' : 'skip'));
  });

  if (compressionResult !== 'ok' || !existsSync(tempOutputPath)) {
    if (existsSync(tempOutputPath)) unlinkSync(tempOutputPath);
    return {
      filename: file.filename,
      mimetype: file.mimetype,
      size: Number(file.size || 0),
    };
  }

  const compressedStats = statSync(tempOutputPath);
  if (!compressedStats.isFile() || compressedStats.size <= 0) {
    unlinkSync(tempOutputPath);
    return {
      filename: file.filename,
      mimetype: file.mimetype,
      size: Number(file.size || 0),
    };
  }

  unlinkSync(currentPath);
  if (nextPath !== tempOutputPath) {
    if (existsSync(nextPath)) unlinkSync(nextPath);
    renameSync(tempOutputPath, nextPath);
  }

  return {
    filename: nextFilename,
    mimetype: 'video/mp4',
    size: compressedStats.size,
  };
}

async function compressUploadedImage(file: Express.Multer.File) {
  const currentPath = file.path;
  const tempOutputPath = `${currentPath}.compressed.webp`;
  const nextFilename = replaceFileExtension(file.filename, '.webp');
  const nextPath = path.join(path.dirname(currentPath), nextFilename);

  const args = [
    '-y',
    '-i', currentPath,
    '-vf', "scale='min(1600,iw)':-2",
    '-compression_level', '6',
    '-quality', '82',
    tempOutputPath,
  ];

  const compressionResult = await new Promise<'ok' | 'skip'>((resolve) => {
    const ffmpeg = spawn('ffmpeg', args, { stdio: 'ignore' });

    ffmpeg.on('error', () => resolve('skip'));
    ffmpeg.on('close', (code) => resolve(code === 0 ? 'ok' : 'skip'));
  });

  if (compressionResult !== 'ok' || !existsSync(tempOutputPath)) {
    if (existsSync(tempOutputPath)) unlinkSync(tempOutputPath);
    return {
      filename: file.filename,
      mimetype: file.mimetype,
      size: Number(file.size || 0),
    };
  }

  const compressedStats = statSync(tempOutputPath);
  if (!compressedStats.isFile() || compressedStats.size <= 0) {
    unlinkSync(tempOutputPath);
    return {
      filename: file.filename,
      mimetype: file.mimetype,
      size: Number(file.size || 0),
    };
  }

  unlinkSync(currentPath);
  if (nextPath !== tempOutputPath) {
    if (existsSync(nextPath)) unlinkSync(nextPath);
    renameSync(tempOutputPath, nextPath);
  }

  return {
    filename: nextFilename,
    mimetype: 'image/webp',
    size: compressedStats.size,
  };
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

async function isUserBlocked(options: { db: DbHandle }, data: { viewerId: string; targetId: string }): Promise<boolean> {
  if (data.viewerId === data.targetId) return false;
  const row = await queryOne(
    options.db,
    `SELECT 1 FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1`,
    [data.viewerId, data.targetId, data.targetId, data.viewerId]
  );
  return !!row;
}

async function canSendMessage(options: { db: DbHandle }, data: { fromUserId: string; toUserId: string }) {
  if (data.fromUserId === data.toUserId) return true;
  // Block check — if either party has blocked the other, no messages allowed
  const blocked = await isUserBlocked(options, { viewerId: data.fromUserId, targetId: data.toUserId });
  if (blocked) return false;
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

function rowToPublicUser(
  row: any,
  isOnline?: boolean,
  options?: { showEmail?: boolean; subscriptionsEnabled?: boolean }
): PublicUser {
  const lookingFor = safeJsonParse(row.looking_for_json);
  return {
    id: String(row.id),
    ...(options?.showEmail ? { email: String(row.email) } : {}),
    name: String(row.name),
    avatar: row.avatar ?? null,
    bio: row.bio ?? null,
    status: row.status ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    birthDate: row.birth_date ?? null,
    partnerBirthDate: row.partner_birth_date ?? null,
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
    invitationStatus: row.invite_status ?? null,
    hubCustomerId: row.hub_customer_id ?? null,
    hubAccessStatus: row.hub_access_status ?? null,
    hubAccessReason: row.hub_access_reason ?? null,
    hubLicenseEndAt: row.hub_license_end_at ?? null,
    hubBanner: row.hub_banner ?? null,
    notificationVisits: row.notification_visits == null ? true : !!row.notification_visits,
    subscriptionsEnabled: options?.subscriptionsEnabled ?? true,
    ...(options?.showEmail
      ? {
          billingDocument: row.billing_document ?? null,
          billingLegalName: row.billing_legal_name ?? null,
          billingPersonType: row.billing_person_type ?? null,
          billingPhone: row.billing_phone ?? null,
          billingAddressZip: row.billing_address_zip ?? null,
          billingAddressStreet: row.billing_address_street ?? null,
          billingAddressNumber: row.billing_address_number ?? null,
          billingAddressDistrict: row.billing_address_district ?? null,
          billingAddressComplement: row.billing_address_complement ?? null,
          billingAddressCity: row.billing_address_city ?? null,
          billingAddressState: row.billing_address_state ?? null,
        }
      : {}),
    invitedBy:
      row.invited_by_user_id && row.inviter_name
        ? {
            id: String(row.invited_by_user_id),
            name: String(row.inviter_name),
            avatar: row.inviter_avatar ?? null,
          }
        : null,
  };
}

async function getUserWithSponsorById(db: DbHandle, userId: string) {
  return queryOne(
    db,
    `SELECT u.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
     FROM users u
     LEFT JOIN users inviter ON inviter.id = u.invited_by_user_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
}

function inviteStatusError(status: string) {
  if (status === 'pending') return 'pending_invite_approval';
  if (status === 'denied') return 'invite_access_denied';
  return 'unauthorized';
}

function rowToInviteEntry(entry: InviteEntryRow) {
  return {
    id: String(entry.id),
    inviteLinkId: String(entry.invite_link_id),
    createdAt: String(entry.created_at),
    inviteeEmail: entry.invitee_email ?? null,
    invitee: {
      id: String(entry.invitee_user_id),
      name: entry.invitee_name ? String(entry.invitee_name) : null,
      avatar: entry.invitee_avatar ?? null,
    },
  };
}

function rowToInvite(invite: InviteRow) {
  const entries = Array.isArray(invite.entries) ? invite.entries.map(rowToInviteEntry) : [];
  return {
    id: String(invite.id),
    token: String(invite.invite_token),
    status: String(invite.status),
    createdAt: String(invite.created_at),
    updatedAt: String(invite.updated_at),
    approvedAt: invite.approved_at ?? null,
    usedAt: invite.used_at ?? null,
    revokedAt: invite.revoked_at ?? null,
    entrantsCount: entries.length,
    entries,
    inviter: {
      id: String(invite.inviter_user_id),
      name: String(invite.inviter_name || ''),
      avatar: invite.inviter_avatar ?? null,
    },
  };
}

async function getInvitesWithEntriesByInviter(db: DbHandle, inviterUserId: string) {
  const invites = (await queryAll(
    db,
    `SELECT i.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
     FROM invite_links i
     JOIN users inviter ON inviter.id = i.inviter_user_id
     WHERE i.inviter_user_id = ?
     ORDER BY i.created_at DESC`,
    [inviterUserId]
  )) as InviteRow[];

  if (invites.length === 0) return [];

  const inviteIds = invites.map((invite) => String(invite.id));
  const placeholders = inviteIds.map(() => '?').join(', ');
  const entries = (await queryAll(
    db,
    `SELECT e.*, invitee.name AS invitee_name, invitee.avatar AS invitee_avatar
     FROM invite_link_entries e
     JOIN users invitee ON invitee.id = e.invitee_user_id
     WHERE e.invite_link_id IN (${placeholders})
     ORDER BY e.created_at DESC`,
    inviteIds
  )) as InviteEntryRow[];

  const entriesByInviteId = new Map<string, InviteEntryRow[]>();
  for (const entry of entries) {
    const key = String(entry.invite_link_id);
    const current = entriesByInviteId.get(key) || [];
    current.push(entry);
    entriesByInviteId.set(key, current);
  }

  return invites.map((invite) => ({
    ...invite,
    entries: entriesByInviteId.get(String(invite.id)) || [],
  }));
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
      const userRow = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [userId])) as any;
      if (!userRow) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      req.auth = { userId, isAdmin: !!userRow.is_admin };
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

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore) {
    if (now > val.resetAt) rateLimitStore.delete(key);
  }
}, 60_000);

function createRateLimiter(maxRequests: number, windowMs: number): express.RequestHandler {
  return (req, res, next) => {
    // Use real client IP (accounts for Cloudflare/nginx proxy headers)
    const key = String(getRequestIp(req) || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const state = rateLimitStore.get(key);
    if (!state || now > state.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (state.count >= maxRequests) {
      res.status(429).json({ error: 'too_many_requests', retryAfterMs: state.resetAt - now });
      return;
    }
    state.count++;
    next();
  };
}

// Skip rate limiting in test mode to allow test suites to run without hitting limits
const isTest = process.env.NODE_ENV === 'test';
const noop: express.RequestHandler = (_req, _res, next) => next();
const authRateLimiter = isTest ? noop : createRateLimiter(10, 60_000);   // 10 req/min
const uploadRateLimiter = isTest ? noop : createRateLimiter(30, 60_000); // 30 uploads/min

export function createApp(options: { db: DbHandle; env: Env }) {
  const { db, env } = options;
  const persist = () => db.persist();
  const app = express();

  app.disable('x-powered-by');
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow the configured FRONTEND_ORIGIN + any localhost port (dev)
        const allowed = env.FRONTEND_ORIGIN;
        if (!requestOrigin) return callback(null, true);
        if (requestOrigin === allowed) return callback(null, true);
        if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return callback(null, true);
        if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(requestOrigin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );
  app.post('/api/webhooks/hub-billing', express.raw({ type: 'application/json', limit: '1mb' }));
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

  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime',
  ]);

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

  const IMAGE_MAX_BYTES = 20 * 1024 * 1024;  // 20 MB for images
  const VIDEO_MAX_BYTES = 200 * 1024 * 1024; // 200 MB for videos

  const upload = multer({
    storage,
    limits: { fileSize: VIDEO_MAX_BYTES }, // upper bound — validated per type below
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(new Error('INVALID_FILE_TYPE'));
        return;
      }
      cb(null, true);
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'nosigilo-backend', time: nowIso() });
  });

  app.post('/api/auth/check-email', authRateLimiter, async (req, res) => {
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

  app.post('/api/auth/forgot-password/request', authRateLimiter, async (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const user = (await queryOne(db, 'SELECT id, name, email FROM users WHERE email = ? LIMIT 1', [email])) as any;
    if (!user) {
      res.json({ ok: true });
      return;
    }

    const code = generateVerificationCode();
    const createdAt = nowIso();
    const expiresAt = addMinutesIso(createdAt, 15);
    const codeHash = bcrypt.hashSync(code, 10);

    if (process.env.NODE_ENV === 'production' && (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)) {
      res.status(500).json({ error: 'email_send_failed' });
      return;
    }

    try {
      await sendPasswordResetCodeEmail(
        {
          apiKey: env.RESEND_API_KEY,
          fromEmail: env.RESEND_FROM_EMAIL,
          appName: env.APP_NAME,
        },
        { to: email, code, userName: user.name ? String(user.name) : null }
      );
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      res.status(500).json({ error: 'email_send_failed' });
      return;
    }

    await run(db, 'UPDATE password_reset_codes SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL', [createdAt, String(user.id)]);
    await run(
      db,
      'INSERT INTO password_reset_codes (id, user_id, email, code_hash, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), String(user.id), email, codeHash, createdAt, expiresAt, null]
    );
    await persist();

    const response: any = { ok: true };
    if (process.env.NODE_ENV !== 'production' && !env.RESEND_API_KEY) {
      response.previewCode = code;
    }
    res.json(response);
  });

  app.post('/api/auth/forgot-password/confirm', authRateLimiter, async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      code: z.string().trim().length(6),
      newPassword: z.string().min(6),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const code = parsed.data.code.trim();
    const resetRow = (await queryOne(
      db,
      `SELECT prc.*, u.id as user_id
       FROM password_reset_codes prc
       JOIN users u ON u.id = prc.user_id
       WHERE prc.email = ?
         AND prc.consumed_at IS NULL
       ORDER BY prc.created_at DESC
       LIMIT 1`,
      [email]
    )) as any;

    if (!resetRow) {
      res.status(400).json({ error: 'invalid_reset_code' });
      return;
    }

    if (new Date(String(resetRow.expires_at)).getTime() <= Date.now()) {
      await run(db, 'UPDATE password_reset_codes SET consumed_at = ? WHERE id = ?', [nowIso(), String(resetRow.id)]);
      await persist();
      res.status(400).json({ error: 'reset_code_expired' });
      return;
    }

    const codeMatches = bcrypt.compareSync(code, String(resetRow.code_hash));
    if (!codeMatches) {
      res.status(400).json({ error: 'invalid_reset_code' });
      return;
    }

    const passwordHash = bcrypt.hashSync(parsed.data.newPassword, 10);
    const consumedAt = nowIso();
    await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, String(resetRow.user_id)]);
    await run(db, 'UPDATE password_reset_codes SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL', [consumedAt, String(resetRow.user_id)]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/invites/public/:token', async (req, res) => {
    const token = String(req.params.token || '').trim();
    if (!token) {
      res.status(400).json({ error: 'invalid_invite' });
      return;
    }
    const invite = (await queryOne(
      db,
      `SELECT i.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
       FROM invite_links i
       JOIN users inviter ON inviter.id = i.inviter_user_id
       WHERE i.invite_token = ?
       LIMIT 1`,
      [token]
    )) as InviteRow | null;
    if (!invite) {
      res.status(404).json({ error: 'invalid_invite' });
      return;
    }
    res.json({
      id: String(invite.id),
      status: String(invite.status),
      canRegister: String(invite.status) === 'created',
      inviter: {
        id: String(invite.inviter_user_id),
        name: String(invite.inviter_name || ''),
        avatar: invite.inviter_avatar ?? null,
      },
    });
  });

  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1),
      inviteToken: z.string().optional(),
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
    const inviteToken = parsed.data.inviteToken?.trim() || '';

    let invite: InviteRow | null = null;
    if (inviteToken) {
      invite = (await queryOne(
        db,
        `SELECT i.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
         FROM invite_links i
         JOIN users inviter ON inviter.id = i.inviter_user_id
         WHERE i.invite_token = ?
         LIMIT 1`,
        [inviteToken]
      )) as InviteRow | null;
    }

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
        looking_for_json, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at,
        invited_by_user_id, invite_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        isAdministrativeEmail(email) ? 1 : 0,
        createdAt,
        createdAt,
        trialEndsAt,
        invite ? String(invite.inviter_user_id) : null,
        'approved',
      ]
    );
    if (invite) {
      await run(
        db,
        'INSERT INTO invite_link_entries (id, invite_link_id, invitee_user_id, invitee_email, created_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), String(invite.id), id, email, createdAt]
      );
      await run(
        db,
        'UPDATE invite_links SET used_at = COALESCE(used_at, ?), updated_at = ? WHERE id = ?',
        [createdAt, createdAt, String(invite.id)]
      );
    }
    await persist();

    if (invite) {
      await createNotification(
        { db, io: req.app.get('io') },
        {
          userId: String(invite.inviter_user_id),
          type: 'invite.approved',
          title: 'Novo convidado entrou na rede',
          description: `${name} entrou na rede usando o seu convite.`,
          dataJson: { inviteId: String(invite.id), inviteeUserId: id, inviteeName: name, inviteeEmail: email },
        }
      );
    }

    const userRow = await getUserWithSponsorById(db, id);
    const presence = req.app.get('presence');
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const user = rowToPublicUser(userRow, presence?.isOnline(id), {
      showEmail: true,
      subscriptionsEnabled,
    });

    res.status(201).json({
      token: issueToken(env, { id: user.id, isAdmin: user.isAdmin }),
      user,
      inviteId: invite ? String(invite.id) : null,
      inviter: invite ? { id: String(invite.inviter_user_id), name: String(invite.inviter_name || ''), avatar: invite.inviter_avatar ?? null } : null,
    });
  });

  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const email = parsed.data.email.toLowerCase();
    const row = (await queryOne(
      db,
      `SELECT u.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
       FROM users u
       LEFT JOIN users inviter ON inviter.id = u.invited_by_user_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    )) as any;
    if (!row) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    if (Number(row.is_banned || 0) === 1) {
      res.status(403).json({ error: 'account_banned' });
      return;
    }
    const ok = bcrypt.compareSync(parsed.data.password, String(row.password_hash));
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    // Auto-reactivate deactivated profile on successful login
    if (Number(row.is_deactivated || 0) === 1) {
      await run(db, 'UPDATE users SET is_deactivated = 0, deactivated_at = NULL WHERE id = ?', [String(row.id)]);
      await persist();
    }
    if (shouldUseHubBilling(env)) {
      try {
        const hubResult = String(row.hub_customer_id || '').trim()
          ? await getHubAccessStatus(getHubConfig(env), String(row.hub_customer_id))
          : await resolveHubAccess(getHubConfig(env), {
              email: String(row.email),
              name: String(row.name),
              document: row.billing_document ?? null,
              personType: row.billing_person_type ?? null,
            });
        await syncHubAccessForUser(db, String(row.id), hubResult);
        await persist();
      } catch (error) {
        console.error('Hub Billing resolveAccess failed on login:', error);
      }
    }
    const hydratedRow = await getUserWithSponsorById(db, String(row.id));
    const presence = req.app.get('presence');
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const user = rowToPublicUser(hydratedRow || row, presence?.isOnline(String(row.id)), {
      showEmail: true,
      subscriptionsEnabled,
    });
    res.json({ token: issueToken(env, { id: user.id, isAdmin: user.isAdmin }), user });
  });

  app.get('/api/auth/pending-access', async (req, res) => {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const row = (await queryOne(
      db,
      `SELECT u.id, u.email, u.name, u.invite_status, u.created_at, u.trial_started_at,
              inviter.id AS inviter_id, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
       FROM users u
       LEFT JOIN users inviter ON inviter.id = u.invited_by_user_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    )) as any;
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      email: String(row.email),
      name: String(row.name),
      invitationStatus: row.invite_status ? String(row.invite_status) : 'approved',
      createdAt: row.created_at ?? row.trial_started_at ?? null,
      inviter: row.inviter_id
        ? {
            id: String(row.inviter_id),
            name: row.inviter_name ? String(row.inviter_name) : null,
            avatar: row.inviter_avatar ?? null,
          }
        : null,
    });
  });

  app.get('/api/invites', requireAuth(env, db), async (req, res) => {
    const rows = await getInvitesWithEntriesByInviter(db, req.auth!.userId);
    res.json(rows.map(rowToInvite));
  });

  app.post('/api/invites', requireAuth(env, db), async (req, res) => {
    const now = nowIso();
    const id = randomUUID();
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await run(
      db,
      'INSERT INTO invite_links (id, inviter_user_id, invite_token, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.auth!.userId, token, 'created', now, now]
    );
    await persist();
    res.json({
      id,
      token,
      status: 'created',
      createdAt: now,
      url: `${String(env.FRONTEND_ORIGIN || '').replace(/\/$/, '')}/register?invite=${encodeURIComponent(token)}`,
    });
  });

  app.post('/api/invites/:inviteId/revoke', requireAuth(env, db), async (req, res) => {
    const inviteId = String(req.params.inviteId || '');
    const invite = (await queryOne(
      db,
      `SELECT i.*, inviter.name AS inviter_name, inviter.avatar AS inviter_avatar
       FROM invite_links i
       JOIN users inviter ON inviter.id = i.inviter_user_id
       WHERE i.id = ?
       LIMIT 1`,
      [inviteId]
    )) as InviteRow | null;
    if (!invite || String(invite.inviter_user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'invite_not_found' });
      return;
    }
    if (String(invite.status) !== 'created') {
      res.status(409).json({ error: 'invite_not_revocable' });
      return;
    }
    const now = nowIso();
    await run(db, 'UPDATE invite_links SET status = ?, revoked_at = ?, updated_at = ? WHERE id = ?', ['revoked', now, now, inviteId]);
    await persist();
    const refreshed = (await getInvitesWithEntriesByInviter(db, req.auth!.userId)).find((item) => String(item.id) === inviteId);
    if (!refreshed) {
      res.status(404).json({ error: 'invite_not_found' });
      return;
    }
    res.json(rowToInvite(refreshed));
  });

  app.get('/api/auth/me', requireAuth(env, db), async (req, res) => {
    const row = await getUserWithSponsorById(db, req.auth!.userId);
    const presence = req.app.get('presence');
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id)), {
      showEmail: true,
      subscriptionsEnabled,
    }));
  });

  app.post('/api/auth/refresh', requireAuth(env, db), async (req, res) => {
    const row = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [req.auth!.userId])) as any;
    res.json({ token: issueToken(env, { id: String(row.id), isAdmin: !!row.is_admin }) });
  });

  app.get('/api/auth/google', (_req, res) => {
    res.status(501).json({ error: 'not_implemented' });
  });

  app.get('/api/app/settings', async (_req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    res.json({ subscriptionsEnabled });
  });

  app.post('/api/analytics/visit', async (req, res) => {
    try {
      const schema = z.object({
        path: z.string().trim().max(255).optional(),
        title: z.string().trim().max(255).optional(),
        referrer: z.string().trim().max(500).optional(),
        utmSource: z.string().trim().max(120).optional(),
        utmMedium: z.string().trim().max(120).optional(),
        utmCampaign: z.string().trim().max(120).optional(),
        utmTerm: z.string().trim().max(120).optional(),
        utmContent: z.string().trim().max(120).optional(),
        timezone: z.string().trim().max(120).optional(),
        language: z.string().trim().max(80).optional(),
        deviceType: z.enum(['mobile', 'tablet', 'desktop']).optional(),
        screenWidth: z.number().int().min(0).max(10000).optional(),
        screenHeight: z.number().int().min(0).max(10000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }

      const payload = parsed.data;
      const referrer = limitText(payload.referrer, 500);
      const referrerDomain = getReferrerDomain(referrer);
      const utmSource = limitText(payload.utmSource, 120);
      const userAgent = limitText(getHeaderValue(req, 'user-agent'), 500);
      const userId = decodeOptionalUserId(env, req);
      const ipHash = hashRequestIp(env, getRequestIp(req));
      const country = limitText(getHeaderValue(req, 'cf-ipcountry'), 32);
      const deviceType = payload.deviceType || getDeviceType(userAgent, payload.screenWidth ?? null);

      await run(
        db,
        `INSERT INTO site_visits (
          id, user_id, page_path, page_title, referrer, referrer_domain, origin_type,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          country, timezone, language, device_type, screen_width, screen_height,
          user_agent, ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          userId,
          limitText(payload.path, 255),
          limitText(payload.title, 255),
          referrer,
          referrerDomain,
          inferOriginType(referrerDomain, utmSource),
          utmSource,
          limitText(payload.utmMedium, 120),
          limitText(payload.utmCampaign, 120),
          limitText(payload.utmTerm, 120),
          limitText(payload.utmContent, 120),
          country,
          limitText(payload.timezone, 120),
          limitText(payload.language, 80),
          deviceType,
          typeof payload.screenWidth === 'number' ? payload.screenWidth : null,
          typeof payload.screenHeight === 'number' ? payload.screenHeight : null,
          userAgent,
          ipHash,
          nowIso(),
        ]
      );
      await persist();

      res.json({ ok: true });
    } catch (err) {
      console.error('[analytics/visit]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/feed', requireAuth(env, db), async (req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const viewerRow = await queryOne(db, 'SELECT is_premium, trial_ends_at, gender, looking_for_json FROM users WHERE id = ?', [req.auth!.userId]);
    const viewerHasPremium = hasPremiumAccess(viewerRow, subscriptionsEnabled);
    const viewerLookingFor = Array.isArray(safeJsonParse((viewerRow as any)?.looking_for_json))
      ? (safeJsonParse((viewerRow as any)?.looking_for_json) as string[])
      : [];
    const page = Number(req.query.page || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (Math.max(1, page) - 1) * limit;
    const includeReelsOnly = req.query.includeReelsOnly === 'true';
    const reelsOnlyFilter = includeReelsOnly ? '' : 'AND (p.is_reels_only = 0 OR p.is_reels_only IS NULL)';
    const fetchLimit = includeReelsOnly ? offset + limit + 1 : limit + 1;
    const queryOffset = includeReelsOnly ? 0 : offset;
    const rows = await queryAll(
      db,
      `
      SELECT p.id, p.content, p.created_at, p.media_ids_json, p.is_reels_only,
        u.id as author_id, u.name as author_name, u.avatar as author_avatar,
        u.gender as author_gender, u.city as author_city, u.state as author_state
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE 1=1
        AND (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
             OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
        )
        ${reelsOnlyFilter}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [req.auth!.userId, req.auth!.userId, fetchLimit, queryOffset]
    );

    const orderedRows = includeReelsOnly
      ? [...rows].sort((a: any, b: any) => {
          const aInterested = matchesLookingFor(viewerLookingFor, a.author_gender) ? 0 : 1;
          const bInterested = matchesLookingFor(viewerLookingFor, b.author_gender) ? 0 : 1;
          if (aInterested !== bInterested) return aInterested - bInterested;
          return new Date(String(b.created_at || '')).getTime() - new Date(String(a.created_at || '')).getTime();
        })
      : rows;

    const slice = includeReelsOnly ? orderedRows.slice(offset, offset + limit) : orderedRows.slice(0, limit);
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

    // Aggregate reactions per post (reaction type → count, top 3 distinct types)
    const reactionsByPostId = new Map<string, { type: string; count: number }[]>();
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(', ');
      const reactionRows = await queryAll(
        db,
        `SELECT target_id, COALESCE(reaction, 'heart') as reaction, COUNT(*) as c
         FROM likes WHERE target_type = 'post' AND target_id IN (${placeholders})
         GROUP BY target_id, COALESCE(reaction, 'heart')
         ORDER BY target_id, c DESC`,
        postIds
      );
      for (const rr of reactionRows as any[]) {
        const pid = String(rr.target_id);
        if (!reactionsByPostId.has(pid)) reactionsByPostId.set(pid, []);
        reactionsByPostId.get(pid)!.push({ type: String(rr.reaction), count: Number(rr.c) });
      }
    }

    res.json({
      posts: slice.map((r: any) => ({
        id: r.id,
        content: r.content,
        createdAt: r.created_at,
        author: {
          id: r.author_id,
          name: r.author_name,
          avatar: r.author_avatar,
          gender: r.author_gender ?? null,
          city: r.author_city ?? null,
          state: r.author_state ?? null,
        },
        mediaIds: mediaIdsByPostId.get(String(r.id)) ?? [],
        media: (mediaIdsByPostId.get(String(r.id)) ?? []).map((mid) => mediaById.get(mid)).filter(Boolean),
        likesCount: likesCountByPostId.get(String(r.id)) ?? 0,
        commentsCount: commentsCountByPostId.get(String(r.id)) ?? 0,
        likedByMe: likedByMeSet.has(String(r.id)),
        reactions: reactionsByPostId.get(String(r.id)) ?? [],
      })),
      hasMore: includeReelsOnly ? orderedRows.length > offset + limit : rows.length > limit,
    });
  });

  app.post('/api/posts', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      content: z.string().max(5000).optional(),
      mediaIds: z.array(z.string()).max(10).optional(),
      reelsOnly: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const content = String(parsed.data.content || '').trim();
    const mediaIds = Array.isArray(parsed.data.mediaIds) ? parsed.data.mediaIds.filter((v) => typeof v === 'string') : [];
    const isReelsOnly = parsed.data.reelsOnly === true ? 1 : 0;
    if (content.length === 0 && mediaIds.length === 0) {
      res.status(400).json({ error: 'empty_post' });
      return;
    }
    const id = randomUUID();
    await run(db, 'INSERT INTO posts (id, user_id, content, media_ids_json, is_reels_only, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      content,
      mediaIds.length > 0 ? JSON.stringify(mediaIds) : null,
      isReelsOnly,
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

  app.get('/api/feed/experiences', requireAuth(env, db), async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (Math.max(1, page) - 1) * limit;
    const rows = await queryAll(
      db,
      `
      SELECT e.id, e.title, e.description, e.created_at,
        u.id as author_id, u.name as author_name, u.avatar as author_avatar,
        u.gender as author_gender, u.city as author_city, u.state as author_state
      FROM experiences e
      JOIN users u ON u.id = e.user_id
      WHERE (u.is_banned = 0 OR u.is_banned IS NULL)
        AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
             OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
        )
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [req.auth!.userId, req.auth!.userId, limit + 1, offset]
    );

    const slice = rows.slice(0, limit);
    const experienceIds = slice.map((r: any) => String(r.id));
    const likesCountByExperienceId = new Map<string, number>();
    const commentsCountByExperienceId = new Map<string, number>();
    const likedByMeSet = new Set<string>();

    if (experienceIds.length > 0) {
      const placeholders = experienceIds.map(() => '?').join(', ');
      const likeCounts = await queryAll(
        db,
        `SELECT target_id, COUNT(*) as c
         FROM likes
         WHERE target_type = 'experience' AND target_id IN (${placeholders})
         GROUP BY target_id`,
        experienceIds
      );
      for (const lr of likeCounts as any[]) likesCountByExperienceId.set(String(lr.target_id), Number(lr.c || 0));

      const commentCounts = await queryAll(
        db,
        `SELECT target_id, COUNT(*) as c
         FROM comments
         WHERE target_type = 'experience' AND target_id IN (${placeholders})
         GROUP BY target_id`,
        experienceIds
      );
      for (const cr of commentCounts as any[]) commentsCountByExperienceId.set(String(cr.target_id), Number(cr.c || 0));

      const likedByMeRows = await queryAll(
        db,
        `SELECT target_id
         FROM likes
         WHERE target_type = 'experience' AND user_id = ? AND target_id IN (${placeholders})`,
        [req.auth!.userId, ...experienceIds]
      );
      for (const r of likedByMeRows as any[]) likedByMeSet.add(String(r.target_id));
    }

    const mediaByExpId = new Map<string, Array<{ id: string; url: string; mimeType: string }>>();
    if (experienceIds.length > 0) {
      const ph2 = experienceIds.map(() => '?').join(', ');
      const mediaRows = await queryAll(db, `SELECT em.experience_id, m.id, m.filename, m.mime_type FROM experience_media em JOIN media m ON m.id = em.media_id WHERE em.experience_id IN (${ph2}) ORDER BY em.experience_id, em.sort_order`, experienceIds);
      for (const m of mediaRows as any[]) {
        const eid = String(m.experience_id);
        if (!mediaByExpId.has(eid)) mediaByExpId.set(eid, []);
        mediaByExpId.get(eid)!.push({ id: String(m.id), url: `/uploads/${m.filename}`, mimeType: String(m.mime_type || '') });
      }
    }

    res.json({
      experiences: slice.map((r: any) => ({
        id: String(r.id),
        title: String(r.title || ''),
        description: String(r.description || ''),
        createdAt: r.created_at,
        media: mediaByExpId.get(String(r.id)) ?? [],
        author: {
          id: r.author_id,
          name: r.author_name,
          avatar: r.author_avatar,
          gender: r.author_gender ?? null,
          city: r.author_city ?? null,
          state: r.author_state ?? null,
        },
        likesCount: likesCountByExperienceId.get(String(r.id)) ?? 0,
        commentsCount: commentsCountByExperienceId.get(String(r.id)) ?? 0,
        likedByMe: likedByMeSet.has(String(r.id)),
      })),
      hasMore: rows.length > limit,
    });
  });

  app.post('/api/experiences', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      title: z.string().min(3).max(120),
      description: z.string().min(20).max(6000),
      mediaIds: z.array(z.string()).max(10).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const id = randomUUID();
    await run(db, 'INSERT INTO experiences (id, user_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.title.trim(),
      parsed.data.description.trim(),
      nowIso(),
    ]);
    if (parsed.data.mediaIds && parsed.data.mediaIds.length > 0) {
      for (let i = 0; i < parsed.data.mediaIds.length; i++) {
        await run(db, 'INSERT INTO experience_media (experience_id, media_id, sort_order) VALUES (?, ?, ?)', [id, parsed.data.mediaIds[i], i]);
      }
    }
    await persist();
    res.json({ id });
  });

  app.delete('/api/experiences/:experienceId', requireAuth(env, db), async (req, res) => {
    const experienceId = String(req.params.experienceId || '');
    const experience = (await queryOne(db, 'SELECT id, user_id FROM experiences WHERE id = ? LIMIT 1', [experienceId])) as any;
    if (!experience) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (String(experience.user_id) !== req.auth!.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    await run(db, "DELETE FROM likes WHERE target_type = 'experience' AND target_id = ?", [experienceId]);
    await run(db, "DELETE FROM comments WHERE target_type = 'experience' AND target_id = ?", [experienceId]);
    await run(db, 'DELETE FROM experiences WHERE id = ? AND user_id = ?', [experienceId, req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/users/:userId/experiences', requireAuth(env, db), async (req, res) => {
    const targetUserId = String(req.params.userId || '');
    const rows = await queryAll(
      db,
      `SELECT e.id, e.title, e.description, e.created_at
       FROM experiences e
       WHERE e.user_id = ?
       ORDER BY e.created_at DESC
       LIMIT 50`,
      [targetUserId]
    );
    const experienceIds = rows.map((r: any) => String(r.id));
    const likesCountMap = new Map<string, number>();
    const commentsCountMap = new Map<string, number>();
    const likedByMeSet = new Set<string>();
    if (experienceIds.length > 0) {
      const ph = experienceIds.map(() => '?').join(', ');
      const lc = await queryAll(db, `SELECT target_id, COUNT(*) as c FROM likes WHERE target_type = 'experience' AND target_id IN (${ph}) GROUP BY target_id`, experienceIds);
      for (const r of lc as any[]) likesCountMap.set(String(r.target_id), Number(r.c || 0));
      const cc = await queryAll(db, `SELECT target_id, COUNT(*) as c FROM comments WHERE target_type = 'experience' AND target_id IN (${ph}) GROUP BY target_id`, experienceIds);
      for (const r of cc as any[]) commentsCountMap.set(String(r.target_id), Number(r.c || 0));
      const lm = await queryAll(db, `SELECT target_id FROM likes WHERE target_type = 'experience' AND user_id = ? AND target_id IN (${ph})`, [req.auth!.userId, ...experienceIds]);
      for (const r of lm as any[]) likedByMeSet.add(String(r.target_id));
    }
    res.json(rows.map((r: any) => ({
      id: String(r.id),
      title: String(r.title || ''),
      description: String(r.description || ''),
      createdAt: r.created_at,
      likesCount: likesCountMap.get(String(r.id)) ?? 0,
      commentsCount: commentsCountMap.get(String(r.id)) ?? 0,
      likedByMe: likedByMeSet.has(String(r.id)),
    })));
  });

  app.get('/api/photos/recent', requireAuth(env, db), async (req, res) => {
    const rows = await queryAll(
      db,
      "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND mime_type LIKE 'image/%' AND (source IS NULL OR source != 'chat') ORDER BY created_at DESC LIMIT 20",
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
    const row = await getUserWithSponsorById(db, req.auth!.userId);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id)), { showEmail: true }));
  });

  app.put('/api/profile', requireAuth(env, db), async (req, res) => {
    const schema = z
      .object({
        name: z.string().min(1).max(60).optional(),
        avatar: z.string().url().max(500).optional().nullable(),
        bio: z.string().max(500).optional().nullable(),
        status: z.string().max(150).optional().nullable(),
        city: z.string().max(100).optional().nullable(),
        state: z.string().max(50).optional().nullable(),
        birthDate: z.string().max(20).optional().nullable(),
        partnerBirthDate: z.string().max(20).optional().nullable(),
        gender: z.string().max(50).optional().nullable(),
        maritalStatus: z.string().max(50).optional().nullable(),
        sexualOrientation: z.string().max(50).optional().nullable(),
        ethnicity: z.string().max(50).optional().nullable(),
        hair: z.string().max(50).optional().nullable(),
        eyes: z.string().max(50).optional().nullable(),
        height: z.string().max(20).optional().nullable(),
        bodyType: z.string().max(50).optional().nullable(),
        smokes: z.string().max(50).optional().nullable(),
        drinks: z.string().max(50).optional().nullable(),
        profession: z.string().max(100).optional().nullable(),
        zodiacSign: z.string().max(50).optional().nullable(),
        lookingFor: z.array(z.string().max(50)).max(10).optional().nullable(),
        allowMessages: z.enum(['everyone', 'matches', 'friends', 'nobody']).optional().nullable(),
        notificationVisits: z.boolean().optional().nullable(),
        billingDocument: z.string().max(30).optional().nullable(),
        billingLegalName: z.string().max(120).optional().nullable(),
        billingPersonType: z.enum(['PF', 'PJ']).optional().nullable(),
        billingPhone: z.string().max(30).optional().nullable(),
        billingAddressZip: z.string().max(20).optional().nullable(),
        billingAddressStreet: z.string().max(150).optional().nullable(),
        billingAddressNumber: z.string().max(30).optional().nullable(),
        billingAddressDistrict: z.string().max(120).optional().nullable(),
        billingAddressComplement: z.string().max(150).optional().nullable(),
        billingAddressCity: z.string().max(100).optional().nullable(),
        billingAddressState: z.string().max(10).optional().nullable(),
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
      partnerBirthDate: 'partner_birth_date',
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
      notificationVisits: 'notification_visits',
      billingDocument: 'billing_document',
      billingLegalName: 'billing_legal_name',
      billingPersonType: 'billing_person_type',
      billingPhone: 'billing_phone',
      billingAddressZip: 'billing_address_zip',
      billingAddressStreet: 'billing_address_street',
      billingAddressNumber: 'billing_address_number',
      billingAddressDistrict: 'billing_address_district',
      billingAddressComplement: 'billing_address_complement',
      billingAddressCity: 'billing_address_city',
      billingAddressState: 'billing_address_state',
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

    const row = await getUserWithSponsorById(db, req.auth!.userId);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id)), { showEmail: true }));
  });

  // Deactivate profile
  app.put('/api/profile/deactivate', requireAuth(env, db), async (req, res) => {
    try {
      const userId = req.auth!.userId;
      await run(db, 'UPDATE users SET is_deactivated = 1, deactivated_at = ? WHERE id = ?', [nowIso(), userId]);
      await persist();
      res.json({ ok: true });
    } catch (err) {
      console.error('[profile/deactivate]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Reactivate profile
  app.put('/api/profile/reactivate', requireAuth(env, db), async (req, res) => {
    try {
      const userId = req.auth!.userId;
      await run(db, 'UPDATE users SET is_deactivated = 0, deactivated_at = NULL WHERE id = ?', [userId]);
      await persist();
      res.json({ ok: true });
    } catch (err) {
      console.error('[profile/reactivate]', err);
      res.status(500).json({ error: 'internal' });
    }
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
      SELECT
        MIN(v.id) as id,
        MAX(v.created_at) as created_at,
        COUNT(*) as visits_count,
        u.id as visitor_id,
        u.name as visitor_name,
        u.avatar as visitor_avatar
      FROM profile_visits v
      JOIN users u ON u.id = v.visitor_user_id
      WHERE v.visited_user_id = ?
      GROUP BY u.id, u.name, u.avatar
      ORDER BY MAX(v.created_at) DESC
      LIMIT 50
    `,
      [req.auth!.userId]
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        visitsCount: Number(r.visits_count || 1),
        visitor: { id: r.visitor_id, name: r.visitor_name, avatar: r.visitor_avatar },
      }))
    );
  });

  app.get('/api/users/:userId', requireAuth(env, db), async (req, res) => {
    const userId = req.params.userId;
    const viewerId = req.auth!.userId;
    const row = await queryOne(
      db,
      `
      SELECT u.*,
        (
          SELECT COUNT(*)
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'image/%' AND (m.source IS NULL OR m.source != 'chat')
        ) as public_photos_count,
        (
          SELECT COUNT(*)
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 1 AND m.mime_type LIKE 'image/%' AND (m.source IS NULL OR m.source != 'chat')
        ) as private_photos_count,
        (
          SELECT COUNT(*)
          FROM testimonials t
          WHERE t.profile_user_id = u.id AND t.status = 'approved'
        ) as approved_testimonials_count,
        (
          SELECT COUNT(*)
          FROM profile_visits v
          WHERE v.visited_user_id = u.id
        ) as profile_visits_count
      FROM users u
      WHERE u.id = ?
    `,
      [userId]
    );
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // Check if the viewing user has been blocked by the target (or viewer blocked target)
    if (viewerId !== userId) {
      const blockRow = await queryOne(
        db,
        `SELECT blocker_user_id FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1`,
        [viewerId, userId, userId, viewerId]
      );
      if (blockRow) {
        const isViewerBlocked = (blockRow as any).blocker_user_id === userId;
        res.status(403).json({ error: 'blocked', blockedBy: isViewerBlocked ? 'target' : 'viewer' });
        return;
      }
    }
    const presence = req.app.get('presence');
    res.json({
      ...rowToPublicUser(row, presence?.isOnline(String(row.id))),
      publicPhotosCount: Number((row as any).public_photos_count || 0),
      privatePhotosCount: Number((row as any).private_photos_count || 0),
      testimonialsCount: Number((row as any).approved_testimonials_count || 0),
      profileVisitsCount: Number((row as any).profile_visits_count || 0),
    });
  });

  // Block / Unblock endpoints
  app.post('/api/users/:userId/block', requireAuth(env, db), async (req, res) => {
    const targetId = String(req.params.userId || '');
    const blockerId = req.auth!.userId;
    if (targetId === blockerId) {
      res.status(400).json({ error: 'cannot_block_self' });
      return;
    }
    const target = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [targetId]);
    if (!target) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }
    await db.run(
      `INSERT OR IGNORE INTO blocks (blocker_user_id, blocked_user_id) VALUES (?, ?)`,
      [blockerId, targetId]
    );
    res.json({ success: true, blocked: true });
  });

  app.delete('/api/users/:userId/block', requireAuth(env, db), async (req, res) => {
    const targetId = String(req.params.userId || '');
    const blockerId = req.auth!.userId;
    await db.run(
      `DELETE FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`,
      [blockerId, targetId]
    );
    res.json({ success: true, blocked: false });
  });

  app.get('/api/users/:userId/block', requireAuth(env, db), async (req, res) => {
    const targetId = String(req.params.userId || '');
    const viewerId = req.auth!.userId;
    const row = await queryOne(
      db,
      `SELECT blocker_user_id FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?) LIMIT 1`,
      [viewerId, targetId, targetId, viewerId]
    );
    if (!row) {
      res.json({ blocked: false, blockedByMe: false, blockedByThem: false });
      return;
    }
    const blockedByMe = (row as any).blocker_user_id === viewerId;
    res.json({ blocked: true, blockedByMe, blockedByThem: !blockedByMe });
  });

  // ─── Search / browse users ───────────────────────────────────────────────
  app.get('/api/users', requireAuth(env, db), async (req, res) => {
    const viewerId = req.auth!.userId;
    const page   = Math.max(1, Number(req.query.page  || 1));
    const limit  = Math.min(40, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const search   = req.query.search   ? String(req.query.search).trim()   : '';
    const city     = req.query.city     ? String(req.query.city).trim()     : '';
    const ageRange = req.query.ageRange ? String(req.query.ageRange).trim() : 'all';
    const genders  = req.query.genders  ? String(req.query.genders).split(',').map((g) => g.trim()).filter(Boolean) : [];
    const radarKm  = req.query.radar    ? Number(req.query.radar)           : null;

    const params: any[] = [];
    const conditions: string[] = [
      'u.id != ?',
      '(u.is_banned = 0 OR u.is_banned IS NULL)',
      '(u.is_deactivated = 0 OR u.is_deactivated IS NULL)',
      `NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
           OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
      )`,
    ];
    params.push(viewerId, viewerId, viewerId);

    if (search) {
      conditions.push('(u.name LIKE ? OR u.city LIKE ? OR u.state LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (city) {
      conditions.push('(u.city LIKE ? OR u.state LIKE ?)');
      params.push(`%${city}%`, `%${city}%`);
    }

    if (genders.length > 0) {
      conditions.push(`u.gender IN (${genders.map(() => '?').join(',')})`);
      params.push(...genders);
    }

    if (ageRange !== 'all') {
      const [minStr, maxStr] = ageRange.replace('+', '-150').split('-');
      const minAge = Number(minStr);
      const maxAge = Number(maxStr) || 150;
      const now = new Date();
      const maxBirth = new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()).toISOString().split('T')[0];
      const minBirth = new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1).toISOString().split('T')[0];
      conditions.push('u.birth_date BETWEEN ? AND ?');
      params.push(minBirth, maxBirth);
    }

    // Get viewer's lat/lon for radar filter
    let viewerLat: number | null = null;
    let viewerLon: number | null = null;
    if (radarKm !== null) {
      const me = (await queryOne(db, 'SELECT lat, lon FROM users WHERE id = ?', [viewerId])) as any;
      viewerLat = me?.lat ? Number(me.lat) : null;
      viewerLon = me?.lon ? Number(me.lon) : null;
      if (viewerLat !== null && viewerLon !== null) {
        const latDelta = radarKm / 111;
        const lonDelta = radarKm / (111 * Math.cos((viewerLat * Math.PI) / 180));
        conditions.push('u.lat BETWEEN ? AND ? AND u.lon BETWEEN ? AND ?');
        params.push(viewerLat - latDelta, viewerLat + latDelta, viewerLon - lonDelta, viewerLon + lonDelta);
      }
    }

    const whereClause = conditions.join(' AND ');
    const presence = req.app.get('presence') as undefined | { isOnline: (id: string) => boolean };

    // Ordering: online first → last_seen_at DESC (recently seen first) → created_at DESC (newest accounts)
    // Use a JS-generated ISO threshold so the same SQL works in both SQLite and PostgreSQL.
    const onlineThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const orderBy = `
      CASE WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= ? THEN 0 ELSE 1 END ASC,
      CASE WHEN u.last_seen_at IS NOT NULL THEN 0 ELSE 1 END ASC,
      u.last_seen_at DESC,
      u.created_at DESC
    `;

    // Fetch limit+1 to know if there are more pages
    params.push(onlineThresholdIso, limit + 1, offset);
    const rows = await queryAll(
      db,
      `SELECT u.*,
        (SELECT m.filename FROM media m WHERE m.user_id = u.id AND m.is_main = 1 AND m.is_private = 0 ORDER BY m.created_at DESC LIMIT 1) as main_filename
       FROM users u
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      params
    );

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit);

    res.json({
      users: slice.map((r: any) => {
        const u = rowToPublicUser(r, presence?.isOnline ? presence.isOnline(String(r.id)) : false);
        return {
          ...u,
          mainMediaUrl: r.main_filename ? `/uploads/${String(r.main_filename)}` : null,
        };
      }),
      hasMore,
      page,
    });
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
        u.id as author_id, u.name as author_name, u.avatar as author_avatar,
        u.gender as author_gender, u.city as author_city, u.state as author_state
      FROM testimonials t
      JOIN users u ON u.id = t.author_user_id
      WHERE t.profile_user_id = ?
      ${whereStatus}
      ORDER BY t.created_at DESC
      LIMIT 50
    `,
      params
    );
    const testimonialIds = rows.map((r: any) => String(r.id));
    const mediaByTestimonialId = new Map<string, Array<{ id: string; url: string; mimeType: string }>>();
    if (testimonialIds.length > 0) {
      const ph = testimonialIds.map(() => '?').join(', ');
      const mediaRows = await queryAll(
        db,
        `SELECT tm.testimonial_id, m.id, m.filename, m.mime_type
         FROM testimonial_media tm
         JOIN media m ON m.id = tm.media_id
         WHERE tm.testimonial_id IN (${ph})
         ORDER BY tm.testimonial_id, tm.sort_order`,
        testimonialIds
      );
      for (const m of mediaRows as any[]) {
        const tid = String(m.testimonial_id);
        if (!mediaByTestimonialId.has(tid)) mediaByTestimonialId.set(tid, []);
        mediaByTestimonialId.get(tid)!.push({ id: String(m.id), url: `/uploads/${m.filename}`, mimeType: String(m.mime_type || '') });
      }
    }
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        content: r.content,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        media: mediaByTestimonialId.get(String(r.id)) ?? [],
        author: {
          id: r.author_id,
          name: r.author_name,
          avatar: r.author_avatar,
          gender: r.author_gender ?? null,
          city: r.author_city ?? null,
          state: r.author_state ?? null,
        },
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
        "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND is_private = 1 AND mime_type LIKE 'image/%' AND (source IS NULL OR source != 'chat') ORDER BY created_at DESC LIMIT 50",
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
      "SELECT id, filename, mime_type, is_private, is_main, created_at FROM media WHERE user_id = ? AND is_private = 0 AND mime_type LIKE 'image/%' AND (source IS NULL OR source != 'chat') ORDER BY created_at DESC LIMIT 50",
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

  app.get('/api/users/:userId/posts', requireAuth(env, db), async (req, res) => {
    const ownerId = String(req.params.userId || '');
    if (!ownerId) { res.status(400).json({ error: 'invalid_input' }); return; }

    const limit = Math.min(Number(req.query.limit) || 30, 60);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;
    const videosOnly = req.query.videosOnly === 'true';

    const rows = await queryAll(
      db,
      `SELECT p.id, p.content, p.created_at, p.media_ids_json
       FROM posts p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [ownerId, limit + 1, offset]
    ) as any[];

    const slice = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    const mediaIdSet = new Set<string>();
    const mediaIdsByPostId = new Map<string, string[]>();
    for (const r of slice) {
      const ids = Array.isArray(safeJsonParse(r.media_ids_json)) ? safeJsonParse(r.media_ids_json) : [];
      const list = (ids as any[]).filter((x: any) => typeof x === 'string') as string[];
      mediaIdsByPostId.set(String(r.id), list);
      for (const mid of list) mediaIdSet.add(mid);
    }

    const mediaById = new Map<string, { id: string; url: string | null; mimeType: string | null }>();
    if (mediaIdSet.size > 0) {
      const mediaIds = Array.from(mediaIdSet);
      const placeholders = mediaIds.map(() => '?').join(', ');
      const mediaRows = await queryAll(
        db,
        `SELECT id, filename, mime_type FROM media WHERE is_private = 0 AND id IN (${placeholders})`,
        mediaIds
      ) as any[];
      for (const mr of mediaRows) {
        mediaById.set(String(mr.id), {
          id: String(mr.id),
          url: `/uploads/${mr.filename}`,
          mimeType: mr.mime_type ? String(mr.mime_type) : null,
        });
      }
    }

    const posts = slice
      .map((r: any) => {
        const media = (mediaIdsByPostId.get(String(r.id)) ?? [])
          .map((mid) => mediaById.get(mid))
          .filter(Boolean) as { id: string; url: string | null; mimeType: string | null }[];
        if (videosOnly && !media.some((m) => String(m.mimeType || '').startsWith('video/'))) return null;
        return {
          id: r.id,
          content: r.content,
          createdAt: r.created_at,
          media,
        };
      })
      .filter(Boolean);

    res.json({ posts, hasMore });
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

  app.get('/api/private-photos/requests', requireAuth(env, db), async (req, res) => {
    const status = String(req.query.status || 'all');
    const allowedStatuses = new Set(['all', 'pending', 'approved', 'denied']);
    if (!allowedStatuses.has(status)) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const params: any[] = [req.auth!.userId];
    const whereStatus = status === 'all' ? '' : 'AND r.status = ?';
    if (status !== 'all') params.push(status);

    const rows = await queryAll(
      db,
      `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.updated_at,
        u.id as requester_id,
        u.name as requester_name,
        u.avatar as requester_avatar,
        u.gender as requester_gender,
        u.city as requester_city,
        u.state as requester_state
      FROM private_photo_access_requests r
      JOIN users u ON u.id = r.requester_user_id
      WHERE r.owner_user_id = ?
      ${whereStatus}
      ORDER BY
        CASE r.status
          WHEN 'pending' THEN 0
          WHEN 'approved' THEN 1
          WHEN 'denied' THEN 2
          ELSE 3
        END,
        COALESCE(r.updated_at, r.created_at) DESC
      LIMIT 200
    `,
      params
    );

    res.json(
      rows.map((r: any) => ({
        id: String(r.id),
        status: String(r.status),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        requester: {
          id: String(r.requester_id),
          name: String(r.requester_name),
          avatar: r.requester_avatar ?? null,
          gender: r.requester_gender ?? null,
          city: r.requester_city ?? null,
          state: r.requester_state ?? null,
        },
      }))
    );
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

  app.post('/api/private-photos/requests/:requestId/revoke', requireAuth(env, db), async (req, res) => {
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
        type: 'private_photos.revoked',
        title: 'Acesso às fotos privadas revogado',
        description: `${owner?.name ? String(owner.name) : 'O usuário'} revogou o acesso às fotos privadas.`,
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

  app.post('/api/media/upload', requireAuth(env, db), uploadRateLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'missing_file' });
      return;
    }

    const isPrivate = String(req.query.isPrivate || '') === '1';
    const mediaSource = ['chat', 'post', 'profile'].includes(String(req.query.source || '')) ? String(req.query.source) : 'post';
    const mime = req.file.mimetype || '';
    const fileSize = Number(req.file.size || 0);

    // Enforce per-type size limits
    if (mime.startsWith('image/') && fileSize > IMAGE_MAX_BYTES) {
      res.status(413).json({ error: 'file_too_large', maxBytes: IMAGE_MAX_BYTES });
      return;
    }
    if (mime.startsWith('video/') && fileSize > VIDEO_MAX_BYTES) {
      res.status(413).json({ error: 'file_too_large', maxBytes: VIDEO_MAX_BYTES });
      return;
    }
    if (isPrivate && !mime.startsWith('image/')) {
      res.status(400).json({ error: 'private_photos_images_only' });
      return;
    }

    const storedFile = mime.startsWith('video/')
      ? await compressUploadedVideo(req.file)
      : mime.startsWith('image/') && mime !== 'image/gif'
      ? await compressUploadedImage(req.file)
      : {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size,
        };

    const id = randomUUID();
    await run(
      db,
      'INSERT INTO media (id, user_id, filename, original_name, mime_type, size, is_private, is_main, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
      [id, req.auth!.userId, storedFile.filename, req.file.originalname, storedFile.mimetype, storedFile.size, isPrivate ? 1 : 0, mediaSource, nowIso()]
    );
    await persist();
    if (isPrivate) {
      const token = jwt.sign({ mediaId: id }, env.JWT_SECRET, { expiresIn: '30m' });
      res.json({ id, url: `/private-uploads/${id}?token=${encodeURIComponent(token)}` });
      return;
    }
    res.json({ id, url: `/uploads/${storedFile.filename}` });
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

  app.patch('/api/media/:mediaId/visibility', requireAuth(env, db), async (req, res) => {
    const mediaId = req.params.mediaId;
    const media = (await queryOne(
      db,
      'SELECT id, filename, is_private, is_main FROM media WHERE id = ? AND user_id = ?',
      [mediaId, req.auth!.userId]
    )) as any;
    if (!media) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const isPrivate = !!req.body?.isPrivate;
    if (isPrivate && !!media.is_main) {
      res.status(400).json({ error: 'cannot_make_main_photo_private' });
      return;
    }

    await run(db, 'UPDATE media SET is_private = ? WHERE id = ?', [isPrivate ? 1 : 0, mediaId]);
    await persist();

    if (isPrivate) {
      const token = jwt.sign({ mediaId }, env.JWT_SECRET, { expiresIn: '30m' });
      res.json({ ok: true, id: mediaId, isPrivate: true, url: `/private-uploads/${mediaId}?token=${encodeURIComponent(token)}` });
      return;
    }

    const filename = media?.filename ? String(media.filename) : '';
    res.json({ ok: true, id: mediaId, isPrivate: false, url: filename ? `/uploads/${filename}` : null });
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
    const city = req.query.city ? String(req.query.city) : null;
    const state = req.query.state ? String(req.query.state) : null;
    const lookingFor = parseAudiencePreferences(req.query.lookingFor ? String(req.query.lookingFor) : '');

    let rows: any[] = [];
    if (lookingFor.length > 0) {
      const placeholders = lookingFor.map(() => '?').join(', ');
      const params: any[] = [...lookingFor];
      const orderParts: string[] = [];
      const audiencePriority = buildAudiencePriorityOrder('gender', lookingFor);
      orderParts.push(...audiencePriority.orderParts);
      params.push(...audiencePriority.params);
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
        `SELECT * FROM users WHERE is_admin = 0 AND (is_banned = 0 OR is_banned IS NULL) AND (is_deactivated = 0 OR is_deactivated IS NULL) AND gender IN (${placeholders}) ORDER BY ${orderBy} LIMIT 12`,
        params
      );
    }

    if (rows.length === 0) {
      rows = await queryAll(db, `SELECT * FROM users WHERE is_admin = 0 AND (is_banned = 0 OR is_banned IS NULL) AND (is_deactivated = 0 OR is_deactivated IS NULL) ORDER BY ${baseAudienceRankingSql('gender')}, created_at DESC LIMIT 12`);
    }

    res.json(rows.map((row) => rowToPublicUser(row)));
  });

  app.get('/api/match/cards', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const me = (await queryOne(db, 'SELECT lat, lon, city, looking_for_json FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const myLat = me?.lat ? Number(me.lat) : null;
    const myLon = me?.lon ? Number(me.lon) : null;
    const myCity = String(me?.city || '').trim() || null;
    const myLookingFor = Array.isArray(safeJsonParse(me?.looking_for_json)) ? safeJsonParse(me?.looking_for_json) as string[] : [];

    const { city, ageRange, genders, radar, search } = req.query;
    const params: any[] = [req.auth!.userId];
    let whereClause = 'u.id != ?';
    whereClause += ` AND NOT EXISTS (
      SELECT 1
      FROM likes l
      WHERE l.user_id = ?
        AND l.target_type = 'user'
        AND l.target_id = u.id
    )`;
    params.push(req.auth!.userId);
    whereClause += ` AND NOT EXISTS (
      SELECT 1
      FROM match_passes mp
      WHERE mp.user_id = ?
        AND mp.passed_user_id = u.id
    )`;
    params.push(req.auth!.userId);
    whereClause += ` AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
         OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
    )`;
    params.push(req.auth!.userId, req.auth!.userId);
    const effectiveGenders = genders ? String(genders).split(',').map((item) => item.trim()).filter(Boolean) : myLookingFor;

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

    if (effectiveGenders.length > 0) {
      whereClause += ` AND u.gender IN (${effectiveGenders.map(() => '?').join(',')})`;
      params.push(...effectiveGenders);
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

    const cityPrioritySql = myCity
      ? "CASE WHEN LOWER(TRIM(COALESCE(u.city, ''))) = LOWER(TRIM(?)) THEN 0 ELSE 1 END,"
      : '';
    if (myCity) params.push(myCity);

    params.push(nowIso());
    const audiencePriority = buildAudiencePriorityOrder('u.gender', effectiveGenders);
    params.push(...audiencePriority.params);

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
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'image/%' AND (m.source IS NULL OR m.source != 'chat')
        ) as photos_count,
        (
          SELECT COUNT(*)
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'video/%' AND (m.source IS NULL OR m.source != 'chat')
        ) as videos_count
      FROM users u
      WHERE ${whereClause}
      ORDER BY 
        ${cityPrioritySql}
        CASE WHEN u.is_premium = 1 OR (u.trial_ends_at IS NOT NULL AND u.trial_ends_at > ?) THEN 0 ELSE 1 END,
        ${audiencePriority.orderParts.length > 0 ? `${audiencePriority.orderParts.join(', ')},` : `${baseAudienceRankingSql('u.gender')},`}
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
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

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
          title: 'Você recebeu um match',
          description: `${actorName} deu match com você.`,
          dataJson: { actorId: myId, actorName },
        }
      );
    }
    await run(db, 'DELETE FROM match_passes WHERE user_id = ? AND passed_user_id = ?', [myId, targetUserId]);
    await persist();

    res.json({ ok: true });
  });

  app.post('/api/match/pass', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const schema = z.object({ userId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const targetUserId = parsed.data.userId;
    const myId = req.auth!.userId;
    if (targetUserId === myId) {
      res.status(400).json({ error: 'cannot_pass_self' });
      return;
    }

    const existing = (await queryOne(db, 'SELECT id FROM match_passes WHERE user_id = ? AND passed_user_id = ? LIMIT 1', [
      myId,
      targetUserId,
    ])) as any;

    if (!existing?.id) {
      await run(db, 'INSERT INTO match_passes (id, user_id, passed_user_id, created_at) VALUES (?, ?, ?, ?)', [
        randomUUID(),
        myId,
        targetUserId,
        nowIso(),
      ]);
    }
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/match/liked', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const rows = await queryAll(
      db,
      `
      SELECT
        u.*,
        l.created_at as liked_at,
        (
          SELECT m.filename
          FROM media m
          WHERE m.user_id = u.id AND m.is_main = 1 AND m.is_private = 0
          ORDER BY m.created_at DESC
          LIMIT 1
        ) as main_filename
      FROM likes l
      JOIN users u ON u.id = l.target_id
      WHERE l.user_id = ?
        AND l.target_type = 'user'
      ORDER BY l.created_at DESC
      LIMIT 200
    `,
      [req.auth!.userId]
    );

    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    res.json(
      rows.map((r: any) => ({
        ...rowToPublicUser(r, presence?.isOnline ? presence.isOnline(String(r.id)) : false),
        likedAt: r.liked_at,
        mainMediaUrl: r.main_filename ? `/uploads/${String(r.main_filename)}` : null,
      }))
    );
  });

  app.get('/api/match/suggestions', requireAuth(env, db), (_req, res) => {
    res.json([]);
  });

  app.post('/api/radar', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const me = (await queryOne(
      db,
      'SELECT id, name, gender, city, state, looking_for_json, is_premium, trial_ends_at FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    if (!hasPremiumAccess(me, subscriptionsEnabled)) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const dailyUsedRow = (await queryOne(
      db,
      'SELECT COUNT(*) as c FROM radar_broadcasts WHERE user_id = ? AND created_at >= ?',
      [req.auth!.userId, startOfCurrentDayIso()]
    )) as any;
    const weeklyUsedRow = (await queryOne(
      db,
      'SELECT COUNT(*) as c FROM radar_broadcasts WHERE user_id = ? AND created_at >= ?',
      [req.auth!.userId, startOfCurrentWeekIso()]
    )) as any;
    const dailyUsed = Number(dailyUsedRow?.c || 0);
    const weeklyUsed = Number(weeklyUsedRow?.c || 0);
    if (dailyUsed >= 1) {
      res.status(403).json({ error: 'radar_daily_limit', dailyLimit: 1, dailyUsed });
      return;
    }
    if (weeklyUsed >= 3) {
      res.status(403).json({ error: 'radar_weekly_limit', weeklyLimit: 3, weeklyUsed });
      return;
    }

    const schema = z.object({
      city: z.string().min(1).max(120),
      state: z.string().min(2).max(2),
      message: z.string().min(1).max(200),
      targetGender: z.array(z.enum(['all', 'female', 'male', 'couple'])).min(1).max(4),
      radius: z.coerce.number().int().min(5).max(500),
      durationHours: z.coerce.number().int().min(1).max(72),
      isAnonymous: z.boolean().optional(),
      showOnlyOnline: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const city = String(parsed.data.city).trim();
    const state = String(parsed.data.state).trim().toUpperCase();
    const cityRow = (await queryOne(
      db,
      'SELECT name, state, lat, lon FROM cities WHERE LOWER(name) = LOWER(?) AND UPPER(state) = UPPER(?) LIMIT 1',
      [city, state]
    )) as any;

    const createdAt = nowIso();
    const expiresDate = new Date(createdAt);
    expiresDate.setHours(expiresDate.getHours() + parsed.data.durationHours);
    const id = randomUUID();
    const normalizedTargetGender = Array.from(new Set(parsed.data.targetGender));
    const senderLookingFor = Array.isArray(safeJsonParse(me.looking_for_json)) ? (safeJsonParse(me.looking_for_json) as string[]) : [];
    const radarCity = cityRow?.name ? String(cityRow.name) : city;
    const radarState = cityRow?.state ? String(cityRow.state).toUpperCase() : state;
    const radarLat = cityRow?.lat != null ? Number(cityRow.lat) : null;
    const radarLon = cityRow?.lon != null ? Number(cityRow.lon) : null;

    const radarMessage = parsed.data.message.trim();

    await run(
      db,
      `INSERT INTO radar_broadcasts (
        id, user_id, city, state, city_lat, city_lon, message, target_genders_json,
        radius_km, duration_hours, is_anonymous, only_online, created_at, expires_at, deactivated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        req.auth!.userId,
        radarCity,
        radarState,
        radarLat,
        radarLon,
        radarMessage,
        JSON.stringify(normalizedTargetGender),
        parsed.data.radius,
        parsed.data.durationHours,
        parsed.data.isAnonymous ? 1 : 0,
        parsed.data.showOnlyOnline ? 1 : 0,
        createdAt,
        expiresDate.toISOString(),
        null,
      ]
    );

    const possibleRecipients = (await queryAll(
      db,
      `SELECT id, name, gender, city, state, lat, lon, looking_for_json
       FROM users
       WHERE id != ?`,
      [req.auth!.userId]
    )) as any[];

    let deliveredCount = 0;
    for (const candidate of possibleRecipients) {
      if (!radarTargetsUser(normalizedTargetGender, candidate.gender ?? null)) continue;
      if (parsed.data.showOnlyOnline && presence?.isOnline && !presence.isOnline(String(candidate.id))) continue;

      const candidateLookingFor = Array.isArray(safeJsonParse(candidate.looking_for_json)) ? (safeJsonParse(candidate.looking_for_json) as string[]) : [];
      if (!radarProfilesAreCompatible(
        { gender: me.gender ?? null, lookingFor: senderLookingFor },
        { gender: candidate.gender ?? null, lookingFor: candidateLookingFor }
      )) {
        continue;
      }

      let matchesLocation = false;
      const candidateLat = candidate.lat != null ? Number(candidate.lat) : null;
      const candidateLon = candidate.lon != null ? Number(candidate.lon) : null;
      if (radarLat !== null && radarLon !== null && candidateLat !== null && candidateLon !== null) {
        matchesLocation = haversineKm({ lat: radarLat, lon: radarLon }, { lat: candidateLat, lon: candidateLon }) <= parsed.data.radius;
      } else {
        matchesLocation =
          normalizeRadarText(radarCity) === normalizeRadarText(candidate.city) &&
          normalizeRadarText(radarState) === normalizeRadarText(candidate.state);
      }
      if (!matchesLocation) continue;

      const existingDelivery = await queryOne(
        db,
        'SELECT id FROM radar_broadcast_views WHERE broadcast_id = ? AND viewer_user_id = ? LIMIT 1',
        [id, String(candidate.id)]
      );
      if (existingDelivery) continue;

      const viewId = randomUUID();
      await run(
        db,
        'INSERT INTO radar_broadcast_views (id, broadcast_id, viewer_user_id, delivered_at, viewed_at, contacted_at) VALUES (?, ?, ?, ?, ?, ?)',
        [viewId, id, String(candidate.id), createdAt, null, null]
      );

      const pair = [req.auth!.userId, String(candidate.id)].sort((a, b) => a.localeCompare(b));
      let conversation = (await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
      if (!conversation?.id) {
        const conversationId = randomUUID();
        await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [conversationId, pair[0], pair[1], nowIso()]);
        conversation = { id: conversationId };
      }
      const messageId = randomUUID();
      const messageCreatedAt = nowIso();
      await run(
        db,
        'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [messageId, String(conversation.id), req.auth!.userId, radarMessage, null, 0, 1, messageCreatedAt]
      );
      io?.to(String(conversation.id)).emit('message.created', {
        id: messageId,
        conversationId: String(conversation.id),
        senderId: req.auth!.userId,
        content: radarMessage,
        mediaId: null,
        mediaUrl: null,
        mediaMimeType: null,
        clientId: null,
        isViewOnce: false,
        isDelivered: true,
        createdAt: messageCreatedAt,
      });

      deliveredCount += 1;
      await createNotification(
        { db, io },
        {
          userId: String(candidate.id),
          type: 'radar.received',
          title: 'Esse perfil ativou o radar para voce',
          description: `${String(parsed.data.isAnonymous ? 'Um perfil discreto' : me.name || 'Alguem')} ativou o radar e esta buscando alguem com o seu perfil para uma brincadeira na sua regiao.`,
          dataJson: {
            broadcastId: id,
            senderId: req.auth!.userId,
            senderName: parsed.data.isAnonymous ? 'Perfil discreto' : String(me.name || 'Alguem'),
            city: radarCity,
            state: radarState,
            conversationId: String(conversation.id),
          },
        }
      );
    }
    await persist();

    res.json({
      ok: true,
      id,
      createdAt,
      expiresAt: expiresDate.toISOString(),
      deliveredCount,
      usage: {
        dailyLimit: 1,
        dailyUsed: dailyUsed + 1,
        dailyRemaining: Math.max(0, 1 - (dailyUsed + 1)),
        weeklyLimit: 3,
        weeklyUsed: weeklyUsed + 1,
        weeklyRemaining: Math.max(0, 3 - (weeklyUsed + 1)),
      },
    });
  });

  app.post('/api/radar/:broadcastId/deactivate', requireAuth(env, db), async (req, res) => {
    const broadcastId = String(req.params.broadcastId || '');
    const row = (await queryOne(db, 'SELECT id, user_id, deactivated_at FROM radar_broadcasts WHERE id = ? LIMIT 1', [broadcastId])) as any;
    if (!row || String(row.user_id) !== req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await run(db, 'UPDATE radar_broadcasts SET deactivated_at = ? WHERE id = ?', [nowIso(), broadcastId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/radar', requireAuth(env, db), async (req, res) => {
    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    const io = req.app.get('io') as SocketIOServer | undefined;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const me = (await queryOne(
      db,
      'SELECT id, name, avatar, gender, city, state, lat, lon, looking_for_json, is_premium, trial_ends_at FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    if (!me) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const dailyUsedRow = (await queryOne(
      db,
      'SELECT COUNT(*) as c FROM radar_broadcasts WHERE user_id = ? AND created_at >= ?',
      [req.auth!.userId, startOfCurrentDayIso()]
    )) as any;
    const weeklyUsedRow = (await queryOne(
      db,
      'SELECT COUNT(*) as c FROM radar_broadcasts WHERE user_id = ? AND created_at >= ?',
      [req.auth!.userId, startOfCurrentWeekIso()]
    )) as any;
    const myLookingFor = Array.isArray(safeJsonParse(me.looking_for_json)) ? (safeJsonParse(me.looking_for_json) as string[]) : [];

    const myRows = await queryAll(
      db,
      `SELECT * FROM radar_broadcasts WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      [req.auth!.userId]
    );
    const myIds = myRows.map((r: any) => String(r.id));
    const analyticsRows =
      myIds.length > 0
        ? await queryAll(
            db,
            `SELECT
              rv.broadcast_id, rv.delivered_at, rv.viewed_at, rv.contacted_at,
              u.id as viewer_id, u.name as viewer_name, u.avatar as viewer_avatar, u.gender as viewer_gender, u.city as viewer_city, u.state as viewer_state
             FROM radar_broadcast_views rv
             JOIN users u ON u.id = rv.viewer_user_id
             WHERE rv.broadcast_id IN (${myIds.map(() => '?').join(', ')})
             ORDER BY COALESCE(rv.viewed_at, rv.delivered_at) DESC`,
            myIds
          )
        : [];

    const analyticsByBroadcast = new Map<string, any[]>();
    for (const row of analyticsRows as any[]) {
      const list = analyticsByBroadcast.get(String(row.broadcast_id)) ?? [];
      list.push(row);
      analyticsByBroadcast.set(String(row.broadcast_id), list);
    }

    const activeRows = await queryAll(
      db,
      `SELECT
        rb.*,
        u.id as sender_id, u.name as sender_name, u.avatar as sender_avatar, u.gender as sender_gender, u.city as sender_city, u.state as sender_state, u.looking_for_json as sender_looking_for_json
       FROM radar_broadcasts rb
       JOIN users u ON u.id = rb.user_id
       WHERE rb.user_id != ?
         AND rb.deactivated_at IS NULL
         AND rb.expires_at > ?
       ORDER BY rb.created_at DESC
       LIMIT 100`,
      [req.auth!.userId, nowIso()]
    );

    const incoming: any[] = [];
    for (const row of activeRows as any[]) {
      const targetGenders = Array.isArray(safeJsonParse(row.target_genders_json)) ? (safeJsonParse(row.target_genders_json) as string[]) : ['all'];
      if (!radarTargetsUser(targetGenders, me.gender)) continue;
      if (row.only_online && presence?.isOnline && !presence.isOnline(String(req.auth!.userId))) continue;
      const senderLookingFor = Array.isArray(safeJsonParse(row.sender_looking_for_json)) ? (safeJsonParse(row.sender_looking_for_json) as string[]) : [];
      if (!radarProfilesAreCompatible(
        { gender: row.sender_gender ?? null, lookingFor: senderLookingFor },
        { gender: me.gender ?? null, lookingFor: myLookingFor }
      )) continue;

      let matchesLocation = false;
      const radarLat = row.city_lat != null ? Number(row.city_lat) : null;
      const radarLon = row.city_lon != null ? Number(row.city_lon) : null;
      const myLat = me.lat != null ? Number(me.lat) : null;
      const myLon = me.lon != null ? Number(me.lon) : null;
      if (radarLat !== null && radarLon !== null && myLat !== null && myLon !== null) {
        matchesLocation = haversineKm({ lat: radarLat, lon: radarLon }, { lat: myLat, lon: myLon }) <= Number(row.radius_km || 25);
      } else {
        matchesLocation =
          normalizeRadarText(row.city) === normalizeRadarText(me.city) &&
          normalizeRadarText(row.state) === normalizeRadarText(me.state);
      }
      if (!matchesLocation) continue;

      const existingView = (await queryOne(
        db,
        'SELECT id, delivered_at, viewed_at, contacted_at FROM radar_broadcast_views WHERE broadcast_id = ? AND viewer_user_id = ? LIMIT 1',
        [String(row.id), req.auth!.userId]
      )) as any;
      if (existingView?.id) {
        if (!existingView.viewed_at) {
          await run(db, 'UPDATE radar_broadcast_views SET viewed_at = ? WHERE id = ?', [nowIso(), String(existingView.id)]);
          await createNotification(
            { db, io },
            {
              userId: String(row.user_id),
              type: 'radar.viewed',
              title: 'Seu radar foi visualizado',
              description: `${String(me.name || 'Alguém')} abriu seu radar em ${String(row.city)}, ${String(row.state)}.`,
              dataJson: { broadcastId: String(row.id), viewerId: req.auth!.userId, viewerName: String(me.name || 'Alguém') },
            }
          );
        }
      } else {
        await run(
          db,
          'INSERT INTO radar_broadcast_views (id, broadcast_id, viewer_user_id, delivered_at, viewed_at, contacted_at) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), String(row.id), req.auth!.userId, nowIso(), nowIso(), null]
        );
        await createNotification(
          { db, io },
          {
            userId: String(row.user_id),
            type: 'radar.viewed',
            title: 'Seu radar foi visualizado',
            description: `${String(me.name || 'Alguém')} abriu seu radar em ${String(row.city)}, ${String(row.state)}.`,
            dataJson: { broadcastId: String(row.id), viewerId: req.auth!.userId, viewerName: String(me.name || 'Alguém') },
          }
        );
      }

      incoming.push({
        id: String(row.id),
        city: String(row.city),
        state: String(row.state),
        message: String(row.message),
        targetGender: targetGenders,
        radius: Number(row.radius_km || 25),
        durationHours: Number(row.duration_hours || 24),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        isAnonymous: !!row.is_anonymous,
        showOnlyOnline: !!row.only_online,
        sender: {
          id: String(row.sender_id),
          name: !!row.is_anonymous ? 'Perfil discreto' : String(row.sender_name),
          avatar: !!row.is_anonymous ? null : row.sender_avatar ?? null,
          gender: !!row.is_anonymous ? null : row.sender_gender ?? null,
          city: row.sender_city ?? null,
          state: row.sender_state ?? null,
        },
      });
    }
    await persist();

    res.json({
      canCreate: hasPremiumAccess(me, subscriptionsEnabled),
      usage: {
        dailyLimit: 1,
        dailyUsed: Number(dailyUsedRow?.c || 0),
        dailyRemaining: Math.max(0, 1 - Number(dailyUsedRow?.c || 0)),
        weeklyLimit: 3,
        weeklyUsed: Number(weeklyUsedRow?.c || 0),
        weeklyRemaining: Math.max(0, 3 - Number(weeklyUsedRow?.c || 0)),
      },
      myBroadcasts: myRows.map((row: any) => {
        const analytics = analyticsByBroadcast.get(String(row.id)) ?? [];
        return {
          id: String(row.id),
          city: String(row.city),
          state: String(row.state),
          message: String(row.message),
          targetGender: Array.isArray(safeJsonParse(row.target_genders_json)) ? safeJsonParse(row.target_genders_json) : ['all'],
          radius: Number(row.radius_km || 25),
          durationHours: Number(row.duration_hours || 24),
          createdAt: String(row.created_at),
          expiresAt: String(row.expires_at),
          isActive: !row.deactivated_at && new Date(String(row.expires_at)).getTime() > Date.now(),
          isAnonymous: !!row.is_anonymous,
          showOnlyOnline: !!row.only_online,
          deliveriesCount: analytics.length,
          viewsCount: analytics.filter((item) => !!item.viewed_at).length,
          responsesCount: analytics.filter((item) => !!item.contacted_at).length,
          deliveries: analytics.map((item) => ({
            deliveredAt: item.delivered_at,
            viewedAt: item.viewed_at,
            contactedAt: item.contacted_at,
            viewer: {
              id: String(item.viewer_id),
              name: String(item.viewer_name),
              avatar: item.viewer_avatar ?? null,
              gender: item.viewer_gender ?? null,
              city: item.viewer_city ?? null,
              state: item.viewer_state ?? null,
            },
          })),
        };
      }),
      incoming,
    });
  });

  app.post('/api/radar/:broadcastId/contact', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const broadcastId = String(req.params.broadcastId || '');
    const radar = (await queryOne(
      db,
      'SELECT id, user_id, message, deactivated_at, expires_at FROM radar_broadcasts WHERE id = ? LIMIT 1',
      [broadcastId]
    )) as any;
    if (!radar || String(radar.user_id) === req.auth!.userId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (radar.deactivated_at || new Date(String(radar.expires_at)).getTime() <= Date.now()) {
      res.status(410).json({ error: 'expired' });
      return;
    }

    const existingView = (await queryOne(
      db,
      'SELECT id FROM radar_broadcast_views WHERE broadcast_id = ? AND viewer_user_id = ? LIMIT 1',
      [broadcastId, req.auth!.userId]
    )) as any;
    const firstContact = !existingView?.contacted_at;
    if (existingView?.id) {
      await run(db, 'UPDATE radar_broadcast_views SET contacted_at = ?, viewed_at = COALESCE(viewed_at, ?) WHERE id = ?', [
        nowIso(),
        nowIso(),
        String(existingView.id),
      ]);
    } else {
      await run(
        db,
        'INSERT INTO radar_broadcast_views (id, broadcast_id, viewer_user_id, delivered_at, viewed_at, contacted_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), broadcastId, req.auth!.userId, nowIso(), nowIso(), nowIso()]
      );
    }

    const pair = [req.auth!.userId, String(radar.user_id)].sort();
    let conv = (await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
    if (!conv?.id) {
      const convId = randomUUID();
      await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [convId, pair[0], pair[1], nowIso()]);
      conv = { id: convId };
    }
    await persist();

    if (firstContact) {
      const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
      await createNotification(
        { db, io },
        {
          userId: String(radar.user_id),
          type: 'radar.contacted',
          title: 'Seu radar gerou conversa',
          description: `${String(actor?.name || 'Alguém')} abriu conversa a partir do seu radar.`,
          dataJson: { broadcastId, actorId: req.auth!.userId, actorName: String(actor?.name || 'Alguém'), conversationId: String(conv.id) },
        }
      );
    }

    res.json({ ok: true, conversationId: String(conv.id) });
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
      SELECT * FROM (
        SELECT c.id, c.user_a_id, c.user_b_id, c.created_at, c.is_highlighted, c.highlight_note, c.highlight_color,
          ua.name as user_a_name, ua.avatar as user_a_avatar, ua.gender as user_a_gender, ua.city as user_a_city, ua.state as user_a_state,
          ub.name as user_b_name, ub.avatar as user_b_avatar, ub.gender as user_b_gender, ub.city as user_b_city, ub.state as user_b_state,
          (
            SELECT COUNT(*) FROM messages m
            WHERE m.conversation_id = c.id
            AND m.sender_id != ?
            AND m.is_read = 0
          ) as unread_count,
          (
            SELECT m2.created_at FROM messages m2
            WHERE m2.conversation_id = c.id
            ORDER BY m2.created_at DESC LIMIT 1
          ) as last_message_at
        FROM conversations c
        JOIN users ua ON ua.id = c.user_a_id
        JOIN users ub ON ub.id = c.user_b_id
        WHERE c.user_a_id = ? OR c.user_b_id = ?
      ) conversations_with_meta
      ORDER BY is_highlighted DESC, COALESCE(last_message_at, created_at) DESC
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
                gender: r.user_b_gender ?? null,
                city: r.user_b_city ?? null,
                state: r.user_b_state ?? null,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_b_id)) : false
              }
            : { 
                id: r.user_a_id, 
                name: r.user_a_name, 
                avatar: r.user_a_avatar,
                gender: r.user_a_gender ?? null,
                city: r.user_a_city ?? null,
                state: r.user_a_state ?? null,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_a_id)) : false
              };
        return { 
          id: r.id, 
          user: other, 
          createdAt: r.created_at,
          lastMessageAt: r.last_message_at || null,
          unreadCount: Number(r.unread_count || 0),
          isHighlighted: Number(r.is_highlighted || 0) === 1,
          highlightNote: typeof r.highlight_note === 'string' ? r.highlight_note : null,
          highlightColor: typeof r.highlight_color === 'string' ? r.highlight_color : null
        };
      })
    );
  });

  app.post('/api/conversations', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

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
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const viewer = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const canViewReceived = hasPremiumAccess(viewer, subscriptionsEnabled);

    // Mark messages as read
    await run(db, 'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [conversationId, req.auth!.userId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(conversationId).emit('message.read', { conversationId, readerId: req.auth!.userId });

    const rows = await queryAll(
      db,
      `
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.media_id, m.is_view_once, m.is_viewed, m.is_delivered, m.created_at, m.is_read,
             m.deleted_for_all, m.deleted_by_ids,
             med.filename as media_filename, med.mime_type as media_mime_type
      FROM messages m
      LEFT JOIN media med ON med.id = m.media_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
      LIMIT 200
    `,
      [conversationId]
    );
    const viewerId = req.auth!.userId;
    res.json(
      rows.map((m: any) => {
        const deletedForAll = !!m.deleted_for_all;
        let deletedByIds: string[] = [];
        try { deletedByIds = JSON.parse(m.deleted_by_ids || '[]'); } catch { deletedByIds = []; }
        const deletedForMe = deletedForAll || deletedByIds.includes(viewerId);
        return {
          id: m.id,
          conversationId: m.conversation_id,
          senderId: m.sender_id,
          content: deletedForMe ? null : (canViewReceived || m.sender_id === viewerId ? m.content : null),
          mediaId: deletedForMe ? null : (m.is_view_once && m.is_viewed ? null : m.media_id),
          mediaUrl: deletedForMe ? null : (m.is_view_once && m.is_viewed ? null : (m.media_filename ? `/uploads/${m.media_filename}` : null)),
          mediaMimeType: deletedForMe ? null : (m.is_view_once && m.is_viewed ? null : m.media_mime_type),
          isViewOnce: !!m.is_view_once,
          isViewed: !!m.is_viewed,
          isDelivered: !!m.is_delivered,
          isLocked: !deletedForMe && !canViewReceived && m.sender_id !== viewerId,
          createdAt: m.created_at,
          isRead: !!m.is_read,
          isDeletedForAll: deletedForAll,
          isDeletedForMe: deletedForMe,
        };
      })
    );
  });

  app.post('/api/messages/:messageId/view', requireAuth(env, db), async (req, res) => {
    const messageId = req.params.messageId;
    const msg = (await queryOne(db, 'SELECT id, conversation_id, sender_id, is_view_once, is_viewed FROM messages WHERE id = ?', [messageId])) as any;

    if (!msg) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // Verify the user is a participant in this conversation
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [String(msg.conversation_id)])) as any;
    if (!conv || (String(conv.user_a_id) !== req.auth!.userId && String(conv.user_b_id) !== req.auth!.userId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    // Only the recipient can mark a view-once message as viewed
    if (String(msg.sender_id) === req.auth!.userId) {
      res.status(400).json({ error: 'cannot_view_own_message' });
      return;
    }

    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
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

  app.delete('/api/messages/:messageId', requireAuth(env, db), async (req, res) => {
    try {
      const messageId = req.params.messageId;
      const schema = z.object({ forEveryone: z.boolean().optional() });
      const parsed = schema.safeParse(req.body);
      const forEveryone = parsed.success && parsed.data.forEveryone === true;

      const msg = (await queryOne(db, 'SELECT id, conversation_id, sender_id, deleted_for_all, deleted_by_ids FROM messages WHERE id = ?', [messageId])) as any;
      if (!msg) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [String(msg.conversation_id)])) as any;
      if (!conv || (String(conv.user_a_id) !== req.auth!.userId && String(conv.user_b_id) !== req.auth!.userId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      if (forEveryone) {
        // Only sender can delete for everyone
        if (String(msg.sender_id) !== req.auth!.userId) {
          res.status(403).json({ error: 'only_sender_can_delete_for_everyone' });
          return;
        }
        await run(db, 'UPDATE messages SET deleted_for_all = 1 WHERE id = ?', [messageId]);
      } else {
        // Delete only for current user — add their id to deleted_by_ids
        let ids: string[] = [];
        try { ids = JSON.parse(msg.deleted_by_ids || '[]'); } catch { ids = []; }
        if (!ids.includes(req.auth!.userId)) {
          ids.push(req.auth!.userId);
        }
        await run(db, 'UPDATE messages SET deleted_by_ids = ? WHERE id = ?', [JSON.stringify(ids), messageId]);
      }
      await persist();

      const io = req.app.get('io') as SocketIOServer | undefined;
      if (forEveryone) {
        io?.to(String(msg.conversation_id)).emit('message.deleted', {
          messageId,
          conversationId: String(msg.conversation_id),
          forEveryone: true,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/messages/:messageId error', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/conversations/:conversationId/messages', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const schema = z.object({
      content: z.string().max(5000).optional(),
      mediaId: z.string().optional(),
      clientId: z.string().max(100).optional(),
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
    const schema = z.object({
      targetType: z.enum(['post', 'user', 'photo', 'experience']),
      targetId: z.string().min(1),
      reaction: z.enum(['heart', 'fire', 'love', 'wow', 'devil', 'splash']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const existing = (await queryOne(db, 'SELECT id, reaction FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
    ])) as any;
    const reaction = parsed.data.reaction || null;
    if (existing?.id) {
      if (reaction && String(existing.reaction || '') !== reaction) {
        await run(db, 'UPDATE likes SET reaction = ? WHERE id = ?', [reaction, String(existing.id)]);
        await persist();
        res.json({ id: String(existing.id), updated: true });
        return;
      }
      res.json({ id: String(existing.id), updated: false });
      return;
    }

    const id = randomUUID();
    await run(db, 'INSERT INTO likes (id, user_id, target_type, target_id, reaction, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
      reaction,
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
    } else if (parsed.data.targetType === 'user') {
      const target = (await queryOne(db, 'SELECT id FROM users WHERE id = ? LIMIT 1', [parsed.data.targetId])) as any;
      const targetUserId = target?.id ? String(target.id) : null;
      if (targetUserId && targetUserId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        await createNotification(
          { db, io },
          {
            userId: targetUserId,
            type: 'profile.favorited',
            title: 'Seu perfil foi favoritado',
            description: `${actorName} favoritou seu perfil.`,
            dataJson: { actorId: req.auth!.userId, actorName },
          }
        );
      }
    } else if (parsed.data.targetType === 'experience') {
      const experience = (await queryOne(db, 'SELECT id, user_id FROM experiences WHERE id = ? LIMIT 1', [parsed.data.targetId])) as any;
      const ownerId = experience?.user_id ? String(experience.user_id) : null;
      if (ownerId && ownerId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        await createNotification(
          { db, io },
          {
            userId: ownerId,
            type: 'experience.liked',
            title: 'Curtiram seu conto',
            description: `${actorName} curtiu seu conto.`,
            dataJson: { experienceId: parsed.data.targetId, actorId: req.auth!.userId, actorName },
          }
        );
      }
    }
    res.json({ id });
  });

  app.delete('/api/likes', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ targetType: z.enum(['post', 'user', 'photo', 'experience']), targetId: z.string().min(1) });
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
      targetType: z.enum(['post', 'user', 'photo', 'experience']),
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
      SELECT l.id, l.created_at, l.reaction,
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
        reaction: r.reaction || null,
        user: { id: r.user_id, name: r.user_name, avatar: r.user_avatar },
      }))
    );
  });

  app.post('/api/comments', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({ targetType: z.enum(['post', 'user', 'photo', 'experience']), targetId: z.string().min(1), content: z.string().min(1).max(2000) });
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
    } else if (parsed.data.targetType === 'experience') {
      const experience = (await queryOne(db, 'SELECT id, user_id FROM experiences WHERE id = ? LIMIT 1', [parsed.data.targetId])) as any;
      const ownerId = experience?.user_id ? String(experience.user_id) : null;
      if (ownerId && ownerId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        const preview = String(parsed.data.content).slice(0, 140);
        await createNotification(
          { db, io },
          {
            userId: ownerId,
            type: 'experience.commented',
            title: 'Novo comentário no seu conto',
            description: `${actorName} comentou: ${preview}`,
            dataJson: { experienceId: parsed.data.targetId, commentId: id, actorId: req.auth!.userId, actorName, content: parsed.data.content, createdAt },
          }
        );
      }
    }
    res.json({ id });
  });

  app.put('/api/comments/:commentId', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      content: z.string().min(1).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const commentId = String(req.params.commentId || '');
    const comment = (await queryOne(db, 'SELECT id, user_id FROM comments WHERE id = ? LIMIT 1', [commentId])) as any;
    if (!comment) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (String(comment.user_id) !== req.auth!.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    await run(db, 'UPDATE comments SET content = ? WHERE id = ?', [parsed.data.content, commentId]);
    await persist();
    res.json({ ok: true });
  });

  app.patch('/api/conversations/:conversationId/highlight', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const schema = z.object({
      highlighted: z.boolean(),
      note: z
        .string()
        .trim()
        .max(120, 'Nota muito longa')
        .optional()
        .nullable(),
      color: z.enum(['rose', 'amber', 'violet', 'sky']).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    if (!conv) {
      res.status(404).json({ error: 'conversation_not_found' });
      return;
    }
    if (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const highlighted = parsed.data.highlighted;
    const note = highlighted ? (parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null) : null;
    const color = highlighted ? (parsed.data.color || 'rose') : null;

    await run(
      db,
      'UPDATE conversations SET is_highlighted = ?, highlight_note = ?, highlight_color = ? WHERE id = ?',
      [highlighted ? 1 : 0, note, color, conversationId]
    );
    await persist();

    res.json({
      ok: true,
      conversationId,
      isHighlighted: highlighted,
      highlightNote: note,
      highlightColor: color,
    });
  });

  app.delete('/api/comments/:commentId', requireAuth(env, db), async (req, res) => {
    const commentId = String(req.params.commentId || '');
    const comment = (await queryOne(db, 'SELECT id, user_id FROM comments WHERE id = ? LIMIT 1', [commentId])) as any;
    if (!comment) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (String(comment.user_id) !== req.auth!.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    await run(db, 'DELETE FROM comments WHERE id = ?', [commentId]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/comments', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      targetType: z.enum(['post', 'user', 'photo', 'experience']),
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
        u.id as user_id, u.name as user_name, u.avatar as user_avatar,
        u.gender as user_gender, u.city as user_city, u.state as user_state
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
        user: {
          id: r.user_id,
          name: r.user_name,
          avatar: r.user_avatar,
          gender: r.user_gender ?? null,
          city: r.user_city ?? null,
          state: r.user_state ?? null,
        },
      }))
    );
  });

  app.post('/api/testimonials', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const schema = z.object({
      profileUserId: z.string().min(1),
      content: z.string().min(10).max(1000),
      mediaIds: z.array(z.string()).max(5).optional(),
    });
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
    if (parsed.data.mediaIds && parsed.data.mediaIds.length > 0) {
      for (let i = 0; i < parsed.data.mediaIds.length; i++) {
        await run(db, 'INSERT INTO testimonial_media (testimonial_id, media_id, sort_order) VALUES (?, ?, ?)', [id, parsed.data.mediaIds[i], i]);
      }
    }
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
        u.id as from_id, u.name as from_name, u.avatar as from_avatar,
        u.gender as from_gender, u.city as from_city, u.state as from_state
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
        u.id as to_id, u.name as to_name, u.avatar as to_avatar,
        u.gender as to_gender, u.city as to_city, u.state as to_state
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
        u.name as friend_name, u.avatar as friend_avatar, u.gender as friend_gender, u.city as friend_city, u.state as friend_state
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
        fromUser: {
          id: r.from_id,
          name: r.from_name,
          avatar: r.from_avatar,
          gender: r.from_gender ?? null,
          city: r.from_city ?? null,
          state: r.from_state ?? null,
        },
      })),
      outgoing: outgoing.map((r: any) => ({
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        toUser: {
          id: r.to_id,
          name: r.to_name,
          avatar: r.to_avatar,
          gender: r.to_gender ?? null,
          city: r.to_city ?? null,
          state: r.to_state ?? null,
        },
      })),
      friends: friends.map((r: any) => ({
        id: r.friend_id,
        name: r.friend_name,
        avatar: r.friend_avatar,
        gender: r.friend_gender ?? null,
        city: r.friend_city ?? null,
        state: r.friend_state ?? null,
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
    const toUserId = parsed.data.userId;
    const fromUserId = req.auth!.userId;

    if (toUserId === fromUserId) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }

    const targetUser = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [toUserId]);
    if (!targetUser) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // Check for existing request in either direction
    const existing = (await queryOne(
      db,
      `SELECT id, status FROM friend_requests
       WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
       LIMIT 1`,
      [fromUserId, toUserId, toUserId, fromUserId]
    )) as any;

    if (existing) {
      if (String(existing.status) === 'accepted') {
        res.status(409).json({ error: 'already_friends' });
      } else {
        res.status(409).json({ error: 'request_already_exists', requestId: String(existing.id) });
      }
      return;
    }

    const id = randomUUID();
    await run(db, 'INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)', [
      id,
      fromUserId,
      toUserId,
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
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const me = (await queryOne(db, 'SELECT is_premium, trial_ends_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const isPremium = hasPremiumAccess(me, subscriptionsEnabled);

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
    const io = req.app.get('io') as SocketIOServer | undefined;
    const targetUserId = String(req.params.targetUserId || '');
    // Don't record self-visits
    if (targetUserId === req.auth!.userId) {
      res.json({ ok: true });
      return;
    }
    const [targetExists, visitor, lastVisit] = await Promise.all([
      queryOne(db, 'SELECT id, notification_visits FROM users WHERE id = ?', [targetUserId]),
      queryOne(db, 'SELECT id, name, avatar FROM users WHERE id = ? LIMIT 1', [req.auth!.userId]),
      queryOne(
        db,
        'SELECT created_at FROM profile_visits WHERE visitor_user_id = ? AND visited_user_id = ? ORDER BY created_at DESC LIMIT 1',
        [req.auth!.userId, targetUserId]
      ),
    ]);
    if (!targetExists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const createdAt = nowIso();
    await run(db, 'INSERT INTO profile_visits (id, visitor_user_id, visited_user_id, created_at) VALUES (?, ?, ?, ?)', [
      randomUUID(),
      req.auth!.userId,
      targetUserId,
      createdAt,
    ]);

    const targetAllowsVisitNotifications =
      (targetExists as any)?.notification_visits == null ? true : !!(targetExists as any).notification_visits;
    const lastVisitAtMs = (lastVisit as any)?.created_at ? new Date(String((lastVisit as any).created_at)).getTime() : NaN;
    const cooldownActive =
      Number.isFinite(lastVisitAtMs) && Date.now() - lastVisitAtMs < PROFILE_VISIT_NOTIFICATION_COOLDOWN_MS;

    if (targetAllowsVisitNotifications && !cooldownActive) {
      await createNotification(
        { db, io },
        {
          userId: targetUserId,
          type: 'profile.visited',
          title: 'Visitaram seu perfil',
          description: `${String((visitor as any)?.name || 'Alguém')} visitou seu perfil.`,
          dataJson: {
            actorId: req.auth!.userId,
            actorName: String((visitor as any)?.name || 'Alguém'),
            actorAvatar: (visitor as any)?.avatar ? String((visitor as any).avatar) : null,
            visitedAt: createdAt,
          },
        }
      );
    }
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/subscriptions/plans', requireAuth(env, db), async (_req, res) => {
    try {
      const subscriptionsEnabled = await getSubscriptionsEnabled(db);
      if (!subscriptionsEnabled) {
        res.json([]);
        return;
      }
      const rawPlans = shouldUseHubBilling(env) ? await listHubPlans(getHubConfig(env)) : fallbackSubscriptionPlans();
      const plans = rawPlans
        .filter((plan: any) => plan.isActive !== false && String(plan.status || 'active') === 'active')
        .map((plan: any) => ({
          id: String(plan.id),
          code: String(plan.code || plan.id),
          name: String(plan.name),
          description: plan.description ? String(plan.description) : null,
          price: Number(plan.amount || 0) / 100,
          amount: Number(plan.amount || 0),
          currency: String(plan.currency || 'BRL'),
          interval: formatPlanInterval(String(plan.intervalUnit || 'month'), Number(plan.intervalCount || 1)),
          intervalUnit: String(plan.intervalUnit || 'month'),
          intervalCount: Number(plan.intervalCount || 1),
          isActive: !!plan.isActive,
          perks: plan.description ? String(plan.description).split(/\s*[•|]\s*/).filter(Boolean) : [],
        }));
      res.json(plans);
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
      res.status(502).json({ error: 'hub_billing_unavailable' });
    }
  });

  app.get('/api/subscriptions/discount', requireAuth(env, db), (_req, res) => {
    res.json({ percent: 0 });
  });

  app.get('/api/subscriptions/status', requireAuth(env, db), async (req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const row = (await queryOne(
      db,
      'SELECT id, hub_customer_id, hub_product_id, hub_access_status, hub_access_reason, hub_banner, hub_license_end_at, trial_started_at, trial_ends_at, is_premium FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (!shouldUseHubBilling(env) || !row.hub_customer_id) {
      res.json({
        customerId: row.hub_customer_id ?? null,
        productId: row.hub_product_id ?? null,
        accessStatus: row.hub_access_status ?? null,
        reason: row.hub_access_reason ?? null,
        banner: row.hub_banner ?? null,
        licenseEndAt: row.hub_license_end_at ?? null,
        trialStartedAt: row.trial_started_at ?? null,
        trialEndAt: row.trial_ends_at ?? null,
        canAccess: hasPremiumAccess(row, subscriptionsEnabled),
        subscriptionsEnabled,
      });
      return;
    }

    try {
      const status = await getHubAccessStatus(getHubConfig(env), String(row.hub_customer_id));
      await syncHubAccessForUser(db, req.auth!.userId, status);
      await persist();
      res.json({ ...status, subscriptionsEnabled });
    } catch (error) {
      console.error('Failed to fetch Hub Billing access status:', error);
      res.status(502).json({ error: 'hub_billing_unavailable' });
    }
  });

  app.post('/api/subscriptions/checkout', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      planId: z.string().min(1),
      billingType: z.enum(['PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
      billingLegalName: z.string().min(1).optional(),
      billingDocument: z.string().min(1).optional(),
      billingPersonType: z.enum(['PF', 'PJ']).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const planId = parsed.data.planId;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    if (!subscriptionsEnabled) {
      res.status(409).json({
        error: 'subscriptions_disabled',
        message: 'As assinaturas estão desativadas no momento.',
      });
      return;
    }
    if (!shouldUseHubBilling(env)) {
      const isPremium = planId !== 'basic' ? 1 : 0;
      await run(db, 'UPDATE users SET is_premium = ? WHERE id = ?', [isPremium, req.auth!.userId]);
      await persist();
      res.json({ ok: true, planId, mode: 'fallback' });
      return;
    }

    try {
      const user = (await queryOne(
        db,
        `SELECT id, email, name, city, state, billing_document, billing_legal_name, billing_person_type, billing_phone,
                billing_address_zip, billing_address_street, billing_address_number, billing_address_district,
                billing_address_complement, billing_address_city, billing_address_state, hub_customer_id
         FROM users WHERE id = ? LIMIT 1`,
        [req.auth!.userId]
      )) as any;
      if (!user) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const plans = await listHubPlans(getHubConfig(env));
      const selectedPlan = plans.find((plan) => String(plan.id) === planId && plan.isActive !== false && String(plan.status) === 'active');
      if (!selectedPlan) {
        res.status(404).json({ error: 'plan_not_found' });
        return;
      }

      const checkoutBilling = {
        legalName: String(parsed.data.billingLegalName || '').trim() || String(user.billing_legal_name || user.name || '').trim(),
        document: String(parsed.data.billingDocument || '').trim() || String(user.billing_document || '').trim(),
        personType: parsed.data.billingPersonType || user.billing_person_type || 'PF',
      };

      const requiredBillingFields = [
        ['legalName', 'Nome do titular'],
        ['document', 'CPF/CNPJ'],
      ] as const;
      const missingBillingFields = requiredBillingFields
        .filter(([key]) => !String(checkoutBilling[key] ?? '').trim())
        .map(([, label]) => label);
      if (missingBillingFields.length > 0) {
        res.status(400).json({
          error: 'billing_data_required',
          message: 'Complete seus dados de cobranca antes de gerar o PIX.',
          missingFields: missingBillingFields,
        });
        return;
      }

      const hubConfig = getHubConfig(env);
      let customerId = String(user.hub_customer_id || '').trim();

      if (customerId) {
        try {
          const existingStatus = await getHubAccessStatus(hubConfig, customerId);
          customerId = String(existingStatus.customerId || customerId).trim();
        } catch (error) {
          console.warn('Hub Billing customer lookup failed before checkout, trying upsert:', error);
          customerId = '';
        }
      }

      if (!customerId) {
        const upsertResult = await upsertHubCustomer(hubConfig, {
          email: String(user.email),
          legalName: checkoutBilling.legalName,
          document: checkoutBilling.document || null,
          personType: checkoutBilling.personType,
          phone: user.billing_phone ?? null,
          addressZip: user.billing_address_zip ?? null,
          addressStreet: user.billing_address_street ?? null,
          addressNumber: user.billing_address_number ?? null,
          addressDistrict: user.billing_address_district ?? null,
          addressCity: user.billing_address_city ?? user.city ?? null,
          addressState: user.billing_address_state ?? user.state ?? null,
        });
        customerId = String(upsertResult.customerId || '').trim();
      }

      if (!customerId) {
        throw new Error('Hub Billing nao retornou customerId');
      }

      const existingCustomerOwner = (await queryOne(
        db,
        'SELECT id, email FROM users WHERE hub_customer_id = ? AND id <> ? LIMIT 1',
        [customerId, req.auth!.userId]
      )) as any;

      if (existingCustomerOwner) {
        res.status(409).json({
          error: 'hub_customer_already_linked',
          message:
            'Este CPF/CNPJ ja esta vinculado a outro cadastro no NoSigilo. Use os dados do titular correto para gerar o PIX.',
        });
        return;
      }

      await run(db, 'UPDATE users SET hub_customer_id = ?, hub_product_id = ? WHERE id = ?', [
        customerId,
        String(hubConfig.productId),
        req.auth!.userId,
      ]);

      const order = await createHubOrder(hubConfig, {
        customerId,
        planId: planId,
        contractedAmount: Number(selectedPlan.amount || 0),
      });
      const orderId = String(order.id || order.orderId || '');
      if (!orderId) {
        throw new Error('Hub Billing nao retornou orderId');
      }
      const checkout = await createHubCheckout(hubConfig, {
        orderId,
        billingType: parsed.data.billingType || 'PIX',
        payerName: checkoutBilling.legalName,
        payerDocument: checkoutBilling.document || null,
      });
      await persist();

      res.json({
        ok: true,
        mode: 'hub',
        orderId,
        planId,
        customerId,
        checkout,
      });
    } catch (error) {
      console.error('Hub Billing checkout failed:', error);
      res.status(502).json({ error: 'hub_checkout_failed', message: error instanceof Error ? error.message : 'Falha no checkout' });
    }
  });

  app.post('/api/webhooks/hub-billing', async (req, res) => {
    if (!env.HUB_BILLING_WEBHOOK_SECRET) {
      res.status(503).json({ error: 'webhook_not_configured' });
      return;
    }

    const signature = String(req.headers['x-hub-signature'] || '');
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    if (!isValidHubSignature(rawBody, signature, String(env.HUB_BILLING_WEBHOOK_SECRET))) {
      res.status(401).json({ error: 'invalid_signature' });
      return;
    }

    const eventType = String(req.headers['x-hub-event'] || '');
    let payload: any = null;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }

    const customerId = String(payload?.customerId || '');
    if (!customerId) {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }

    const user = (await queryOne(db, 'SELECT id FROM users WHERE hub_customer_id = ? LIMIT 1', [customerId])) as any;
    if (!user) {
      res.json({ ok: true, ignored: true });
      return;
    }

    const nextStatus =
      eventType === 'payment.approved' || eventType === 'license.activated'
        ? 'licensed'
        : eventType === 'license.suspended'
          ? 'blocked'
          : eventType === 'license.revoked' || eventType === 'subscription.canceled' || eventType === 'payment.chargeback'
            ? 'blocked'
            : null;

    if (nextStatus) {
      await run(
        db,
        `UPDATE users
         SET is_premium = ?,
             hub_access_status = ?,
             hub_access_reason = ?,
             hub_license_end_at = COALESCE(?, hub_license_end_at)
         WHERE id = ?`,
        [
          nextStatus === 'licensed' ? 1 : 0,
          nextStatus,
          eventType || null,
          payload?.payload?.licenseEndAt ?? null,
          String(user.id),
        ]
      );
      await persist();
    }

    res.json({ ok: true });
  });

  app.post('/api/events', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const userRow = (await queryOne(db, 'SELECT name, is_premium, trial_ends_at, lat, lon FROM users WHERE id = ?', [req.auth!.userId])) as any;
    if (!hasPremiumAccess(userRow, subscriptionsEnabled)) {
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
      let where = 'id != ?';

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
        const pair = [req.auth!.userId, String(targetUser.id)].sort((a, b) => a.localeCompare(b));
        let conv = (await queryOne(db,
          'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?',
          [pair[0], pair[1]]
        )) as any;

        if (!conv) {
          const convId = randomUUID();
          await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [
            convId, pair[0], pair[1], nowIso()
          ]);
          conv = { id: convId };
        }

        const msgId = randomUUID();
        const msgContent = ns.customMessage
          ? `${ns.customMessage}\n\nConfira o evento: ${payload.title} em ${payload.location}`
          : `Olá! Criei um novo evento: ${payload.title} em ${payload.location}. Gostaria de participar?`;

        await run(db, 'INSERT INTO messages (id, conversation_id, sender_id, content, is_delivered, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
          msgId, conv.id, req.auth!.userId, msgContent, 1, nowIso()
        ]);
        
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

  app.get('/api/admin/users', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const subscriptionsEnabled = await getSubscriptionsEnabled(db);
      const requestedPage = Number(req.query.page || 1);
      const requestedLimit = Number(req.query.limit || 100);
      const page = Number.isFinite(requestedPage) ? Math.max(1, Math.trunc(requestedPage)) : 1;
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 20), 500) : 100;
      const offset = (page - 1) * limit;
      const search = String(req.query.search || '').trim().toLowerCase();
      const hasSearch = search.length > 0;

      const whereSql = hasSearch
        ? "WHERE LOWER(COALESCE(name, '')) LIKE ? OR LOWER(COALESCE(email, '')) LIKE ?"
        : '';
      const whereParams = hasSearch ? [`%${search}%`, `%${search}%`] : [];

      const [totalRow, rows] = await Promise.all([
        queryOne(db, `SELECT COUNT(*) as c FROM users ${whereSql}`, whereParams),
        queryAll(db, `SELECT * FROM users ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...whereParams, limit, offset]),
      ]);

      const total = Number((totalRow as any)?.c || 0);
      const presence = req.app.get('presence') as undefined | {
        isOnline?: (userId: string) => boolean;
        countOnline?: () => number;
      };
      const mappedUsers = rows.map((row) => ({
        ...rowToPublicUser(row, presence?.isOnline ? presence.isOnline(String(row.id)) : false, {
          showEmail: true,
          subscriptionsEnabled,
        }),
        isBanned: Number(row.is_banned || 0) === 1,
        bannedAt: row.banned_at ?? null,
      }));

      res.json({
        users: mappedUsers,
        total,
        page,
        limit,
        hasMore: offset + mappedUsers.length < total,
        onlineNow: presence?.countOnline ? Number(presence.countOnline()) : 0,
      });
    } catch (err) {
      console.error('[admin/users]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.put('/api/admin/users/:userId/ban', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { userId } = req.params;
      const adminId = (req as any).userId as string;
      const target = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId]);
      if (!target) { res.status(404).json({ error: 'not_found' }); return; }
      await run(db, 'UPDATE users SET is_banned = 1, banned_at = ?, banned_by = ? WHERE id = ?', [nowIso(), adminId, userId]);
      await persist();
      res.json({ ok: true, userId, banned: true });
    } catch (err) {
      console.error('[admin/users/ban]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.put('/api/admin/users/:userId/unban', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { userId } = req.params;
      const target = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId]);
      if (!target) { res.status(404).json({ error: 'not_found' }); return; }
      await run(db, 'UPDATE users SET is_banned = 0, banned_at = NULL, banned_by = NULL WHERE id = ?', [userId]);
      await persist();
      res.json({ ok: true, userId, banned: false });
    } catch (err) {
      console.error('[admin/users/unban]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/admin/logs', requireAuth(env, db), requireAdmin(), (_req, res) => {
    res.json([]);
  });

  app.get('/api/admin/settings', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    res.json({ subscriptionsEnabled });
  });

  app.put('/api/admin/settings/subscriptions', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const schema = z.object({ enabled: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    await setSystemSetting(db, 'subscriptions_enabled', parsed.data.enabled ? '1' : '0');
    await persist();
    res.json({ subscriptionsEnabled: parsed.data.enabled });
  });

  app.get('/api/admin/resources-status', requireAuth(env, db), requireAdmin(), (_req, res) => {
    const processMemory = process.memoryUsage();
    const systemTotal = totalmem();
    const systemFree = freemem();
    const systemUsed = Math.max(0, systemTotal - systemFree);
    const rss = Number(processMemory.rss || 0);

    const toMb = (value: number) => Math.round((value / 1024 / 1024) * 100) / 100;
    const toPct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0);

    res.json({
      checkedAt: nowIso(),
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      cpu: {
        count: cpus().length,
        loadAvg1m: Number(loadavg()[0].toFixed(2)),
        loadAvg5m: Number(loadavg()[1].toFixed(2)),
        loadAvg15m: Number(loadavg()[2].toFixed(2)),
      },
      memory: {
        rssMb: toMb(rss),
        heapUsedMb: toMb(Number(processMemory.heapUsed || 0)),
        heapTotalMb: toMb(Number(processMemory.heapTotal || 0)),
        externalMb: toMb(Number(processMemory.external || 0)),
        arrayBuffersMb: toMb(Number(processMemory.arrayBuffers || 0)),
        systemTotalMb: toMb(systemTotal),
        systemFreeMb: toMb(systemFree),
        systemUsedMb: toMb(systemUsed),
        processUsagePercent: toPct(rss, systemTotal),
        systemUsagePercent: toPct(systemUsed, systemTotal),
      },
    });
  });

  app.get('/api/admin/finance/summary', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const subscribersRow = (await queryOne(db, 'SELECT COUNT(*) as c FROM users WHERE is_premium = 1')) as any;
    const newTodayRow = (await queryOne(db, 'SELECT COUNT(*) as c FROM users WHERE created_at >= ?', [oneDayAgoIso])) as any;
    res.json({
      revenue: 0,
      subscribers: Number(subscribersRow?.c || 0),
      newToday: Number(newTodayRow?.c || 0),
      churnRate: 0,
    });
  });

  app.get('/api/admin/analytics/visits', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit || 120);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 20), 500)
        : 120;
      const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const presence = req.app.get('presence') as undefined | { countOnline?: () => number };

      const [totalRow, todayRow, last7DaysRow, uniqueTodayRow, rows, dailyRows, regionRows, topUsersRows] = await Promise.all([
        queryOne(db, 'SELECT COUNT(*) as c FROM site_visits'),
        queryOne(db, 'SELECT COUNT(*) as c FROM site_visits WHERE created_at >= ?', [todayIso]),
        queryOne(db, 'SELECT COUNT(*) as c FROM site_visits WHERE created_at >= ?', [sevenDaysAgoIso]),
        queryOne(
          db,
          `SELECT COUNT(DISTINCT COALESCE(NULLIF(user_id, ''), NULLIF(ip_hash, ''), id)) as c
           FROM site_visits
           WHERE created_at >= ?`,
          [todayIso]
        ),
        queryAll(
          db,
          `SELECT sv.*, u.name AS user_name, u.email AS user_email, u.city AS user_city, u.state AS user_state
           FROM site_visits sv
           LEFT JOIN users u ON u.id = sv.user_id
           ORDER BY sv.created_at DESC
           LIMIT ?`,
          [limit]
        ),
        queryAll(
          db,
          `SELECT SUBSTR(created_at, 1, 10) AS day, COUNT(*) AS c
           FROM site_visits
           WHERE created_at >= ?
           GROUP BY SUBSTR(created_at, 1, 10)
           ORDER BY day DESC
           LIMIT 30`,
          [thirtyDaysAgoIso]
        ),
        queryAll(
          db,
          `SELECT
             COALESCE(NULLIF(u.state, ''), NULLIF(u.city, ''), NULLIF(sv.country, ''), 'Desconhecido') AS region_label,
             COUNT(*) AS c
           FROM site_visits sv
           LEFT JOIN users u ON u.id = sv.user_id
           GROUP BY region_label
           ORDER BY c DESC
           LIMIT 10`
        ),
        queryAll(
          db,
          `SELECT
             sv.user_id,
             u.name AS user_name,
             u.email AS user_email,
             COUNT(*) AS accesses,
             COUNT(DISTINCT SUBSTR(sv.created_at, 1, 10)) AS active_days,
             MAX(sv.created_at) AS last_access_at
           FROM site_visits sv
           JOIN users u ON u.id = sv.user_id
           GROUP BY sv.user_id, u.name, u.email
           ORDER BY accesses DESC
           LIMIT 10`
        ),
      ]);

      const history = rows.map((row: any) => ({
        id: String(row.id),
        createdAt: String(row.created_at),
        pagePath: row.page_path ? String(row.page_path) : '/',
        pageTitle: row.page_title ? String(row.page_title) : null,
        originType: row.origin_type ? String(row.origin_type) : 'direct',
        referrer: row.referrer ? String(row.referrer) : null,
        referrerDomain: row.referrer_domain ? String(row.referrer_domain) : null,
        utmSource: row.utm_source ? String(row.utm_source) : null,
        utmMedium: row.utm_medium ? String(row.utm_medium) : null,
        utmCampaign: row.utm_campaign ? String(row.utm_campaign) : null,
        country: row.country ? String(row.country) : null,
        region: row.user_state
          ? String(row.user_state)
          : row.user_city
            ? String(row.user_city)
            : row.country
              ? String(row.country)
              : 'Desconhecido',
        timezone: row.timezone ? String(row.timezone) : null,
        language: row.language ? String(row.language) : null,
        deviceType: row.device_type ? String(row.device_type) : 'desktop',
        userName: row.user_name ? String(row.user_name) : null,
        userEmail: row.user_email ? String(row.user_email) : null,
      }));

      const groupCounts = (items: Array<string | null | undefined>, fallback: string) => {
        const counters = new Map<string, number>();
        for (const item of items) {
          const label = String(item || fallback).trim() || fallback;
          counters.set(label, (counters.get(label) || 0) + 1);
        }
        return Array.from(counters.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);
      };

      res.json({
        total: Number((totalRow as any)?.c || 0),
        today: Number((todayRow as any)?.c || 0),
        last7Days: Number((last7DaysRow as any)?.c || 0),
        uniqueToday: Number((uniqueTodayRow as any)?.c || 0),
        onlineNow: presence?.countOnline ? Number(presence.countOnline()) : 0,
        byDay: (dailyRows as any[]).map((row: any) => ({
          label: String(row.day || ''),
          count: Number(row.c || 0),
        })),
        byRegion: (regionRows as any[]).map((row: any) => ({
          label: String(row.region_label || 'Desconhecido'),
          count: Number(row.c || 0),
        })),
        topUsers: (topUsersRows as any[]).map((row: any) => {
          const accesses = Number(row.accesses || 0);
          const activeDays = Math.max(1, Number(row.active_days || 1));
          return {
            userId: String(row.user_id || ''),
            name: row.user_name ? String(row.user_name) : 'Usuário',
            email: row.user_email ? String(row.user_email) : null,
            accesses,
            activeDays,
            frequency: Number((accesses / activeDays).toFixed(2)),
            lastAccessAt: row.last_access_at ? String(row.last_access_at) : null,
          };
        }),
        byOrigin: groupCounts(history.map((item) => item.originType), 'direct'),
        byCountry: groupCounts(history.map((item) => item.country), 'Desconhecido'),
        byPage: groupCounts(history.map((item) => item.pagePath), '/'),
        history,
      });
    } catch (err) {
      console.error('[admin/analytics/visits]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Reports
  app.post('/api/reports', requireAuth(env, db), async (req, res) => {
    try {
      const schema = z.object({
        targetType: z.enum(['user', 'post', 'photo', 'message']),
        targetId: z.string().min(1),
        targetName: z.string().optional(),
        reason: z.string().min(1),
        details: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_input' });
        return;
      }
      const reporterId = (req as any).userId as string;
      const id = randomUUID();
      const createdAt = nowIso();
      await run(
        db,
        `INSERT INTO reports (id, reporter_user_id, target_type, target_id, target_name, reason, details, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          id,
          reporterId,
          parsed.data.targetType,
          parsed.data.targetId,
          parsed.data.targetName ?? null,
          parsed.data.reason,
          parsed.data.details ?? null,
          createdAt,
        ]
      );
      await persist();
      res.status(201).json({ id });
    } catch (err) {
      console.error('[reports/post]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/admin/reports', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const status = String(req.query.status || '').trim() || 'pending';
      const rows = await queryAll(
        db,
        `SELECT r.*, u.name AS reporter_name, u.email AS reporter_email
         FROM reports r
         LEFT JOIN users u ON u.id = r.reporter_user_id
         WHERE r.status = ?
         ORDER BY r.created_at DESC
         LIMIT 100`,
        [status]
      );
      res.json(
        rows.map((r: any) => ({
          id: String(r.id),
          reporterName: r.reporter_name ? String(r.reporter_name) : 'Usuário',
          reporterEmail: r.reporter_email ? String(r.reporter_email) : null,
          targetType: String(r.target_type),
          targetId: String(r.target_id),
          targetName: r.target_name ? String(r.target_name) : null,
          reason: String(r.reason),
          details: r.details ? String(r.details) : null,
          status: String(r.status),
          createdAt: String(r.created_at),
          resolvedAt: r.resolved_at ? String(r.resolved_at) : null,
        }))
      );
    } catch (err) {
      console.error('[admin/reports]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.put('/api/admin/reports/:reportId/resolve', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { reportId } = req.params;
      const adminId = (req as any).userId as string;
      const report = await queryOne(db, 'SELECT id FROM reports WHERE id = ?', [reportId]);
      if (!report) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const resolvedAt = nowIso();
      await run(
        db,
        'UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?',
        ['resolved', adminId, resolvedAt, reportId]
      );
      await persist();
      res.json({ id: reportId, status: 'resolved' });
    } catch (err) {
      console.error('[admin/reports/resolve]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ── Suggestions ──────────────────────────────────────────────────────────────
  app.post('/api/suggestions', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      category: z.enum(['bug', 'feature', 'improvement', 'general']).default('general'),
      content: z.string().min(10).max(2000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const id = randomUUID();
    const now = nowIso();
    await run(db, 'INSERT INTO suggestions (id, user_id, category, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, req.auth!.userId, parsed.data.category, parsed.data.content, 'new', now, now]);
    await persist();
    res.json({ id });
  });

  app.get('/api/suggestions/mine', requireAuth(env, db), async (req, res) => {
    const rows = await queryAll(db, 'SELECT id, category, content, status, admin_reply, created_at FROM suggestions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.auth!.userId]);
    res.json(rows.map((r: any) => ({ id: r.id, category: r.category, content: r.content, status: r.status, adminReply: r.admin_reply ?? null, createdAt: r.created_at })));
  });

  app.get('/api/admin/suggestions', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const status = String(req.query.status || 'all');
    const whereClause = status === 'all' ? '' : 'WHERE s.status = ?';
    const params: any[] = status === 'all' ? [] : [status];
    const rows = await queryAll(db, `SELECT s.id, s.category, s.content, s.status, s.admin_reply, s.created_at, u.id as user_id, u.name as user_name, u.avatar as user_avatar FROM suggestions s JOIN users u ON u.id = s.user_id ${whereClause} ORDER BY s.created_at DESC LIMIT 200`, params);
    res.json(rows.map((r: any) => ({ id: r.id, category: r.category, content: r.content, status: r.status, adminReply: r.admin_reply ?? null, createdAt: r.created_at, user: { id: r.user_id, name: r.user_name, avatar: r.user_avatar } })));
  });

  app.put('/api/admin/suggestions/:id/reply', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const schema = z.object({ reply: z.string().max(1000), status: z.enum(['new', 'read', 'planned', 'done', 'rejected']).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const id = String(req.params.id || '');
    await run(db, 'UPDATE suggestions SET admin_reply = ?, status = COALESCE(?, status), updated_at = ? WHERE id = ?', [parsed.data.reply, parsed.data.status ?? null, nowIso(), id]);
    await persist();
    res.json({ ok: true });
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
      if (msg === 'INVALID_FILE_TYPE') {
        res.status(415).json({ error: 'invalid_file_type', allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'] });
        return;
      }
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
