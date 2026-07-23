import cors from 'cors';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync, existsSync, createReadStream, statSync, statfsSync, renameSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';
import { z } from 'zod';
import type { Server as SocketIOServer } from 'socket.io';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';
import { nearestCity, searchCities } from './seedCities.js';
import { sendPasswordResetCodeEmail, sendReengagementEmail, sendPromoterCampaignEmail, sendPromoterIncentiveEmail, sendPromoterMonthlySummaryEmail, sendPromoterPaymentReceiptEmail, sendAdminAlertEmail, sendWinbackEmail, sendModerationEmail, sendWeekendEngagementEmail, sendSupportReplyEmail } from './email.js';
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
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALLBACK_URL?: string;
  BILLING_TEST_EMAILS: string;
};

export type PublicUser = {
  id: string;
  email?: string; // only included in own-profile responses
  name: string;
  avatar?: string | null;
  bio?: string | null;
  bioLink?: string | null;
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
  notificationEmail?: boolean;
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
  ambassadorBadges?: string[] | null;
  badges?: string[];
  boosted?: boolean;
  topMonth?: { position: number; month: string | null } | null;
  telegramChatId?: string | null;
  distanceKm?: number | null;
  lat?: number | null;
  lon?: number | null;
  intentions?: string[];
  fetiches?: string[];
  meetingTagline?: string | null;
  availabilityStatus?: string | null;
  blockOutsidePrefs?: boolean;
  partnerName?: string | null;
  partnerSexualOrientation?: string | null;
  partnerEthnicity?: string | null;
  partnerHair?: string | null;
  partnerEyes?: string | null;
  partnerHeight?: string | null;
  partnerBodyType?: string | null;
  isPromoter?: boolean;
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
const GENERATED_VAPID_KEYS = webpush.generateVAPIDKeys();
let hasWarnedAboutEphemeralVapidKeys = false;

function nowIso() {
  return new Date().toISOString();
}

type BrowserPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type PushDeliveryPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
  tag?: string | null;
  data?: Record<string, unknown> | null;
  icon?: string | null;
  badge?: string | null;
};

function getWebPushConfig(env: Env) {
  const configuredPublicKey = String(env.VAPID_PUBLIC_KEY || '').trim();
  const configuredPrivateKey = String(env.VAPID_PRIVATE_KEY || '').trim();
  const usingEphemeralKeys = !configuredPublicKey || !configuredPrivateKey;

  if (usingEphemeralKeys && !hasWarnedAboutEphemeralVapidKeys) {
    hasWarnedAboutEphemeralVapidKeys = true;
    console.warn(
      '[PUSH WARNING] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas. Gerando chaves temporárias apenas para desenvolvimento.'
    );
  }

  return {
    publicKey: configuredPublicKey || GENERATED_VAPID_KEYS.publicKey,
    privateKey: configuredPrivateKey || GENERATED_VAPID_KEYS.privateKey,
    subject: String(env.VAPID_SUBJECT || '').trim() || 'mailto:suporte@nosigilo.net',
  };
}

function configureWebPush(env: Env) {
  const config = getWebPushConfig(env);
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
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

function buildExperienceTitle(title: string | null | undefined, description: string) {
  const explicitTitle = limitText(title, 120);
  if (explicitTitle && explicitTitle.length >= 3) return explicitTitle;

  const normalized = String(description || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'Experiência';

  const sentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  const derived = sentence.slice(0, 120).trim();
  return derived.length >= 3 ? derived : 'Experiência';
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
  if (source.includes('nosigilo.net') || source.includes('nosigilo.baselider.com.br')) return 'internal';
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

/**
 * Returns true if billing/subscriptions are enabled for this specific user.
 * A user is allowed if the global flag is ON, OR if their email is listed in
 * BILLING_TEST_EMAILS (comma-separated env var) — useful for testing before
 * enabling payments for everyone.
 */
function isBillingEnabledForUser(globalEnabled: boolean, userEmail: string, billingTestEmails: string): boolean {
  if (globalEnabled) return true;
  if (!billingTestEmails) return false;
  const whitelist = billingTestEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return whitelist.includes(userEmail.trim().toLowerCase());
}

function hasPremiumAccess(userRow: any, subscriptionsEnabled: boolean = true, billingTestEmails: string = '') {
  // If this user is in the billing-test whitelist, enforce premium gating for them
  // even when subscriptions are globally disabled — so they can test the full payment flow.
  const effectiveEnabled = (billingTestEmails && userRow?.email)
    ? isBillingEnabledForUser(subscriptionsEnabled, String(userRow.email || ''), billingTestEmails)
    : subscriptionsEnabled;
  if (!effectiveEnabled) return true;
  if (!userRow) return false;
  const now = Date.now();
  const parse = (v: any) => { if (!v) return null; const t = new Date(String(v)).getTime(); return Number.isNaN(t) ? null : t; };
  const lic = parse(userRow.hub_license_end_at);
  const trial = parse(userRow.trial_ends_at);
  // Pago/HUB: vale só se a licença NÃO venceu (lic null = data desconhecida no row,
  // não bloqueia para não derrubar pagantes válidos cujo SELECT não trouxe a coluna).
  if (userRow.is_premium && (lic === null || lic > now)) return true;
  // Trial / dias ganhos por token continuam valendo mesmo após a licença paga vencer.
  if (trial !== null && trial > now) return true;
  return false;
}

async function userHasPremiumAccess(db: DbHandle, userId: string, billingTestEmails: string = '') {
  const subscriptionsEnabled = await getSubscriptionsEnabled(db);
  const row = (await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  return hasPremiumAccess(row, subscriptionsEnabled, billingTestEmails);
}

// ─── Referral Reward System ────────────────────────────────────────────────
// Validation tiers: invitee must complete ≥2 actions within 7 days of signup
// Bit-mask: bit0 = profile≥50%  |  bit1 = sent_message  |  bit2 = liked_profile
const REFERRAL_VALIDATION_DAYS = 7;
const REFERRAL_MIN_ACTIONS = 2; // popcount(bitmask) must be >= 2
const REFERRAL_TIERS = [
  { count: 1,  days: 10,  rewardType: 'starter_1',        badgeType: 'starter',          label: '1° Convite' },
  { count: 2,  days: 10,  rewardType: 'starter_2',        badgeType: 'starter',          label: '2° Convite' },
  { count: 3,  days: 10,  rewardType: 'ambassador',       badgeType: 'ambassador',       label: 'Embaixador(a)' },
  { count: 10, days: 100, rewardType: 'ambassador_gold',  badgeType: 'ambassador_gold',  label: 'Embaixador(a) Gold' },
  { count: 30, days: 300, rewardType: 'ambassador_elite', badgeType: 'ambassador_elite', label: 'Embaixador(a) Elite' },
];

function popcount(n: number) {
  let count = 0;
  let v = n >>> 0;
  while (v) { count += v & 1; v >>= 1; }
  return count;
}

async function grantPremiumDays(db: DbHandle, userId: string, days: number) {
  const row = (await queryOne(db, 'SELECT trial_ends_at FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  const currentEndsTs = row?.trial_ends_at ? new Date(String(row.trial_ends_at)).getTime() : 0;
  const base = Math.max(currentEndsTs, Date.now());
  const newEndsAt = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
  await run(db, 'UPDATE users SET trial_ends_at = ? WHERE id = ?', [newEndsAt, userId]);
}

// ── Sistema de tokens (gamificação → dias grátis) ──────────────────────────
// Pontos por ação (peso = dificuldade/engajamento) com teto diário anti-farm.
const TOKEN_RULES: Record<string, { points: number; dailyCap: number }> = {
  like:    { points: 1,  dailyCap: 20 },
  comment: { points: 3,  dailyCap: 10 },
  photo:   { points: 10, dailyCap: 3 },
  story:   { points: 8,  dailyCap: 3 },
  post:    { points: 5,  dailyCap: 3 },
  checkin: { points: 5,  dailyCap: 1 },
};

// Só perfis de mulheres e casais recebem tokens por postagem feita.
function genderEarnsPostTokens(gender: unknown): boolean {
  const g = String(gender || '').trim().toLowerCase();
  return g === 'mulher' || g.startsWith('casal') || g === 'couple';
}
const POINTS_PER_FREE_DAY = 100;
// Destaque de perfil (sink de tokens): custo e duração.
const BOOST_COST = 30;
const BOOST_HOURS = 24;

// Credita pontos por uma ação. Best-effort: nunca lança (não derruba a ação principal).
// Aplica dedup por alvo (refId) e teto diário; ao cruzar 100 pontos, converte
// automaticamente em +1 dia grátis (desconta 100 e registra a baixa no ledger).
async function awardTokens(db: DbHandle, userId: string, actionType: string, refId?: string | null, io?: SocketIOServer) {
  try {
    if (!userId) return;
    const rule = TOKEN_RULES[actionType];
    if (!rule) return;
    const now = nowIso();
    const todayPrefix = now.slice(0, 10); // YYYY-MM-DD (UTC), consistente com o resto

    // Dedup por alvo — ex.: curtir o mesmo post só pontua uma vez (descurtir+curtir não farma)
    if (refId) {
      const dup = (await queryOne(
        db,
        'SELECT 1 AS x FROM token_transactions WHERE user_id = ? AND action_type = ? AND ref_id = ? LIMIT 1',
        [userId, actionType, refId]
      )) as any;
      if (dup) return;
    }

    // Teto diário por tipo de ação
    const cntRow = (await queryOne(
      db,
      "SELECT COUNT(*) AS c FROM token_transactions WHERE user_id = ? AND action_type = ? AND points > 0 AND created_at >= ?",
      [userId, actionType, todayPrefix]
    )) as any;
    if (Number(cntRow?.c || 0) >= rule.dailyCap) return;

    // Credita pontos (saldo + acumulado histórico)
    await run(
      db,
      'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), userId, actionType, rule.points, refId ?? null, now]
    );
    await run(
      db,
      'UPDATE users SET token_points = COALESCE(token_points,0) + ?, token_points_total = COALESCE(token_points_total,0) + ? WHERE id = ?',
      [rule.points, rule.points, userId]
    );

    // Conversão automática: cada 100 pontos vira 1 dia grátis
    let freeDaysGranted = 0;
    const balRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [userId])) as any;
    let balance = Number(balRow?.p || 0);
    while (balance >= POINTS_PER_FREE_DAY) {
      freeDaysGranted += 1;
      await run(
        db,
        'UPDATE users SET token_points = COALESCE(token_points,0) - ?, token_free_days = COALESCE(token_free_days,0) + 1 WHERE id = ?',
        [POINTS_PER_FREE_DAY, userId]
      );
      await grantPremiumDays(db, userId, 1);
      await run(
        db,
        'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), userId, 'convert_day', -POINTS_PER_FREE_DAY, null, nowIso()]
      );
      try {
        await run(
          db,
          `INSERT INTO notifications (id, user_id, type, title, description, is_read, created_at) VALUES (?, ?, 'tokens.free_day', ?, ?, 0, ?)`,
          [randomUUID(), userId, '🎉 Você ganhou 1 dia grátis!', 'Seus pontos viraram +1 dia de acesso na plataforma.', nowIso()]
        );
      } catch { /* non-fatal */ }
      balance -= POINTS_PER_FREE_DAY;
    }
    await db.persist();
    // Notifica o cliente em tempo real: saldo novo, quanto ganhou agora (delta)
    // e quantos dias grátis foram concedidos (para as animações no front).
    const newBalRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [userId])) as any;
    io?.to(`user:${userId}`).emit('tokens.updated', {
      points: Number(newBalRow?.p || 0),
      gained: rule.points,
      action: actionType,
      freeDaysGranted,
    });
  } catch (err) {
    console.error('[awardTokens]', err);
  }
}

// Concede tokens de conteúdo (post/vídeo/foto/story) SÓ para mulheres e casais.
// Homens e demais tipos de perfil não pontuam ao publicar conteúdo.
async function awardContentTokensIfEligible(db: DbHandle, userId: string, actionType: string, refId: string | null, io?: SocketIOServer) {
  const u = (await queryOne(db, 'SELECT gender FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  if (!genderEarnsPostTokens(u?.gender)) return;
  await awardTokens(db, userId, actionType, refId, io);
}

// Debita pontos por uma ação que CONSOME tokens (ex.: Coração Quente no story).
// Idempotente por (userId, actionType, refId): se já houve cobrança para o mesmo
// alvo, retorna { ok:true, charged:false } sem cobrar de novo. Se faltar saldo,
// retorna { ok:false }. Registra a baixa no ledger como pontos negativos.
async function spendTokens(
  db: DbHandle,
  userId: string,
  cost: number,
  actionType: string,
  refId: string,
  io?: SocketIOServer,
): Promise<{ ok: boolean; charged: boolean; balance: number }> {
  const balRow0 = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [userId])) as any;
  const balance0 = Number(balRow0?.p || 0);
  // Já pagou por este alvo? Não cobra de novo (permite toggle livre depois).
  const paid = (await queryOne(
    db,
    'SELECT 1 AS x FROM token_transactions WHERE user_id = ? AND action_type = ? AND ref_id = ? LIMIT 1',
    [userId, actionType, refId],
  )) as any;
  if (paid) return { ok: true, charged: false, balance: balance0 };
  if (balance0 < cost) return { ok: false, charged: false, balance: balance0 };
  await run(db, 'UPDATE users SET token_points = COALESCE(token_points,0) - ? WHERE id = ?', [cost, userId]);
  await run(
    db,
    'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), userId, actionType, -cost, refId, nowIso()],
  );
  await db.persist();
  const balance = balance0 - cost;
  io?.to(`user:${userId}`).emit('tokens.updated', { points: balance });
  return { ok: true, charged: true, balance };
}

// ── Prêmio mensal do ranking de tokens (7/3/1 dias premium + selo Top do Mês) ──
const RANKING_PRIZES = [7, 3, 1]; // dias premium para 1º, 2º, 3º
const RANKING_CATEGORIES: Array<{ id: 'homem' | 'mulher' | 'casal'; label: string; cond: string }> = [
  { id: 'homem', label: 'Homens', cond: "u.gender = 'Homem'" },
  { id: 'mulher', label: 'Mulheres', cond: "u.gender = 'Mulher'" },
  { id: 'casal', label: 'Casais', cond: "u.gender LIKE 'Casal%'" },
];

function prevMonthStr(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}
function monthBounds(monthStr: string): { start: string; end: string } {
  const [y, m] = monthStr.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  return { start: `${monthStr}-01`, end: `${nextY}-${String(nextM).padStart(2, '0')}-01` };
}

// Premia o top 3 de cada categoria no mês indicado. Idempotente: se já houver
// prêmios para o mês, não refaz. Concede dias premium, marca o selo e notifica.
async function settleRankingMonth(db: DbHandle, env: Env, io: SocketIOServer | undefined, monthStr: string) {
  const already = (await queryOne(db, 'SELECT 1 AS x FROM token_ranking_awards WHERE month = ? LIMIT 1', [monthStr])) as any;
  if (already) return;
  const { start, end } = monthBounds(monthStr);
  const [my, mm] = monthStr.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(my, mm - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const medals = ['🥇', '🥈', '🥉'];

  for (const cat of RANKING_CATEGORIES) {
    const winners = (await queryAll(
      db,
      `SELECT u.id, u.name, COALESCE(SUM(CASE WHEN t.points > 0 THEN t.points ELSE 0 END), 0) AS total
       FROM users u
       JOIN token_transactions t ON t.user_id = u.id AND t.created_at >= ? AND t.created_at < ? AND t.action_type != 'gift_received'
       WHERE (u.is_admin = 0 OR u.is_admin IS NULL) AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND ${cat.cond}
       GROUP BY u.id, u.name, u.created_at
       HAVING COALESCE(SUM(CASE WHEN t.points > 0 THEN t.points ELSE 0 END), 0) > 0
       ORDER BY total DESC, u.created_at ASC
       LIMIT 3`,
      [start, end]
    )) as any[];

    for (let i = 0; i < winners.length; i++) {
      const w = winners[i];
      const position = i + 1;
      const days = RANKING_PRIZES[i] ?? 0;
      if (days <= 0) continue;
      await grantPremiumDays(db, String(w.id), days);
      await run(db, 'UPDATE users SET top_month_position = ?, top_month_month = ? WHERE id = ?', [position, monthStr, String(w.id)]);
      await run(
        db,
        'INSERT INTO token_ranking_awards (id, month, category, position, user_id, points, premium_days, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), monthStr, cat.id, position, String(w.id), Number(w.total || 0), days, nowIso()]
      );
      try {
        await createNotification({ db, io }, {
          userId: String(w.id),
          type: 'tokens.top_month',
          title: `🏆 Você foi Top do Mês! ${medals[i]}`,
          description: `Você ficou em ${position}º no ranking de ${cat.label} em ${monthLabel} e ganhou ${days} dia${days > 1 ? 's' : ''} premium!`,
          dataJson: { month: monthStr, position, category: cat.id, premiumDays: days },
        });
      } catch { /* non-fatal */ }
      try {
        await sendPushToUser({ db, env }, {
          userId: String(w.id),
          payload: {
            title: `🏆 Top do Mês ${medals[i]}`,
            body: `${position}º lugar em ${cat.label}! Você ganhou ${days} dia${days > 1 ? 's' : ''} premium.`,
            url: '/tokens',
            tag: `top-month-${monthStr}`,
          },
        });
      } catch { /* non-fatal */ }
    }
  }
  await db.persist();
}

// Liquida o mês anterior se ainda não foi premiado (chamada preguiçosa/idempotente).
async function settlePreviousMonthIfNeeded(db: DbHandle, env: Env, io: SocketIOServer | undefined) {
  try {
    await settleRankingMonth(db, env, io, prevMonthStr());
  } catch (err) {
    console.error('[settleRankingMonth]', err);
  }
}

async function grantBadge(db: DbHandle, userId: string, badgeType: string) {
  await run(
    db,
    'INSERT OR IGNORE INTO user_badges (id, user_id, badge_type, earned_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), userId, badgeType, nowIso()]
  );
}

async function countValidatedReferrals(db: DbHandle, inviterUserId: string): Promise<number> {
  const row = (await queryOne(
    db,
    `SELECT COUNT(*) as c
     FROM invite_link_entries e
     JOIN invite_links l ON l.id = e.invite_link_id
     WHERE l.inviter_user_id = ?
       AND e.validation_status = 'validated'`,
    [inviterUserId]
  )) as any;
  return Number(row?.c ?? 0);
}

async function checkAndGrantReferralRewards(
  db: DbHandle,
  io: any,
  inviterUserId: string,
  env?: Env
) {
  const validatedCount = await countValidatedReferrals(db, inviterUserId);
  for (const tier of REFERRAL_TIERS) {
    if (validatedCount < tier.count) continue;
    // Check if reward already granted
    const existing = await queryOne(
      db,
      'SELECT id FROM referral_rewards WHERE inviter_user_id = ? AND reward_type = ? LIMIT 1',
      [inviterUserId, tier.rewardType]
    );
    if (existing) continue;
    // Grant reward
    await grantPremiumDays(db, inviterUserId, tier.days);
    await grantBadge(db, inviterUserId, tier.badgeType);
    await run(
      db,
      'INSERT INTO referral_rewards (id, inviter_user_id, reward_type, valid_invites_count, premium_days_granted, granted_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), inviterUserId, tier.rewardType, validatedCount, tier.days, nowIso()]
    );
    await db.persist();
    const notifTitle = `Você é ${tier.label}! 🏅`;
    const notifDesc = `${tier.count} convites validados — você ganhou ${tier.days} dias de Premium.`;
    await createNotification(
      { db, io },
      {
        userId: inviterUserId,
        type: 'referral.reward',
        title: notifTitle,
        description: notifDesc,
        dataJson: { rewardType: tier.rewardType, premiumDays: tier.days, validatedCount },
      }
    );
    // Push notification (only when env is available)
    if (env) {
      try {
        await sendPushToUser(
          { db, env },
          {
            userId: inviterUserId,
            payload: {
              title: notifTitle,
              body: notifDesc,
              url: '/invites',
              tag: `referral.reward:${tier.rewardType}`,
              data: { rewardType: tier.rewardType },
            },
          }
        );
      } catch {}
    }
  }
}

async function markInviteeAction(
  db: DbHandle,
  io: any,
  inviteeUserId: string,
  actionBit: number, // 1 = profile, 2 = message, 4 = like
  env?: Env
) {
  // Find pending entry for this invitee
  const entry = (await queryOne(
    db,
    `SELECT e.id, e.actions_bitmask, e.validation_status, e.validation_deadline, l.inviter_user_id
     FROM invite_link_entries e
     JOIN invite_links l ON l.id = e.invite_link_id
     WHERE e.invitee_user_id = ?
       AND e.validation_status = 'pending'
     LIMIT 1`,
    [inviteeUserId]
  )) as any;
  if (!entry) return; // Not an invitee or already validated/failed

  const now = Date.now();
  const deadline = entry.validation_deadline ? new Date(String(entry.validation_deadline)).getTime() : 0;

  // Check if deadline has passed
  if (deadline && now > deadline) {
    await run(
      db,
      `UPDATE invite_link_entries SET validation_status = 'expired', failed_reason = 'deadline_passed' WHERE id = ?`,
      [entry.id]
    );
    return;
  }

  const newMask = (Number(entry.actions_bitmask) | actionBit) >>> 0;
  if (newMask === Number(entry.actions_bitmask)) return; // No change

  const isValidated = popcount(newMask) >= REFERRAL_MIN_ACTIONS;

  await run(
    db,
    `UPDATE invite_link_entries
     SET actions_bitmask = ?,
         validation_status = ?,
         validated_at = ?
     WHERE id = ?`,
    [newMask, isValidated ? 'validated' : 'pending', isValidated ? nowIso() : null, entry.id]
  );

  if (isValidated) {
    await checkAndGrantReferralRewards(db, io, String(entry.inviter_user_id), env);
  }
}
// ───────────────────────────────────────────────────────────────────────────

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

// Verifica se um nome está na lista negra (perfis banidos). Case-insensitive.
async function isNameBlacklisted(db: DbHandle, name: string): Promise<boolean> {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  const row = await queryOne(db, 'SELECT name_lower FROM banned_names WHERE name_lower = ? LIMIT 1', [n]);
  return !!row;
}

// Bane um usuário de forma COMPLETA: marca is_banned, joga o nome na lista negra
// (ninguém mais cria perfil com esse nome) e remove o conteúdo que ainda apareceria
// em consultas (stories ativos e broadcasts de radar). As demais listagens já
// filtram is_banned, então o perfil some de buscas, feed, chat, etc.
async function banUserEverywhere(db: DbHandle, userId: string, adminId: string | null) {
  const u = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [userId])) as any;
  await run(db, 'UPDATE users SET is_banned = 1, banned_at = ?, banned_by = ? WHERE id = ?', [nowIso(), adminId ?? null, userId]);

  const name = String(u?.name || '').trim();
  if (name) {
    const nameLower = name.toLowerCase();
    if (db.mode === 'pg') {
      await run(db, 'INSERT INTO banned_names (name_lower, original_name, banned_user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (name_lower) DO NOTHING', [nameLower, name, userId, nowIso()]);
    } else {
      await run(db, 'INSERT OR IGNORE INTO banned_names (name_lower, original_name, banned_user_id, created_at) VALUES (?, ?, ?, ?)', [nameLower, name, userId, nowIso()]);
    }
  }

  // Conteúdo que não é filtrado por JOIN com users: remove explicitamente.
  await run(db, 'DELETE FROM stories WHERE user_id = ?', [userId]);
  await run(db, 'UPDATE radar_broadcasts SET deactivated_at = ? WHERE user_id = ? AND deactivated_at IS NULL', [nowIso(), userId]);
}

async function syncHubAccessForUser(
  db: DbHandle,
  userId: string,
  result: HubResolveAccessResult & { customerId: string; productId: string },
  ctx?: { io?: SocketIOServer; env?: Env }
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

  // Comissão de promotor: o acesso premium é concedido por ESTE caminho (login +
  // polling de /subscriptions/status), não só pelo webhook. Garantimos a comissão
  // aqui também, senão assinaturas confirmadas pelo sync ficam sem comissão.
  if (result.accessStatus === 'licensed') {
    await ensurePromoterCommission(db, userId, 990, 'access_synced', ctx);
  }
}

// Cria a comissão do promotor para um assinante, se ainda não existir, e notifica
// o promotor. Idempotente por subscriber_user_id — pode ser chamada várias vezes
// sem duplicar. Retorna true se criou uma nova comissão.
async function ensurePromoterCommission(
  db: DbHandle,
  subscriberUserId: string,
  subscriptionAmountCents = 990,
  eventType = 'access_synced',
  ctx?: { io?: SocketIOServer; env?: Env }
): Promise<boolean> {
  // Quem convidou este assinante (via link de convite)?
  const inviteEntry = (await queryOne(
    db,
    `SELECT l.inviter_user_id FROM invite_link_entries e
     JOIN invite_links l ON l.id = e.invite_link_id
     WHERE e.invitee_user_id = ? LIMIT 1`,
    [subscriberUserId]
  )) as any;
  if (!inviteEntry) return false;

  const inviterUserId = String(inviteEntry.inviter_user_id);
  const promoter = await queryOne(db, "SELECT id FROM promoters WHERE user_id = ? AND status = 'active' LIMIT 1", [inviterUserId]);
  if (!promoter) return false;

  const existing = await queryOne(db, 'SELECT id FROM promoter_commissions WHERE subscriber_user_id = ? LIMIT 1', [subscriberUserId]);
  if (existing) return false;

  const subAmount = Number(subscriptionAmountCents || 990);
  const commAmount = Math.round(subAmount * 0.20);
  const period = new Date().toISOString().slice(0, 7);
  await run(
    db,
    'INSERT INTO promoter_commissions (id, promoter_user_id, subscriber_user_id, subscription_amount, commission_amount, status, period, event_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), inviterUserId, subscriberUserId, subAmount, commAmount, 'pending', period, eventType, nowIso()]
  );
  console.log(`[promoter] commission created (${eventType}): promoter=${inviterUserId} subscriber=${subscriberUserId} R$${(commAmount / 100).toFixed(2)}`);

  // Notifica o promotor: "alguém assinou pelo seu convite" + push.
  try {
    const commReais = (commAmount / 100).toFixed(2).replace('.', ',');
    const title = '💰 Você ganhou uma comissão!';
    const description = `Um convidado seu assinou o Premium. Você ganhou R$ ${commReais} de comissão.`;
    await createNotification(
      { db, io: ctx?.io },
      {
        userId: inviterUserId,
        type: 'promoter.commission',
        title,
        description,
        dataJson: { subscriberUserId, commissionCents: commAmount, period },
      }
    );
    if (ctx?.env) {
      await sendPushToUser(
        { db, env: ctx.env },
        {
          userId: inviterUserId,
          payload: {
            title,
            body: description,
            url: '/promoter',
            tag: `promoter-commission:${subscriberUserId}`,
            data: { subscriberUserId },
          },
        }
      );
    }
  } catch (err) {
    console.error('[promoter] commission notification failed:', err);
  }

  return true;
}

function fallbackSubscriptionPlans() {
  return [
    { id: 'basic', code: 'basic', name: 'Básico', description: 'Plano básico', amount: 0, currency: 'BRL', intervalUnit: 'month', intervalCount: 1, status: 'active', isActive: true },
    // Plano único: Premium mensal por R$ 9,90
    { id: 'premium_monthly', code: 'premium_monthly', name: 'Premium', description: 'Acesso premium completo: radar, vídeos, eventos e recursos exclusivos', amount: 990, currency: 'BRL', intervalUnit: 'month', intervalCount: 1, status: 'active', isActive: true },
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

function roundDistanceKm(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return Math.round(distanceKm * 10) / 10;
}

function radarZoneLabelFromCoordinates(
  viewer: { lat: number; lon: number },
  target: { lat: number; lon: number }
) {
  const deltaLat = target.lat - viewer.lat;
  const deltaLon = target.lon - viewer.lon;
  const absLat = Math.abs(deltaLat);
  const absLon = Math.abs(deltaLon);
  if (absLat <= 0.03 && absLon <= 0.03) return 'Centro';
  if (absLat >= absLon * 1.5) return deltaLat >= 0 ? 'Norte' : 'Sul';
  if (absLon >= absLat * 1.5) return deltaLon >= 0 ? 'Leste' : 'Oeste';
  if (deltaLat >= 0 && deltaLon >= 0) return 'Nordeste';
  if (deltaLat >= 0 && deltaLon < 0) return 'Noroeste';
  if (deltaLat < 0 && deltaLon >= 0) return 'Sudeste';
  return 'Sudoeste';
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

function buildWebPushPayload(payload: PushDeliveryPayload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/notifications',
    tag: payload.tag ?? 'nosigilo',
    data: payload.data ?? null,
    icon: payload.icon ?? '/icon-192.svg',
    badge: payload.badge ?? '/icon-192.svg',
  });
}

async function sendPushToUser(
  options: { db: DbHandle; env: Env },
  data: { userId: string; payload: PushDeliveryPayload }
) {
  configureWebPush(options.env);
  const rows = await queryAll(
    options.db,
    'SELECT id, endpoint, subscription_json FROM push_subscriptions WHERE user_id = ?',
    [data.userId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const serializedPayload = buildWebPushPayload(data.payload);
  let sentCount = 0;

  for (const row of rows as any[]) {
    const subscription = safeJsonParse(String(row.subscription_json || '')) as BrowserPushSubscription | null;
    if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      await run(options.db, 'DELETE FROM push_subscriptions WHERE id = ?', [String(row.id)]);
      continue;
    }

    try {
      await webpush.sendNotification(subscription as any, serializedPayload);
      sentCount += 1;
      await run(options.db, 'UPDATE push_subscriptions SET last_used_at = ?, updated_at = ? WHERE id = ?', [
        nowIso(),
        nowIso(),
        String(row.id),
      ]);
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await run(options.db, 'DELETE FROM push_subscriptions WHERE id = ?', [String(row.id)]);
        continue;
      }
      console.error('Falha ao enviar push notification:', error);
    }
  }

  if (sentCount > 0) {
    await options.db.persist();
  }

  return sentCount;
}

async function sendTelegramToUser(
  options: { db: DbHandle; env: Env },
  data: { userId: string; text: string }
) {
  if (!options.env.TELEGRAM_BOT_TOKEN) return;
  const row = (await queryOne(options.db, 'SELECT telegram_chat_id FROM users WHERE id = ?', [data.userId])) as any;
  const chatId = row?.telegram_chat_id;
  if (!chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${options.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: data.text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    console.error('Telegram send error:', err);
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
  const VIDEO_MAX_DURATION_SECONDS = 300; // 5 minutes

  const args = [
    '-y',
    '-i', currentPath,
    '-t', String(VIDEO_MAX_DURATION_SECONDS),
    '-vf', "scale='min(1280,iw)':-2",
    '-c:v', 'libx264',
    '-preset', 'faster',
    '-crf', '24',
    '-maxrate', '2500k',
    '-bufsize', '5000k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ac', '2',
    '-ar', '48000',
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

// ── pHash (difference hash) para imagens — bloqueio de reenvio de conteúdo ────
// Distância de Hamming <= este valor (de 64 bits) é considerada "mesma imagem".
const PHASH_MATCH_THRESHOLD = 10;

// Gera o dHash 9x8 (64 bits) via ffmpeg (sem dependência extra). Retorna 16 hex.
async function computeImagePHash(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const ff = spawn('ffmpeg', ['-y', '-i', filePath, '-vf', 'scale=9:8,format=gray', '-f', 'rawvideo', '-'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      ff.stdout.on('data', (d) => chunks.push(d as Buffer));
      ff.on('error', () => resolve(null));
      ff.on('close', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 72) { resolve(null); return; }
        let bits = '';
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 8; col++) {
            bits += buf[row * 9 + col] < buf[row * 9 + col + 1] ? '1' : '0';
          }
        }
        let hex = '';
        for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
        resolve(hex);
      });
    } catch {
      resolve(null);
    }
  });
}

function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 0xf;
    while (x) { dist += x & 1; x >>= 1; }
  }
  return dist;
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

// Sanitiza o nome da cidade vindo do input do usuário: descarta valores inválidos
// (1-2 letras), que surgem quando alguém digita no campo e não seleciona uma
// cidade da lista. Não há município brasileiro com menos de 3 letras.
function sanitizeCityValue(value: unknown): string | null {
  const v = String(value ?? '').trim();
  return v.length >= 3 ? v : null;
}

async function ensureConversationBetweenUsers(db: DbHandle, userAId: string, userBId: string) {
  const pair = [userAId, userBId].sort((a, b) => a.localeCompare(b));
  const existing = (await queryOne(
    db,
    'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?',
    [pair[0], pair[1]]
  )) as any;
  if (existing?.id) {
    return String(existing.id);
  }

  const conversationId = randomUUID();
  await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [
    conversationId,
    pair[0],
    pair[1],
    nowIso(),
  ]);
  return conversationId;
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
  const row = (await queryOne(options.db, 'SELECT allow_messages, block_outside_prefs, looking_for_json FROM users WHERE id = ? LIMIT 1', [data.toUserId])) as any;
  const setting = row?.allow_messages ? String(row.allow_messages) : 'everyone';
  if (setting === 'nobody') return false;
  // Check block_outside_prefs: if enabled, sender's gender must be in recipient's looking_for list
  if (row?.block_outside_prefs) {
    const lookingFor: string[] = safeJsonParse(row.looking_for_json) ?? [];
    if (lookingFor.length > 0) {
      const sender = (await queryOne(options.db, 'SELECT gender FROM users WHERE id = ? LIMIT 1', [data.fromUserId])) as any;
      const senderGender = sender?.gender ? String(sender.gender) : '';
      if (senderGender && !lookingFor.includes(senderGender)) return false;
    }
  }
  if (setting === 'everyone') return true;
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
  // Prevent browser from offering "Save as" / download for media files
  res.setHeader('Content-Disposition', 'inline');
  // Prevent caching of sensitive media in downstream proxies
  if (mimeType && (mimeType.startsWith('video/') || mimeType.startsWith('image/'))) {
    res.setHeader('Cache-Control', 'private, max-age=3600');
  }

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

const BADGE_THRESHOLDS = {
  veteran:      { days: 90 },
  photographer: { photos: 5 },
  popular:      { likes: 10 },
  active:       { days: 7 },
  connected:    { convs: 3 },
  quick_reply:  { replyRateMinutes: 60 }, // replied within 60 min on avg
  event_goer:   { events: 1 },
} as const;

function computeBadges(row: any): string[] {
  const badges: string[] = [];
  const now = Date.now();

  // ⭐ Perfil verificado
  if (row.is_verified) badges.push('verified');

  // 🏅 Veterano — 90+ dias na plataforma
  const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : null;
  if (createdAt && (now - createdAt) > BADGE_THRESHOLDS.veteran.days * 86400000) {
    badges.push('veteran');
  }

  // 📸 Fotógrafo — 5+ fotos
  if (Number(row.photos_count || 0) >= BADGE_THRESHOLDS.photographer.photos) {
    badges.push('photographer');
  }

  // 🔥 Popular — 10+ curtidas recebidas
  if (Number(row.likes_received || 0) >= BADGE_THRESHOLDS.popular.likes) {
    badges.push('popular');
  }

  // ✅ Ativo — visto nos últimos 7 dias
  const lastSeen = row.last_seen_at ? new Date(String(row.last_seen_at)).getTime() : null;
  if (lastSeen && (now - lastSeen) < BADGE_THRESHOLDS.active.days * 86400000) {
    badges.push('active');
  }

  // 💬 Conectado — 3+ conversas
  if (Number(row.conversations_count || 0) >= BADGE_THRESHOLDS.connected.convs) {
    badges.push('connected');
  }

  // 🎉 Participou de eventos
  if (Number(row.events_count || 0) >= BADGE_THRESHOLDS.event_goer.events) {
    badges.push('event_goer');
  }

  // 💨 Responde rápido — has sent messages (proxy for responsiveness)
  if (Number(row.messages_sent_count || 0) >= 10) {
    badges.push('quick_reply');
  }

  // 🏆 Premium
  if (row.is_premium) badges.push('premium');

  return badges;
}

function rowToPublicUser(
  row: any,
  isOnline?: boolean,
  options?: { showEmail?: boolean; subscriptionsEnabled?: boolean; showLocation?: boolean }
): PublicUser {
  const lookingFor = safeJsonParse(row.looking_for_json);
  return {
    id: String(row.id),
    ...(options?.showEmail ? { email: String(row.email) } : {}),
    name: String(row.name),
    avatar: row.avatar ?? null,
    bio: row.bio ?? null,
    bioLink: row.bio_link ?? null,
    status: row.status ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    birthDate: row.birth_date ?? null,
    partnerBirthDate: row.partner_birth_date ?? null,
    partnerName: row.partner_name ?? null,
    partnerSexualOrientation: row.partner_sexual_orientation ?? null,
    partnerEthnicity: row.partner_ethnicity ?? null,
    partnerHair: row.partner_hair ?? null,
    partnerEyes: row.partner_eyes ?? null,
    partnerHeight: row.partner_height ?? null,
    partnerBodyType: row.partner_body_type ?? null,
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
    blockOutsidePrefs: !!row.block_outside_prefs,
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
    notificationEmail: row.notify_email == null ? true : !!row.notify_email,
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
    telegramChatId: options?.showEmail ? (row.telegram_chat_id ?? null) : null,
    lat: options?.showLocation ? (row.lat != null ? Number(row.lat) : null) : undefined,
    lon: options?.showLocation ? (row.lon != null ? Number(row.lon) : null) : undefined,
    intentions: (() => {
      try { const v = safeJsonParse(row.intentions_json); return Array.isArray(v) ? v : []; } catch { return []; }
    })(),
    fetiches: (() => {
      try { const v = safeJsonParse(row.fetiches_json); return Array.isArray(v) ? v : []; } catch { return []; }
    })(),
    meetingTagline: row.meeting_tagline ?? null,
    availabilityStatus: (() => {
      const s = row.availability_status ?? null;
      const until = row.availability_until ? new Date(row.availability_until).getTime() : null;
      if (!s || (until !== null && until < Date.now())) return null;
      return s as 'now' | 'week' | 'month' | 'online_only' | 'not_looking';
    })(),
    badges: computeBadges(row),
    boosted: !!(row.boost_until && new Date(row.boost_until).getTime() > Date.now()),
    topMonth: row.top_month_position
      ? { position: Number(row.top_month_position), month: row.top_month_month ? String(row.top_month_month) : null }
      : null,
    ambassadorBadges: row.ambassador_badges_csv
      ? String(row.ambassador_badges_csv).split(',').filter(Boolean)
      : null,
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
    `SELECT u.*,
            inviter.name AS inviter_name, inviter.avatar AS inviter_avatar,
            (SELECT GROUP_CONCAT(b.badge_type, ',')
               FROM user_badges b
               WHERE b.user_id = u.id
                 AND b.badge_type IN ('ambassador','ambassador_gold','ambassador_elite')
            ) AS ambassador_badges_csv,
            (SELECT COUNT(*) FROM media m WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'image/%') AS photos_count,
            (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'user' AND l.target_id = u.id) AS likes_received,
            (SELECT COUNT(DISTINCT c.id) FROM conversations c WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)) AS conversations_count,
            (SELECT COUNT(*) FROM messages msg WHERE msg.sender_id = u.id) AS messages_sent_count,
            0 AS events_count
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

// ─── Agendador: e-mail de engajamento (sexta e sábado às 20h, horário de Brasília) ──
let weekendBlastRunning = false;

async function runWeekendEngagementBlast(db: DbHandle, env: Env) {
  if (weekendBlastRunning) return;
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return; // sem provedor de e-mail
  // Kill-switch opcional: system_settings.weekend_engagement_enabled = 'false' desliga.
  try {
    const enabled = await getSystemSetting(db, 'weekend_engagement_enabled');
    if (enabled != null && String(enabled) === 'false') return;
  } catch { /* segue no padrão (ligado) */ }

  // Início do dia atual em Brasília (00:00 BRT = 03:00 UTC) → dedup "já rodou hoje".
  const br = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const startOfBrDayUtcIso = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), 3, 0, 0)).toISOString();
  const ran = (await queryOne(db, "SELECT COUNT(*) as c FROM reengagement_emails WHERE campaign = 'weekend' AND sent_at >= ?", [startOfBrDayUtcIso])) as any;
  if (Number(ran?.c || 0) > 0) return; // já disparou hoje

  weekendBlastRunning = true;
  try {
    const users = (await queryAll(
      db,
      `SELECT u.id, u.name, u.email FROM users u
       WHERE u.email IS NOT NULL AND u.email != '' AND u.email NOT LIKE '%@nosigilo.internal'
         AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND ${db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)'}`,
      []
    )) as any[];

    let sent = 0; let errors = 0;
    for (const user of users) {
      let status: 'sent' | 'skipped' | 'error' = 'error';
      let errorMsg: string | null = null;
      try {
        const r = await sendWeekendEngagementEmail(
          { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
          { to: String(user.email), userName: String(user.name || 'você') }
        );
        status = (r as any)?.skipped ? 'skipped' : 'sent';
        if (status === 'sent') sent++;
      } catch (e: any) {
        status = 'error'; errorMsg = String(e?.message ?? e); errors++;
      }
      if (status !== 'skipped') {
        try {
          await run(db, `INSERT INTO reengagement_emails (id, user_id, sent_at, status, error_message, campaign) VALUES (?, ?, ?, ?, ?, ?)`,
            [randomUUID(), String(user.id), nowIso(), status, errorMsg, 'weekend']);
        } catch (dbErr) { console.error('[weekend-engagement] record fail', user.id, dbErr); }
      }
      await new Promise((res) => setTimeout(res, 120)); // ~8/s: respeita rate-limit do Resend
    }
    try { await db.persist(); } catch { /* non-fatal */ }
    console.log(`[weekend-engagement] blast concluído: enviados=${sent} erros=${errors} de ${users.length}`);
  } finally {
    weekendBlastRunning = false;
  }
}

// Verifica a cada 5 min; dispara uma vez quando entra na janela sex/sáb 20h (BRT).
export function startWeekendEngagementScheduler(db: DbHandle, env: Env) {
  const check = () => {
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // horário de Brasília (UTC-3)
    const day = now.getUTCDay();   // 5 = sexta, 6 = sábado
    const hour = now.getUTCHours();
    if ((day === 5 || day === 6) && hour === 20) {
      void runWeekendEngagementBlast(db, env);
    }
  };
  setInterval(check, 5 * 60 * 1000);
  check(); // já checa no boot (caso o processo reinicie dentro da janela)
  console.log('[weekend-engagement] agendador ativo (sex/sáb 20h BRT)');
}

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
  const pushConfig = configureWebPush(env);

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

  const deleteStoredMedia = async (mediaId: string) => {
    const media = (await queryOne(
      db,
      'SELECT id, user_id, filename, is_main, is_private FROM media WHERE id = ? LIMIT 1',
      [mediaId]
    )) as any;
    if (!media) return null;

    await run(db, 'DELETE FROM media WHERE id = ?', [mediaId]);
    if (media.is_main && !media.is_private) {
      await run(db, 'UPDATE users SET avatar = NULL WHERE id = ?', [String(media.user_id)]);
    }
    await persist();

    const filename = String(media.filename || '');
    const candidateDirs = media.is_private
      ? [privateUploadsDir, ...legacyPrivateUploadsDirCandidates]
      : [uploadsDir, ...legacyUploadsDirCandidates];
    for (const dir of candidateDirs) {
      const filePath = path.join(dir, filename);
      if (!existsSync(filePath)) continue;
      try {
        unlinkSync(filePath);
      } catch {}
    }

    return media;
  };

  // Resolve o caminho físico de uma mídia (público/privado, com fallbacks legados).
  const resolveMediaFilePath = (filename: string, isPrivate: boolean): string | null => {
    const dirs = isPrivate ? [privateUploadsDir, ...legacyPrivateUploadsDirCandidates] : [uploadsDir, ...legacyUploadsDirCandidates];
    for (const dir of dirs) {
      const p = path.join(dir, filename);
      if (existsSync(p)) return p;
    }
    return null;
  };

  // Garante que o arquivo físico esteja na pasta correspondente ao is_private atual
  // do registro. Corrige o descompasso causado pelo toggle público/privado antigo
  // (que só atualizava o banco, sem mover o arquivo) — tanto ao alternar quanto ao
  // servir/consultar a mídia (auto-cura de registros já quebrados). Retorna o
  // caminho final do arquivo, ou null se ele não existir em lugar nenhum.
  const ensureMediaFileInExpectedDir = (filename: string, isPrivate: boolean): string | null => {
    if (!filename) return null;
    const expectedDir = isPrivate ? privateUploadsDir : uploadsDir;
    const expectedPath = path.join(expectedDir, filename);
    if (existsSync(expectedPath)) return expectedPath;

    // Procura em todas as pastas conhecidas (pública, privada e legadas)
    const allDirs = [uploadsDir, privateUploadsDir, ...legacyUploadsDirCandidates, ...legacyPrivateUploadsDirCandidates];
    for (const dir of allDirs) {
      if (dir === expectedDir) continue;
      const found = path.join(dir, filename);
      if (existsSync(found)) {
        try {
          mkdirSync(expectedDir, { recursive: true });
          renameSync(found, expectedPath);
          return expectedPath;
        } catch (err) {
          console.error('[ensureMediaFileInExpectedDir] falha ao mover', filename, err);
          return found; // ao menos serve de onde está
        }
      }
    }
    return null;
  };

  // Verdadeiro se o pHash informado bate com alguma mídia bloqueada (tolerância).
  const isHashBlocked = async (phash: string | null): Promise<boolean> => {
    if (!phash) return false;
    const rows = (await queryAll(db, 'SELECT phash FROM blocked_media_hashes', [])) as any[];
    for (const r of rows) {
      if (hammingHex(phash, String(r.phash || '')) <= PHASH_MATCH_THRESHOLD) return true;
    }
    return false;
  };

  // Adiciona o pHash de uma mídia (por id) à lista de bloqueio. Calcula se faltar.
  const blockMediaHashByMediaId = async (mediaId: string, reason: string, adminId: string | null) => {
    try {
      const m = (await queryOne(db, 'SELECT id, filename, is_private, phash, mime_type FROM media WHERE id = ? LIMIT 1', [mediaId])) as any;
      if (!m || !String(m.mime_type || '').startsWith('image/')) return; // só imagens por enquanto
      let phash = m.phash ? String(m.phash) : null;
      if (!phash) {
        const fp = resolveMediaFilePath(String(m.filename || ''), Number(m.is_private || 0) === 1);
        if (fp) phash = await computeImagePHash(fp);
        if (phash) await run(db, 'UPDATE media SET phash = ? WHERE id = ?', [phash, mediaId]);
      }
      if (!phash) return;
      const exists = await queryOne(db, 'SELECT 1 AS x FROM blocked_media_hashes WHERE phash = ? LIMIT 1', [phash]);
      if (exists) return;
      await run(db, 'INSERT INTO blocked_media_hashes (id, phash, reason, source_media_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), phash, reason, mediaId, adminId, nowIso()]);
    } catch (err) {
      console.error('[blockMediaHash] falhou', err);
    }
  };

  // Bloqueia o pHash de todas as imagens de um usuário (ao banir por uso de imagem).
  const blockUserMediaHashes = async (userId: string, reason: string, adminId: string | null) => {
    const rows = (await queryAll(db, "SELECT id FROM media WHERE user_id = ? AND mime_type LIKE 'image/%'", [userId])) as any[];
    for (const r of rows) await blockMediaHashByMediaId(String(r.id), reason, adminId);
    await persist();
  };

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
    // Self-heal: se o arquivo ficou na pasta privada por causa do toggle antigo,
    // realoca para a pública antes de servir.
    const filePath = ensureMediaFileInExpectedDir(filename, false);
    if (!filePath) {
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
    // Self-heal: se o arquivo ficou na pasta pública por causa do toggle antigo
    // (que não movia o arquivo físico), realoca para a pasta privada antes de servir.
    const filePath = ensureMediaFileInExpectedDir(String(media.filename), true);
    if (!filePath) {
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
  const VIDEO_MAX_BYTES = 500 * 1024 * 1024; // 500 MB for videos (compactado no upload para ~100MB ou menos)

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
    const user = (await queryOne(db, 'SELECT id, name, email, is_banned FROM users WHERE email = ? LIMIT 1', [email])) as any;
    // Contas banidas não recebem código de redefinição (retorna ok para não revelar o status).
    // Contas desativadas seguem permitidas — o reset é o caminho para reativar a conta.
    if (!user || Number(user.is_banned) === 1) {
      res.json({ ok: true });
      return;
    }

    const code = generateVerificationCode();
    const createdAt = nowIso();
    const expiresAt = addMinutesIso(createdAt, 15);
    const codeHash = await bcrypt.hash(code, 10);

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

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
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
      // Links são multi-uso: continuam válidos enquanto não forem revogados.
      canRegister: String(invite.status) !== 'revoked',
      inviter: {
        id: String(invite.inviter_user_id),
        name: String(invite.inviter_name || ''),
        avatar: invite.inviter_avatar ?? null,
      },
    });
  });

  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    try {
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
      if (!invite) {
        res.status(404).json({ error: 'invalid_invite' });
        return;
      }
      // Links são multi-uso: só ficam indisponíveis se forem revogados.
      if (String(invite.status) === 'revoked') {
        res.status(409).json({ error: 'invite_unavailable' });
        return;
      }
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
    // Nome em lista negra (perfil banido) não pode ser reutilizado.
    if (await isNameBlacklisted(db, name)) {
      res.status(409).json({ error: 'name_blacklisted' });
      return;
    }

    const createdAt = nowIso();
    // Homens não recebem período de trial — precisam assinar para ter acesso.
    // Todos os outros perfis (Mulher, Casal, Transexual, etc.) recebem o trial completo.
    const registeredGender = String(parsed.data.gender || '').trim().toLowerCase();
    const isMaleProfile = registeredGender === 'homem' || registeredGender.startsWith('homem ');
    const isFemaleProfile = registeredGender === 'mulher' || registeredGender.startsWith('mulher ');
    // Convites vindos de PROMOTORES entram em cobrança direta (sem trial), para
    // monetizar imediatamente — EXCETO perfis de mulher, que mantêm o trial.
    // (Homem nunca tem trial.) Vale só para links cujo dono é um promotor ATIVO.
    let fromPromoter = false;
    if (invite?.inviter_user_id) {
      const promoterRow = await queryOne(
        db,
        "SELECT id FROM promoters WHERE user_id = ? AND status = 'active' LIMIT 1",
        [invite.inviter_user_id]
      );
      fromPromoter = !!promoterRow;
    }
    const trialEndsAt = (isMaleProfile || (fromPromoter && !isFemaleProfile))
      ? createdAt
      : addDaysIso(createdAt, env.TRIAL_DAYS);
    const id = randomUUID();
    const registrationIpHash = hashRequestIp(env, getRequestIp(req));
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    await run(
      db,
      `
      INSERT INTO users (
        id, email, password_hash, name, avatar, bio, status, city, state, birth_date, gender, marital_status,
        sexual_orientation, ethnicity, hair, eyes, height, body_type, smokes, drinks, profession, zodiac_sign,
        looking_for_json, is_verified, is_premium, is_admin, created_at, trial_started_at, trial_ends_at,
        invited_by_user_id, invite_status, registration_ip_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        id,
        email,
        passwordHash,
        parsed.data.name,
        '',
        null,
        null,
        sanitizeCityValue(parsed.data.city),
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
        registrationIpHash,
      ]
    );
    if (invite) {
      // Compute validation deadline (REFERRAL_VALIDATION_DAYS days from signup)
      const validationDeadline = addDaysIso(createdAt, REFERRAL_VALIDATION_DAYS);
      // Check if same IP as inviter (soft flag, not a hard block)
      const inviterRow = (await queryOne(
        db,
        'SELECT registration_ip_hash FROM users WHERE id = ? LIMIT 1',
        [String(invite.inviter_user_id)]
      )) as any;
      const sameIpAsInviter =
        registrationIpHash &&
        inviterRow?.registration_ip_hash &&
        registrationIpHash === String(inviterRow.registration_ip_hash);

      await run(
        db,
        `INSERT INTO invite_link_entries
           (id, invite_link_id, invitee_user_id, invitee_email, created_at,
            validation_status, invitee_ip_hash, validation_deadline, actions_bitmask, failed_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          String(invite.id),
          id,
          email,
          createdAt,
          sameIpAsInviter ? 'failed' : 'pending',
          registrationIpHash,
          sameIpAsInviter ? null : validationDeadline,
          0,
          sameIpAsInviter ? 'same_ip_as_inviter' : null,
        ]
      );
      // Multi-uso: NÃO mudamos o status para 'approved' (isso tornava o link de
      // uso único). O link permanece 'created' (ativo) para os próximos cadastros;
      // só registramos os timestamps de primeiro uso.
      await run(
        db,
        'UPDATE invite_links SET approved_at = COALESCE(approved_at, ?), used_at = COALESCE(used_at, ?), updated_at = ? WHERE id = ?',
        [createdAt, createdAt, createdAt, String(invite.id)]
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
    if (!userRow) {
      console.error('[register] getUserWithSponsorById returned null for newly created user id:', id);
      res.status(500).json({ error: 'server_error' });
      return;
    }
    const presence = req.app.get('presence');
    const globalEnabledReg = await getSubscriptionsEnabled(db);
    const subscriptionsEnabled = isBillingEnabledForUser(globalEnabledReg, String((userRow as any)?.email || ''), env.BILLING_TEST_EMAILS);
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
    } catch (err) {
      console.error('[register] unexpected error:', err);
      if (!res.headersSent) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'server_error', debug: message });
      }
    }
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
    if (Number(row.is_deactivated || 0) === 1 && Number(row.deactivated_by_admin || 0) === 1) {
      res.status(403).json({ error: 'account_deactivated_by_admin' });
      return;
    }
    if (!row.password_hash) {
      // Google-only account — cannot log in with password
      res.status(401).json({ error: 'use_google_login' });
      return;
    }
    const ok = bcrypt.compareSync(parsed.data.password, String(row.password_hash));
    if (!ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    // Auto-reactivate deactivated profile on successful login
    if (Number(row.is_deactivated || 0) === 1 && Number(row.deactivated_by_admin || 0) !== 1) {
      await run(
        db,
        'UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivated_by_admin = 0, deactivated_by = NULL WHERE id = ?',
        [String(row.id)]
      );
      await persist();
    }
    // Skip HubBilling sync for billing-test whitelist users so manual DB overrides persist
    const isTestUser = isBillingEnabledForUser(false, String(row.email || ''), env.BILLING_TEST_EMAILS)
      && !await getSubscriptionsEnabled(db);
    if (shouldUseHubBilling(env) && !isTestUser) {
      try {
        const hubLoginTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('HubBilling timeout')), 8000)
        );
        const hubResult = await Promise.race([
          String(row.hub_customer_id || '').trim()
            ? getHubAccessStatus(getHubConfig(env), String(row.hub_customer_id))
            : resolveHubAccess(getHubConfig(env), {
                email: String(row.email),
                name: String(row.name),
                document: row.billing_document ?? null,
                personType: row.billing_person_type ?? null,
              }),
          hubLoginTimeout,
        ]);
        // Guard: don't downgrade a currently-active premium user to blocked/no_license
        // unless their license has explicitly expired. This protects against transient
        // HubBilling glitches revoking access on new-device logins.
        const wasPremium = Number(row.is_premium || 0) === 1;
        const hubBlocking = hubResult.accessStatus !== 'licensed' && hubResult.accessStatus !== 'trial';
        const licenseEndAt = hubResult.licenseEndAt ? new Date(hubResult.licenseEndAt).getTime() : null;
        const licenseExpired = licenseEndAt !== null && licenseEndAt < Date.now();
        if (wasPremium && hubBlocking && !licenseExpired) {
          // Preserve premium access — log warning but don't revoke
          console.warn(`[login] HubBilling returned '${hubResult.accessStatus}' for premium user ${row.id} (license not yet expired) — preserving is_premium=1`);
          // Still sync non-premium fields (customer/product IDs, banner, etc.) but force licensed state
          await syncHubAccessForUser(db, String(row.id), { ...hubResult, accessStatus: 'licensed' }, { io: req.app.get('io') as SocketIOServer | undefined, env });
        } else {
          await syncHubAccessForUser(db, String(row.id), hubResult, { io: req.app.get('io') as SocketIOServer | undefined, env });
        }
        await persist();
      } catch (error) {
        console.error('Hub Billing resolveAccess failed on login:', error);
      }
    }
    const hydratedRow = await getUserWithSponsorById(db, String(row.id));
    const presence = req.app.get('presence');
    const globalEnabled = await getSubscriptionsEnabled(db);
    const subscriptionsEnabled = isBillingEnabledForUser(globalEnabled, String(row.email || ''), env.BILLING_TEST_EMAILS);
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

  // ── TELEGRAM INTEGRATION ────────────────────────────────────────────────────

  // Generate a deep-link token for the user to connect their Telegram
  app.post('/api/profile/telegram/link', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const token = randomUUID().replace(/-/g, '');
    await run(db, 'UPDATE users SET telegram_link_token = ? WHERE id = ?', [token, userId]);
    await persist();
    const botUsername = String(env.TELEGRAM_BOT_USERNAME || 'NosigiloNetBot');
    res.json({ url: `https://t.me/${botUsername}?start=${token}` });
  });

  // Disconnect Telegram
  app.delete('/api/profile/telegram', requireAuth(env, db), async (req, res) => {
    await run(db, 'UPDATE users SET telegram_chat_id = NULL, telegram_link_token = NULL WHERE id = ?', [req.auth!.userId]);
    await persist();
    res.json({ ok: true });
  });

  // Telegram bot webhook — receives messages from Telegram
  app.post('/api/telegram/webhook', async (req, res) => {
    res.json({ ok: true }); // always respond fast
    try {
      const update = req.body as any;
      const message = update?.message;
      if (!message) return;
      const chatId = String(message.chat?.id || '');
      const text = String(message.text || '').trim();
      if (!chatId) return;

      // /start <token> — link this chat_id to the user account
      const startMatch = text.match(/^\/start\s+([a-f0-9]{32})$/i);
      if (startMatch) {
        const token = startMatch[1];
        const row = (await queryOne(db, 'SELECT id, name FROM users WHERE telegram_link_token = ? LIMIT 1', [token])) as any;
        if (!row) return;
        await run(db, 'UPDATE users SET telegram_chat_id = ?, telegram_link_token = NULL WHERE id = ?', [chatId, String(row.id)]);
        await persist();
        const name = row.name ? String(row.name) : 'você';
        if (env.TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              parse_mode: 'HTML',
              text: `✅ <b>Telegram conectado!</b>\n\nOlá, ${name}! Agora você vai receber notificações do NoSigilo aqui:\n\n📡 Radares próximos a você\n💞 Matches mútuos\n\nPara desconectar, acesse Configurações → Notificações no app.`,
            }),
          });
        }
        return;
      }

      // Unknown message — send a friendly reply
      if (env.TELEGRAM_BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `Para conectar sua conta NoSigilo, acesse <b>Configurações → Notificações</b> no app e clique em <b>Conectar Telegram</b>.`,
          }),
        });
      }
    } catch (err) {
      console.error('Telegram webhook error:', err);
    }
  });

  // ── END TELEGRAM ─────────────────────────────────────────────────────────────

  app.get('/api/invites/reward-progress', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;

    // Count validated referrals
    const validatedCount = await countValidatedReferrals(db, userId);

    // Determine next tier
    const nextTier = REFERRAL_TIERS.find((t) => validatedCount < t.count) ?? null;

    // Tiers already granted
    const rewardRows = (await queryAll(
      db,
      'SELECT reward_type, valid_invites_count, premium_days_granted, granted_at FROM referral_rewards WHERE inviter_user_id = ? ORDER BY valid_invites_count ASC',
      [userId]
    )) as any[];

    // Earned badges of ambassador types
    const badgeRows = (await queryAll(
      db,
      `SELECT badge_type, earned_at FROM user_badges WHERE user_id = ? AND badge_type IN ('ambassador','ambassador_gold','ambassador_elite') ORDER BY earned_at ASC`,
      [userId]
    )) as any[];

    // Recent invite entries with their validation status (last 20)
    const entryRows = (await queryAll(
      db,
      `SELECT ile.id, ile.invite_link_id, ile.validation_status, ile.validated_at, ile.failed_reason,
              ile.actions_bitmask, ile.validation_deadline, ile.created_at,
              u.name AS invitee_name, u.avatar AS invitee_avatar
       FROM invite_link_entries ile
       JOIN invite_links il ON il.id = ile.invite_link_id
       LEFT JOIN users u ON u.id = ile.invitee_user_id
       WHERE il.inviter_user_id = ?
       ORDER BY ile.created_at DESC
       LIMIT 20`,
      [userId]
    )) as any[];

    res.json({
      validatedCount,
      nextTier: nextTier
        ? { count: nextTier.count, days: nextTier.days, rewardType: nextTier.rewardType, label: nextTier.label }
        : null,
      tiers: REFERRAL_TIERS.map((t) => ({
        count: t.count,
        days: t.days,
        rewardType: t.rewardType,
        label: t.label,
        reached: validatedCount >= t.count,
        granted: rewardRows.some((r) => String(r.reward_type) === t.rewardType),
      })),
      rewards: rewardRows.map((r) => ({
        rewardType: String(r.reward_type),
        validInvitesCount: Number(r.valid_invites_count),
        premiumDaysGranted: Number(r.premium_days_granted),
        grantedAt: String(r.granted_at),
      })),
      badges: badgeRows.map((b) => ({ badgeType: String(b.badge_type), earnedAt: String(b.earned_at) })),
      recentEntries: entryRows.map((e) => ({
        id: String(e.id),
        validationStatus: String(e.validation_status ?? 'pending'),
        validatedAt: e.validated_at ? String(e.validated_at) : null,
        failedReason: e.failed_reason ? String(e.failed_reason) : null,
        actionsBitmask: Number(e.actions_bitmask ?? 0),
        validationDeadline: e.validation_deadline ? String(e.validation_deadline) : null,
        createdAt: String(e.created_at ?? ''),
        inviteeName: e.invitee_name ? String(e.invitee_name) : null,
        inviteeAvatar: e.invitee_avatar ? String(e.invitee_avatar) : null,
      })),
    });
  });

  app.post('/api/invites', requireAuth(env, db), async (req, res) => {
    const now = nowIso();
    const id = randomUUID();
    const token = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
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
      url: `${String(env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '')}/invite/${encodeURIComponent(token)}`,
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
    if (String(invite.status) === 'revoked') {
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

  // ── Programa de Indicação (Promotores) ────────────────────────────────────

  app.post('/api/promoter/activate', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      fullName: z.string().min(3).max(200),
      pixKey: z.string().min(5).max(200),
      whatsapp: z.string().min(10).max(20).optional(),
      contactEmail: z.string().email().max(200).optional(),
      acceptTerms: z.literal(true),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const userId = req.auth!.userId;
    const { fullName, pixKey, whatsapp, contactEmail } = parsed.data;
    const existing = await queryOne(db, 'SELECT id FROM promoters WHERE user_id = ? LIMIT 1', [userId]);
    if (existing) {
      await run(db, 'UPDATE promoters SET full_name = ?, pix_key = ?, whatsapp = ?, contact_email = ?, status = ? WHERE user_id = ?', [fullName, pixKey, whatsapp ?? null, contactEmail ?? null, 'active', userId]);
      await persist();
      res.json({ ok: true, updated: true });
      return;
    }
    const now = nowIso();
    await run(
      db,
      'INSERT INTO promoters (id, user_id, full_name, pix_key, whatsapp, contact_email, status, accepted_terms_at, activated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), userId, fullName, pixKey, whatsapp ?? null, contactEmail ?? null, 'active', now, now, now]
    );
    await persist();
    res.json({ ok: true, created: true });
  });

  app.get('/api/promoter/profile', requireAuth(env, db), async (req, res) => {
    const row = await queryOne(db, 'SELECT * FROM promoters WHERE user_id = ? LIMIT 1', [req.auth!.userId]);
    if (!row) { res.json({ promoter: null }); return; }
    const r = row as any;
    res.json({ promoter: { id: String(r.id), fullName: String(r.full_name), pixKey: String(r.pix_key), whatsapp: r.whatsapp ? String(r.whatsapp) : null, contactEmail: r.contact_email ? String(r.contact_email) : null, status: String(r.status), activatedAt: String(r.activated_at) } });
  });

  app.get('/api/promoter/dashboard', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const promoterRow = await queryOne(db, 'SELECT * FROM promoters WHERE user_id = ? LIMIT 1', [userId]);
    if (!promoterRow) { res.status(404).json({ error: 'not_a_promoter' }); return; }
    const pr = promoterRow as any;
    const invitesRow = await queryOne(db, "SELECT COUNT(*) as c FROM invite_links WHERE inviter_user_id = ? AND status != 'revoked'", [userId]) as any;
    const signupsRow = await queryOne(db, `SELECT COUNT(*) as c FROM invite_link_entries e JOIN invite_links l ON l.id = e.invite_link_id WHERE l.inviter_user_id = ?`, [userId]) as any;
    const commissions = (await queryAll(db, 'SELECT * FROM promoter_commissions WHERE promoter_user_id = ? ORDER BY created_at DESC LIMIT 100', [userId])) as any[];
    const active = commissions.filter((c) => c.status !== 'cancelled');
    const pending = commissions.filter((c) => c.status === 'pending');
    const approved = commissions.filter((c) => c.status === 'approved');
    const paid = commissions.filter((c) => c.status === 'paid');
    const sum = (arr: any[]) => arr.reduce((s, c) => s + Number(c.commission_amount || 0), 0);

    // Usuários que entraram pelos links deste promotor, com o status atual de cada um
    // (assinante / trial / expirado / desativado / banido) para o promotor acompanhar.
    const referredRows = (await queryAll(
      db,
      `SELECT inv.id, inv.name, inv.email, inv.avatar, inv.is_banned, inv.is_deactivated,
              inv.is_premium, inv.hub_license_end_at, inv.trial_ends_at, e.created_at AS joined_at
       FROM invite_link_entries e
       JOIN invite_links l ON l.id = e.invite_link_id
       JOIN users inv ON inv.id = e.invitee_user_id
       WHERE l.inviter_user_id = ?
       ORDER BY e.created_at DESC`,
      [userId]
    )) as any[];

    const nowMs = Date.now();
    const parseMs = (v: any) => { if (!v) return null; const t = new Date(String(v)).getTime(); return Number.isNaN(t) ? null : t; };
    const computeStatus = (r: any): 'subscriber' | 'trial' | 'expired' | 'deactivated' | 'banned' => {
      if (Number(r.is_banned || 0) === 1) return 'banned';
      if (Number(r.is_deactivated || 0) === 1) return 'deactivated';
      const lic = parseMs(r.hub_license_end_at);
      const trial = parseMs(r.trial_ends_at);
      if (Number(r.is_premium || 0) === 1 && (lic === null || lic > nowMs)) return 'subscriber';
      if (trial !== null && trial > nowMs) return 'trial';
      return 'expired';
    };
    const seenReferred = new Set<string>();
    const referredUsers = referredRows
      .filter((r) => { const id = String(r.id); if (seenReferred.has(id)) return false; seenReferred.add(id); return true; })
      .map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        avatar: r.avatar ? String(r.avatar) : null,
        status: computeStatus(r),
        joinedAt: String(r.joined_at || ''),
        licenseEndAt: r.hub_license_end_at ? String(r.hub_license_end_at) : null,
      }));
    const referredCounts = referredUsers.reduce(
      (acc, u) => { acc[u.status] = (acc[u.status] || 0) + 1; return acc; },
      {} as Record<string, number>
    );

    res.json({
      promoter: { id: String(pr.id), fullName: String(pr.full_name), pixKey: String(pr.pix_key), status: String(pr.status), activatedAt: String(pr.activated_at) },
      stats: {
        invitesSent: Number(invitesRow?.c ?? 0),
        totalSignups: Number(signupsRow?.c ?? 0),
        totalSubscriptions: active.length,
        totalCommissionCents: sum(active),
        pendingCents: sum(pending),
        approvedCents: sum(approved),
        paidCents: sum(paid),
      },
      referredCounts,
      referredUsers,
      commissions: commissions.slice(0, 50).map((c) => ({
        id: String(c.id),
        subscriptionAmount: Number(c.subscription_amount),
        commissionAmount: Number(c.commission_amount),
        status: String(c.status),
        period: c.period ?? null,
        paidAt: c.paid_at ?? null,
        createdAt: String(c.created_at),
      })),
    });
  });

  // Admin: list promoters
  app.get('/api/admin/promoters', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const rows = (await queryAll(
      db,
      `SELECT p.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar,
        (SELECT COUNT(*) FROM promoter_commissions pc WHERE pc.promoter_user_id = p.user_id AND pc.status != 'cancelled') as total_subscriptions,
        (SELECT COALESCE(SUM(pc.commission_amount),0) FROM promoter_commissions pc WHERE pc.promoter_user_id = p.user_id AND pc.status = 'pending') as pending_cents,
        (SELECT COALESCE(SUM(pc.commission_amount),0) FROM promoter_commissions pc WHERE pc.promoter_user_id = p.user_id AND pc.status = 'approved') as approved_cents,
        (SELECT COALESCE(SUM(pc.commission_amount),0) FROM promoter_commissions pc WHERE pc.promoter_user_id = p.user_id AND pc.status = 'paid') as paid_cents
       FROM promoters p JOIN users u ON u.id = p.user_id ORDER BY p.activated_at DESC`,
      []
    )) as any[];
    res.json({ promoters: rows.map((r) => ({
      id: String(r.id), userId: String(r.user_id), fullName: String(r.full_name), pixKey: String(r.pix_key),
      whatsapp: r.whatsapp ? String(r.whatsapp) : null,
      contactEmail: r.contact_email ? String(r.contact_email) : null,
      status: String(r.status), activatedAt: String(r.activated_at),
      userName: String(r.user_name || ''), userEmail: String(r.user_email || ''), userAvatar: r.user_avatar ?? null,
      totalSubscriptions: Number(r.total_subscriptions || 0),
      pendingCents: Number(r.pending_cents || 0),
      approvedCents: Number(r.approved_cents || 0),
      paidCents: Number(r.paid_cents || 0),
    })) });
  });

  // Admin: list all commissions
  app.get('/api/admin/promoter-commissions', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = (await queryAll(
      db,
      `SELECT pc.*, p.full_name as promoter_name, p.pix_key as promoter_pix
       FROM promoter_commissions pc
       JOIN promoters p ON p.user_id = pc.promoter_user_id
       ${status ? 'WHERE pc.status = ?' : ''}
       ORDER BY pc.created_at DESC LIMIT 200`,
      status ? [status] : []
    )) as any[];
    res.json({ commissions: rows.map((r) => ({
      id: String(r.id), promoterUserId: String(r.promoter_user_id), promoterName: String(r.promoter_name || ''),
      promoterPix: String(r.promoter_pix || ''), subscriberUserId: String(r.subscriber_user_id),
      subscriptionAmount: Number(r.subscription_amount), commissionAmount: Number(r.commission_amount),
      status: String(r.status), period: r.period ?? null, paidAt: r.paid_at ?? null, createdAt: String(r.created_at),
    })) });
  });

  // Admin: update commission status
  app.patch('/api/admin/promoter-commissions/:id', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const schema = z.object({ status: z.enum(['pending', 'approved', 'paid', 'cancelled']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const paidAt = parsed.data.status === 'paid' ? nowIso() : null;
    await run(db, 'UPDATE promoter_commissions SET status = ?, paid_at = COALESCE(?, paid_at) WHERE id = ?', [parsed.data.status, paidAt, String(req.params.id || '')]);
    await persist();
    res.json({ ok: true });
  });

  // ── Suporte ao Promotor (chat) ─────────────────────────────────────────────

  // Promotor: listar mensagens do próprio suporte
  // Suporte disponível para QUALQUER usuário autenticado (não só promotores).
  // A tabela promoter_support_messages é chaveada por user_id; o mesmo canal
  // atende promotores e usuários comuns (ex.: dúvida de pagamento no PIX).
  app.get('/api/promoter/support', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const msgs = (await queryAll(
      db,
      'SELECT * FROM promoter_support_messages WHERE promoter_user_id = ? ORDER BY created_at ASC',
      [userId]
    )) as any[];
    // Mark admin messages as read
    await run(db, "UPDATE promoter_support_messages SET read_at = ? WHERE promoter_user_id = ? AND sender_type = 'admin' AND read_at IS NULL", [nowIso(), userId]);
    res.json({ messages: msgs.map((m) => ({ id: String(m.id), senderType: String(m.sender_type), message: String(m.message), readAt: m.read_at ?? null, createdAt: String(m.created_at) })) });
  });

  // Enviar mensagem para o suporte (qualquer usuário autenticado, ver acima).
  app.post('/api/promoter/support', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const schema = z.object({ message: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const now = nowIso();
    const id = randomUUID();
    await run(db, 'INSERT INTO promoter_support_messages (id, promoter_user_id, sender_type, sender_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, userId, 'promoter', userId, parsed.data.message, now]);
    await persist();
    res.json({ ok: true, id });
  });

  // Admin: listar todos os chats de suporte (com última mensagem + não lidas)
  app.get('/api/admin/promoter-support', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    // Lista TODOS os usuários com histórico de suporte (promotor ou não). Parte
    // dos user_ids distintos que já enviaram/receberam mensagem; LEFT JOIN em
    // promoters preenche nome/pix quando existir, senão cai no nome/e-mail do user.
    const rows = (await queryAll(
      db,
      `SELECT s.user_id,
         COALESCE(p.full_name, u.name) as full_name,
         COALESCE(p.pix_key, '') as pix_key,
         CASE WHEN p.user_id IS NULL THEN 0 ELSE 1 END as is_promoter,
         u.email as user_email, u.avatar as user_avatar,
         (SELECT message FROM promoter_support_messages WHERE promoter_user_id = s.user_id ORDER BY created_at DESC LIMIT 1) as last_message,
         (SELECT created_at FROM promoter_support_messages WHERE promoter_user_id = s.user_id ORDER BY created_at DESC LIMIT 1) as last_message_at,
         (SELECT COUNT(*) FROM promoter_support_messages WHERE promoter_user_id = s.user_id AND sender_type = 'promoter' AND read_at IS NULL) as unread_count
       FROM (SELECT DISTINCT promoter_user_id as user_id FROM promoter_support_messages) s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN promoters p ON p.user_id = s.user_id
       ORDER BY last_message_at DESC NULLS LAST`,
      []
    )) as any[];
    res.json({ chats: rows.map((r) => ({
      userId: String(r.user_id), fullName: String(r.full_name || 'Usuário'), pixKey: String(r.pix_key || ''),
      isPromoter: Number(r.is_promoter || 0) === 1,
      userEmail: String(r.user_email || ''), userAvatar: r.user_avatar ?? null,
      lastMessage: r.last_message ?? null, lastMessageAt: r.last_message_at ?? null,
      unreadCount: Number(r.unread_count || 0),
    })) });
  });

  // Admin: mensagens de um promotor específico
  app.get('/api/admin/promoter-support/:userId', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const targetUserId = String(req.params.userId || '');
    const msgs = (await queryAll(db, 'SELECT * FROM promoter_support_messages WHERE promoter_user_id = ? ORDER BY created_at ASC', [targetUserId])) as any[];
    // Mark promoter messages as read
    await run(db, "UPDATE promoter_support_messages SET read_at = ? WHERE promoter_user_id = ? AND sender_type = 'promoter' AND read_at IS NULL", [nowIso(), targetUserId]);
    res.json({ messages: msgs.map((m) => ({ id: String(m.id), senderType: String(m.sender_type), message: String(m.message), readAt: m.read_at ?? null, createdAt: String(m.created_at) })) });
  });

  // Admin: responder a um promotor
  app.post('/api/admin/promoter-support/:userId', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const targetUserId = String(req.params.userId || '');
    const schema = z.object({ message: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const now = nowIso();
    const id = randomUUID();
    await run(db, 'INSERT INTO promoter_support_messages (id, promoter_user_id, sender_type, sender_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, targetUserId, 'admin', req.auth!.userId, parsed.data.message, now]);
    await persist();
    res.json({ ok: true, id });

    // Best-effort, em background: avisa por e-mail, caso o usuário não esteja
    // logado quando a resposta chegar. Nunca bloqueia nem derruba a resposta
    // do admin se o envio falhar (mesmo padrão do webhook de pagamento).
    try {
      const target = (await queryOne(db, 'SELECT email, name FROM users WHERE id = ?', [targetUserId])) as any;
      if (target?.email) {
        await sendSupportReplyEmail(
          {
            apiKey: env.RESEND_API_KEY,
            fromEmail: env.RESEND_FROM_EMAIL,
            appName: env.APP_NAME || 'NoSigilo',
            siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net',
          },
          { to: String(target.email), userName: target.name, message: parsed.data.message }
        );
      }
    } catch (err) {
      console.error('[admin/promoter-support] e-mail de resposta falhou:', err);
    }
  });

  // Admin: batch approve commissions (by period)
  app.post('/api/admin/promoter-commissions/batch-approve', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
    const result = await run(db, "UPDATE promoter_commissions SET status = 'approved' WHERE period = ? AND status = 'pending'", [parsed.data.period]);
    await persist();
    res.json({ ok: true });
  });

  // Admin: batch pay commissions (mark all approved as paid)
  app.post('/api/admin/promoter-commissions/batch-pay', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional(), promoterUserId: z.string().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }
      const now = nowIso();

      // 1. Coleta as comissões aprovadas que serão pagas AGORA (com dados do promotor),
      //    para saber os totais por promotor e emitir o recibo depois do UPDATE.
      let selectQ = `SELECT pc.id, pc.commission_amount, pc.promoter_user_id, pc.period,
          p.full_name AS promoter_name, p.pix_key AS promoter_pix,
          COALESCE(p.contact_email, u.email) AS notify_email
        FROM promoter_commissions pc
        JOIN promoters p ON p.user_id = pc.promoter_user_id
        JOIN users u ON u.id = pc.promoter_user_id
        WHERE pc.status = 'approved'`;
      const selParams: any[] = [];
      if (parsed.data.period) { selectQ += ' AND pc.period = ?'; selParams.push(parsed.data.period); }
      if (parsed.data.promoterUserId) { selectQ += ' AND pc.promoter_user_id = ?'; selParams.push(parsed.data.promoterUserId); }
      const toPay = (await queryAll(db, selectQ, selParams)) as any[];

      if (toPay.length === 0) { res.json({ ok: true, paid: 0, promotersPaid: 0, receiptsSent: 0 }); return; }

      // 2. Marca como pagas.
      let q = "UPDATE promoter_commissions SET status = 'paid', paid_at = ? WHERE status = 'approved'";
      const params: any[] = [now];
      if (parsed.data.period) { q += ' AND period = ?'; params.push(parsed.data.period); }
      if (parsed.data.promoterUserId) { q += ' AND promoter_user_id = ?'; params.push(parsed.data.promoterUserId); }
      await run(db, q, params);
      await persist();

      // 3. Agrupa por promotor+período e envia um recibo por grupo (best-effort).
      const groups = new Map<string, { name: string; pix: string; email: string; period: string; count: number; totalCents: number }>();
      for (const r of toPay) {
        const key = `${String(r.promoter_user_id)}|${String(r.period || '')}`;
        if (!groups.has(key)) {
          groups.set(key, {
            name: String(r.promoter_name || 'Promotor'),
            pix: String(r.promoter_pix || ''),
            email: String(r.notify_email || ''),
            period: String(r.period || ''),
            count: 0,
            totalCents: 0,
          });
        }
        const g = groups.get(key)!;
        g.count += 1;
        g.totalCents += Number(r.commission_amount || 0);
      }

      const paidAtStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      let receiptsSent = 0;
      for (const g of groups.values()) {
        if (!g.email) continue;
        try {
          const receiptNo = `${g.period || 'X'}-${randomUUID().slice(0, 8).toUpperCase()}`;
          const result = await sendPromoterPaymentReceiptEmail(
            { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
            { to: g.email, promoterName: g.name, promoterPix: g.pix, period: g.period, count: g.count, totalCents: g.totalCents, paidAtStr, receiptNo }
          );
          if (!(result as any)?.skipped) receiptsSent++;
        } catch (e: any) {
          console.error('[batch-pay receipt]', g.email, e?.message);
        }
        await new Promise((r) => setTimeout(r, 120));
      }

      res.json({ ok: true, paid: toPay.length, promotersPaid: groups.size, receiptsSent });
    } catch (err) {
      console.error('[promoter-commissions/batch-pay]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Admin: enviar resumo mensal de comissões para todos os promotores ativos
  app.post('/api/admin/promoters/send-monthly-summary', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const schema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'invalid_input — period deve ser YYYY-MM' }); return; }
      const { period } = parsed.data;

      // Due date: dia 10 do mês seguinte ao período
      const [py, pm] = period.split('-').map(Number);
      const dueDate = new Date(py, pm, 10); // pm é o mês atual (1-indexed), Date usa 0-indexed, então pm = próximo mês
      const dueDateStr = dueDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      // Buscar todos os promotores ativos com seus dados e comissões do período
      const rows = (await queryAll(
        db,
        `SELECT p.user_id, p.full_name,
          COALESCE(p.contact_email, u.email) AS notify_email,
          COALESCE(SUM(CASE WHEN pc.status != 'cancelled' THEN pc.commission_amount ELSE 0 END), 0) AS total_commission,
          COALESCE(SUM(CASE WHEN pc.status = 'pending'  THEN pc.commission_amount ELSE 0 END), 0) AS pending_cents,
          COALESCE(SUM(CASE WHEN pc.status = 'approved' THEN pc.commission_amount ELSE 0 END), 0) AS approved_cents,
          COALESCE(SUM(CASE WHEN pc.status = 'paid'     THEN pc.commission_amount ELSE 0 END), 0) AS paid_cents,
          COUNT(CASE WHEN pc.status != 'cancelled' THEN 1 END) AS total_subscriptions
         FROM promoters p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN promoter_commissions pc ON pc.promoter_user_id = p.user_id AND pc.period = ?
         WHERE p.status = 'active'
           AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         GROUP BY p.user_id, p.full_name, p.contact_email, u.email`,
        [period]
      )) as any[];

      let sent = 0; let errors = 0; let skipped = 0;
      for (const row of rows) {
        const email = String(row.notify_email || '');
        if (!email) { skipped++; continue; }
        try {
          const result = await sendPromoterMonthlySummaryEmail(
            { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
            {
              to: email,
              promoterName: String(row.full_name || 'Promotor'),
              period,
              totalSubscriptions: Number(row.total_subscriptions || 0),
              commissionCents: Number(row.total_commission || 0),
              pendingCents: Number(row.pending_cents || 0),
              approvedCents: Number(row.approved_cents || 0),
              paidCents: Number(row.paid_cents || 0),
              dueDate: dueDateStr,
            }
          );
          if ((result as any)?.skipped) { skipped++; continue; }
          sent++;
        } catch (e: any) {
          console.error('[send-monthly-summary] error for', row.user_id, e?.message);
          errors++;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      try { await persist(); } catch { /* non-fatal */ }
      res.json({ sent, errors, skipped, total: rows.length, period, dueDate: dueDateStr });
    } catch (err) {
      console.error('[admin/promoters/send-monthly-summary]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // Incentivo aos promotores ativos: e-mail motivacional (não é o resumo mensal
  // de comissões) reforçando o engajamento com estatísticas pessoais (indicações
  // e ganhos até hoje) + CTA para o painel de promotor.
  app.post('/api/admin/promoters/send-incentive', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const rows = (await queryAll(
        db,
        `SELECT p.user_id, p.full_name,
          COALESCE(p.contact_email, u.email) AS notify_email,
          COUNT(DISTINCT pc.subscriber_user_id) AS total_referred,
          COALESCE(SUM(CASE WHEN pc.status != 'cancelled' THEN pc.commission_amount ELSE 0 END), 0) AS total_earned_cents
         FROM promoters p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN promoter_commissions pc ON pc.promoter_user_id = p.user_id
         WHERE p.status = 'active'
           AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         GROUP BY p.user_id, p.full_name, p.contact_email, u.email`,
        []
      )) as any[];

      let sent = 0; let errors = 0; let skipped = 0;
      for (const row of rows) {
        const email = String(row.notify_email || '');
        if (!email) { skipped++; continue; }
        try {
          const result = await sendPromoterIncentiveEmail(
            { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
            {
              to: email,
              promoterName: String(row.full_name || 'Promotor'),
              totalReferred: Number(row.total_referred || 0),
              totalEarnedCents: Number(row.total_earned_cents || 0),
            }
          );
          if ((result as any)?.skipped) { skipped++; continue; }
          sent++;
        } catch (e: any) {
          console.error('[send-incentive] error for', row.user_id, e?.message);
          errors++;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      res.json({ sent, errors, skipped, total: rows.length });
    } catch (err) {
      console.error('[admin/promoters/send-incentive]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ── END Suporte ao Promotor ────────────────────────────────────────────────

  // ── END Programa de Indicação ──────────────────────────────────────────────

  app.get('/api/auth/me', requireAuth(env, db), async (req, res) => {
    const row = await getUserWithSponsorById(db, req.auth!.userId);
    const presence = req.app.get('presence');
    const globalEnabled = await getSubscriptionsEnabled(db);
    const subscriptionsEnabled = isBillingEnabledForUser(globalEnabled, String((row as any)?.email || ''), env.BILLING_TEST_EMAILS);
    const promoterRow = await queryOne(db, "SELECT id FROM promoters WHERE user_id = ? AND status = 'active' LIMIT 1", [req.auth!.userId]);
    const user = rowToPublicUser(row, presence?.isOnline(String((row as any)?.id)), {
      showEmail: true,
      subscriptionsEnabled,
      showLocation: true,
    });
    res.json({ ...user, isPromoter: !!promoterRow });
  });

  app.post('/api/auth/refresh', requireAuth(env, db), async (req, res) => {
    const row = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [req.auth!.userId])) as any;
    res.json({ token: issueToken(env, { id: String(row.id), isAdmin: !!row.is_admin }) });
  });

  // ── Google OAuth helpers ────────────────────────────────────────────────────
  function googleCallbackUrl(req: any): string {
    return env.GOOGLE_CALLBACK_URL ||
      `${String(req.protocol)}://${String(req.get('host'))}/api/auth/google/callback`;
  }

  function googleDefaultLookingFor(gender: string): string[] {
    if (gender === 'Mulher') return ['Casal (Ele/Ela)', 'Homem'];
    if (gender === 'Homem')  return ['Casal (Ele/Ela)', 'Mulher'];
    if (gender.startsWith('Casal'))
      return ['Mulher', 'Homem', 'Casal (Ele/Ela)', 'Casal (Ele/Ele)', 'Casal (Ela/Ela)', 'Transexual', 'Crossdresser (CD)', 'Travesti'];
    return ['Mulher', 'Homem', 'Casal (Ele/Ela)'];
  }

  async function uniqueGoogleName(baseName: string): Promise<string> {
    const base = String(baseName).trim().slice(0, 30);
    let existing = await queryOne(db, 'SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [base]);
    if (!existing) return base;
    for (let i = 2; i <= 99; i++) {
      const candidate = `${base}${i}`;
      existing = await queryOne(db, 'SELECT id FROM users WHERE LOWER(name) = LOWER(?)', [candidate]);
      if (!existing) return candidate;
    }
    return `${base}_${Date.now()}`.slice(0, 30);
  }

  // GET /api/auth/google — redirect to Google consent screen
  app.get('/api/auth/google', (req, res) => {
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      res.status(503).json({ error: 'google_oauth_not_configured' });
      return;
    }
    // Encode optional registration hints in a short-lived signed state JWT
    const statePayload: Record<string, string> = { nonce: randomUUID() };
    if (typeof req.query.gender === 'string' && req.query.gender) statePayload.gender = req.query.gender;
    if (typeof req.query.name   === 'string' && req.query.name)   statePayload.name   = req.query.name;
    if (typeof req.query.city   === 'string' && req.query.city)   statePayload.city   = req.query.city;
    if (typeof req.query.state  === 'string' && req.query.state)  statePayload.state  = req.query.state;
    const state = jwt.sign(statePayload, env.JWT_SECRET, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleCallbackUrl(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  // GET /api/auth/google/callback — exchange code, find/create user, issue JWT
  app.get('/api/auth/google/callback', async (req, res) => {
    const frontendOrigin = String(env.FRONTEND_ORIGIN || '').replace(/\/$/, '');
    const clientId     = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.redirect(`${frontendOrigin}/login?error=oauth_not_configured`);
      return;
    }

    const code     = typeof req.query.code  === 'string' ? req.query.code  : null;
    const stateStr = typeof req.query.state === 'string' ? req.query.state : null;

    if (!code) {
      res.redirect(`${frontendOrigin}/login?error=oauth_cancelled`);
      return;
    }

    // Verify CSRF state
    let stateClaims: Record<string, string> = {};
    if (stateStr) {
      try {
        stateClaims = jwt.verify(stateStr, env.JWT_SECRET) as Record<string, string>;
      } catch {
        res.redirect(`${frontendOrigin}/login?error=invalid_state`);
        return;
      }
    }

    try {
      // Exchange code for Google access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: googleCallbackUrl(req),
          grant_type: 'authorization_code',
        }).toString(),
      });
      const tokenData = (await tokenRes.json()) as any;
      if (!tokenData.access_token) {
        res.redirect(`${frontendOrigin}/login?error=token_exchange_failed`);
        return;
      }

      // Fetch Google user info
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${String(tokenData.access_token)}` },
      });
      const googleUser = (await infoRes.json()) as any;
      const googleId    = String(googleUser.sub || '');
      const googleEmail = googleUser.email ? String(googleUser.email).toLowerCase() : null;
      const googleName  = googleUser.name ? String(googleUser.name) : googleEmail?.split('@')[0] ?? 'Usuário';

      if (!googleId) {
        res.redirect(`${frontendOrigin}/login?error=google_user_missing`);
        return;
      }

      // ── Find existing user ───────────────────────────────────────────────
      let userRow = (await queryOne(
        db, 'SELECT * FROM users WHERE google_id = ? LIMIT 1', [googleId]
      )) as any;

      if (!userRow && googleEmail) {
        // Try linking by email (existing email+password user)
        userRow = (await queryOne(
          db, 'SELECT * FROM users WHERE email = ? LIMIT 1', [googleEmail]
        )) as any;
        if (userRow) {
          await run(db, 'UPDATE users SET google_id = ? WHERE id = ?', [googleId, String(userRow.id)]);
          await persist();
        }
      }

      // ── Check banned/deactivated before issuing token ────────────────────
      if (userRow) {
        if (userRow.is_banned) {
          res.redirect(`${frontendOrigin}/login?error=account_banned`);
          return;
        }
        if (userRow.deactivated_by_admin) {
          res.redirect(`${frontendOrigin}/login?error=account_deactivated`);
          return;
        }
        // Auto-reactivate self-deactivated account
        if (userRow.is_deactivated && !userRow.deactivated_by_admin) {
          await run(db, 'UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivated_by = NULL WHERE id = ?', [String(userRow.id)]);
          await persist();
        }
      }

      // ── Create new user if not found ─────────────────────────────────────
      let isNewUser = false;
      if (!userRow) {
        isNewUser = true;
        const createdAt         = nowIso();
        const id                = randomUUID();
        const registrationIpHash = hashRequestIp(env, getRequestIp(req));

        // Use hints from state (chosen by user in Register step 1) or fall back to Google data
        const gender = stateClaims.gender || null;
        // Homens não recebem trial — precisam assinar para ter acesso
        const oauthGender = String(gender || '').trim().toLowerCase();
        const isMaleOauth = oauthGender === 'homem' || oauthGender.startsWith('homem ');
        const trialEndsAt = isMaleOauth ? createdAt : addDaysIso(createdAt, env.TRIAL_DAYS);
        const name   = stateClaims.name
          ? await uniqueGoogleName(stateClaims.name)
          : await uniqueGoogleName(googleName);
        const city   = sanitizeCityValue(stateClaims.city);
        const state  = stateClaims.state || null;
        const email  = googleEmail || `google_${googleId}@nosigilo.internal`;

        await run(
          db,
          `INSERT INTO users (
             id, email, password_hash, name, avatar, bio, status, city, state, birth_date, gender,
             marital_status, sexual_orientation, ethnicity, hair, eyes, height, body_type, smokes,
             drinks, profession, zodiac_sign, looking_for_json, is_verified, is_premium, is_admin,
             created_at, trial_started_at, trial_ends_at, invited_by_user_id, invite_status,
             registration_ip_hash, google_id
           ) VALUES (?, ?, NULL, ?, ?, NULL, NULL, ?, ?, NULL, ?, NULL, NULL, NULL, NULL, NULL,
                     NULL, NULL, NULL, NULL, NULL, NULL, ?, 0, 0, ?, ?, ?, ?, NULL, 'approved', ?, ?)`,
          [
            id, email, name, '',
            city, state, gender,
            gender ? JSON.stringify(googleDefaultLookingFor(gender)) : null,
            isAdministrativeEmail(email) ? 1 : 0,
            createdAt, createdAt, trialEndsAt,
            registrationIpHash, googleId,
          ]
        );
        await persist();
        userRow = (await queryOne(db, 'SELECT * FROM users WHERE id = ? LIMIT 1', [id])) as any;
      }

      // ── Issue JWT and redirect to frontend ───────────────────────────────
      const presence            = req.app.get('presence');
      const subscriptionsEnabled = await getSubscriptionsEnabled(db);
      const userWithSponsor     = await getUserWithSponsorById(db, String(userRow.id));
      const user                = rowToPublicUser(userWithSponsor, presence?.isOnline(String(userRow.id)), {
        showEmail: true,
        subscriptionsEnabled,
      });
      const token = issueToken(env, { id: user.id, isAdmin: user.isAdmin });
      const suffix = isNewUser ? '&new=1' : '';
      res.redirect(`${frontendOrigin}/auth/callback?token=${encodeURIComponent(token)}${suffix}`);
    } catch (err) {
      console.error('[Google OAuth] callback error:', err);
      res.redirect(`${frontendOrigin}/login?error=oauth_error`);
    }
  });

  app.get('/api/app/settings', async (_req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    res.json({ subscriptionsEnabled });
  });

  app.get('/api/app/stats', async (req, res) => {
    try {
      const totalRow = await queryOne(db, `SELECT COUNT(*) as c FROM users WHERE is_banned = 0 AND deactivated_by_admin = 0`, []);
      const presenceSvc = req.app.get('presence');
      const onlineNow = presenceSvc?.countOnline ? Number(presenceSvc.countOnline()) : 0;
      res.json({
        totalUsers: Number((totalRow as any)?.c || 0),
        onlineNow,
      });
    } catch {
      res.json({ totalUsers: 0, onlineNow: 0 });
    }
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
    const viewerRow = await queryOne(
      db,
      'SELECT email, is_premium, trial_ends_at, hub_license_end_at, gender, looking_for_json, is_admin, lat, lon, city, state, last_seen_at FROM users WHERE id = ?',
      [req.auth!.userId]
    );
    const viewerHasPremium = hasPremiumAccess(viewerRow, subscriptionsEnabled, env.BILLING_TEST_EMAILS);
    const viewerIsAdmin = Number((viewerRow as any)?.is_admin || 0) === 1;
    const viewerLookingForRaw = safeJsonParse((viewerRow as any)?.looking_for_json);
    const viewerLookingFor = Array.isArray(viewerLookingForRaw) ? (viewerLookingForRaw as string[]) : [];
    const viewerLat = (viewerRow as any)?.lat != null ? Number((viewerRow as any).lat) : null;
    const viewerLon = (viewerRow as any)?.lon != null ? Number((viewerRow as any).lon) : null;
    const viewerCity = normalizeRadarText((viewerRow as any)?.city || '');
    const viewerState = normalizeRadarText((viewerRow as any)?.state || '');
    const page = Number(req.query.page || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (Math.max(1, page) - 1) * limit;
    const includeReelsOnly = req.query.includeReelsOnly === 'true';
    // seenIds: comma-separated post IDs already shown to the client — exclude from current page
    // Cap at 60 IDs to avoid URL/query bloat; client already limits to 40
    const seenIdsRaw = typeof req.query.seenIds === 'string' ? req.query.seenIds.trim() : '';
    const seenIdsSet = new Set<string>(
      seenIdsRaw
        ? seenIdsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 60)
        : []
    );
    // When includeReelsOnly=true (Reels/Rap page): include ALL posts regardless of is_reels_only.
    // Posts with is_reels_only=0 that contain video media should also appear in the video feed
    // (UI shows "Aparecerá no feed e em Rap" for such posts). Client-side mapPostsToReels()
    // already filters for video-only items, so non-video posts are silently discarded.
    // Regular feed (includeReelsOnly=false) still excludes reels-only posts to keep the feed clean.
    const reelsOnlyFilter = includeReelsOnly
      ? '' // no is_reels_only restriction — video filtering is done client-side
      : 'AND (p.is_reels_only = 0 OR p.is_reels_only IS NULL)';
    // For reels feed, fetch a larger batch so the client's video-only filter has more to work with.
    // Cap at 200 (was 400) — with proper indexes this is plenty and keeps the response fast.
    const fetchLimit = includeReelsOnly
      ? Math.min(200, offset + limit + 120)
      : 120; // janela estável p/ paginação por offset consistente entre páginas

    // Build gender preference filter using exact matches + LIKE for casal variants
    let genderFilter = '';
    const genderParams: string[] = [];
    if (viewerLookingFor.length > 0 && !viewerIsAdmin) {
      const subConds: string[] = [];
      let wantsCasal = false;
      const exactSet = new Set<string>();

      for (const pref of viewerLookingFor) {
        const l = pref.toLowerCase().trim();
        if (l.startsWith('hom') || l === 'man' || l === 'male') {
          // Any variation of "Homem"
          ['Homem', 'homem', 'man', 'male'].forEach((v) => exactSet.add(v));
        } else if (l.startsWith('mul') || l === 'woman' || l === 'female') {
          // Any variation of "Mulher"
          ['Mulher', 'mulher', 'woman', 'female'].forEach((v) => exactSet.add(v));
        } else if (l.startsWith('cas') || l === 'couple') {
          // All casal types: "Casal (Ele/Ela)", "Casal (Ele/Ele)", "Casal (Ela/Ela)", etc.
          wantsCasal = true;
        } else {
          // Specific values stored as-is: Transexual, Crossdresser (CD), Travesti
          exactSet.add(pref);
          // Also lowercase variant
          exactSet.add(l);
        }
      }

      const deduped = [...exactSet];
      if (deduped.length > 0) {
        const placeholders = deduped.map(() => '?').join(', ');
        subConds.push(`u.gender IN (${placeholders})`);
        genderParams.push(...deduped);
      }
      if (wantsCasal) {
        // LIKE covers all: "Casal (Ele/Ela)", "Casal (Ele/Ele)", "Casal (Ela/Ela)", "casal", etc.
        subConds.push(`u.gender LIKE ?`);
        genderParams.push('Casal%');
        subConds.push(`u.gender LIKE ?`);
        genderParams.push('casal%');
      }

      if (subConds.length > 0) {
        // Always include profiles that haven't set a gender (don't exclude them)
        genderFilter = `AND (u.gender IS NULL OR u.gender = '' OR ${subConds.join(' OR ')})`;
      }
    }

    // Filtro "Amigos": só posts de amigos (friend_requests aceitos) ou perfis curtidos.
    // Ignora a preferência de gênero — amigos/curtidos são escolhas explícitas do usuário.
    let friendsAuthorFilter = '';
    const friendsAuthorParams: string[] = [];
    if (String(req.query.filter || '') === 'friends') {
      const meId = req.auth!.userId;
      const [friendRows, likedRows] = await Promise.all([
        queryAll(db, `SELECT CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END AS uid FROM friend_requests WHERE (from_user_id = ? OR to_user_id = ?) AND status = 'accepted'`, [meId, meId, meId]) as Promise<any[]>,
        queryAll(db, `SELECT target_id AS uid FROM likes WHERE user_id = ? AND target_type = 'user'`, [meId]) as Promise<any[]>,
      ]);
      const ids = new Set<string>();
      for (const r of friendRows) if (r.uid) ids.add(String(r.uid));
      for (const r of likedRows) if (r.uid) ids.add(String(r.uid));
      if (ids.size === 0) {
        res.json({ posts: [], hasMore: false, insights: null });
        return;
      }
      const list = Array.from(ids);
      friendsAuthorFilter = `AND p.user_id IN (${list.map(() => '?').join(', ')})`;
      friendsAuthorParams.push(...list);
      genderFilter = '';
      genderParams.length = 0;
    }

    const rows = await queryAll(
      db,
      `SELECT p.id, p.content, p.created_at, p.media_ids_json, p.is_reels_only,
        u.id as author_id,
        CASE WHEN u.is_admin = 1 THEN 'NoSigilo' ELSE u.name END as author_name,
        CASE WHEN u.is_admin = 1 THEN NULL ELSE u.avatar END as author_avatar,
        u.gender as author_gender, u.city as author_city, u.state as author_state,
        u.lat as author_lat, u.lon as author_lon,
        u.birth_date as author_birth_date, u.partner_birth_date as author_partner_birth_date
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
         ${genderFilter}
         ${friendsAuthorFilter}
         ${reelsOnlyFilter}
       ORDER BY p.created_at DESC
       ${includeReelsOnly ? 'LIMIT ? OFFSET ?' : 'LIMIT ? OFFSET 0'}`,
      includeReelsOnly
        ? [req.auth!.userId, req.auth!.userId, ...genderParams, ...friendsAuthorParams, limit, offset]
        : [req.auth!.userId, req.auth!.userId, ...genderParams, ...friendsAuthorParams, fetchLimit]
    );

    const feedContextByPostId = new Map<string, { reason: 'nearby' | 'affinity' | 'popular_local' | 'recent'; label: string }>();
    const distanceKmByPostId = new Map<string, number | null>();
    const sameCityByPostId = new Map<string, boolean>();
    const maxDistanceKm = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;
    const cityOnly = req.query.cityOnly === 'true' || req.query.cityOnly === '1';
    let feedInsights = {
      nearbyActiveCount: 0,
      nearbyRadiusKm: null as number | null,
      interactionActiveCount: 0,
      localPopularCount: 0,
    };

    const orderedRows = includeReelsOnly
      ? [...rows].sort((a: any, b: any) => {
          const aInterested = matchesLookingFor(viewerLookingFor, a.author_gender) ? 0 : 1;
          const bInterested = matchesLookingFor(viewerLookingFor, b.author_gender) ? 0 : 1;
          if (aInterested !== bInterested) return aInterested - bInterested;
          return new Date(String(b.created_at || '')).getTime() - new Date(String(a.created_at || '')).getTime();
        })
      : await (async () => {
          const candidateRows = [...rows] as any[];
          const candidatePostIds = candidateRows.map((row) => String(row.id));
          const candidateAuthorIds = Array.from(new Set(candidateRows.map((row) => String(row.author_id)).filter(Boolean)));
          if (candidateRows.length === 0 || candidatePostIds.length === 0 || candidateAuthorIds.length === 0) {
            return candidateRows;
          }

          const authorPlaceholders = candidateAuthorIds.map(() => '?').join(', ');
          const postPlaceholders = candidatePostIds.map(() => '?').join(', ');
          const dayStartIso = startOfCurrentDayIso();
          const dayStartMs = Date.parse(dayStartIso);
          const nowMs = Date.now();

          const [
            likeCountRows,
            commentCountRows,
            userLikeRows,
            conversationRows,
            friendRows,
            visitRows,
            likedAuthorPostRows,
            commentedAuthorPostRows,
            todayPostRows,
            todayLikeRows,
            todayCommentRows,
          ] = await Promise.all([
            queryAll(
              db,
              `SELECT target_id, COUNT(*) as c FROM likes WHERE target_type = 'post' AND target_id IN (${postPlaceholders}) GROUP BY target_id`,
              candidatePostIds
            ),
            queryAll(
              db,
              `SELECT target_id, COUNT(*) as c FROM comments WHERE target_type = 'post' AND target_id IN (${postPlaceholders}) GROUP BY target_id`,
              candidatePostIds
            ),
            queryAll(
              db,
              `SELECT target_id FROM likes WHERE target_type = 'user' AND user_id = ? AND target_id IN (${authorPlaceholders})`,
              [req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `
              SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END as other_user_id
              FROM conversations
              WHERE (user_a_id = ? AND user_b_id IN (${authorPlaceholders}))
                 OR (user_b_id = ? AND user_a_id IN (${authorPlaceholders}))
            `,
              [req.auth!.userId, req.auth!.userId, ...candidateAuthorIds, req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `
              SELECT CASE WHEN from_user_id = ? THEN to_user_id ELSE from_user_id END as other_user_id
              FROM friend_requests
              WHERE status = 'accepted'
                AND ((from_user_id = ? AND to_user_id IN (${authorPlaceholders}))
                  OR (to_user_id = ? AND from_user_id IN (${authorPlaceholders})))
            `,
              [req.auth!.userId, req.auth!.userId, ...candidateAuthorIds, req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `SELECT DISTINCT visited_user_id FROM profile_visits WHERE visitor_user_id = ? AND visited_user_id IN (${authorPlaceholders})`,
              [req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `
              SELECT p.user_id as author_id, COUNT(*) as c
              FROM likes l
              JOIN posts p ON p.id = l.target_id
              WHERE l.target_type = 'post'
                AND l.user_id = ?
                AND p.user_id IN (${authorPlaceholders})
              GROUP BY p.user_id
            `,
              [req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `
              SELECT p.user_id as author_id, COUNT(*) as c
              FROM comments c
              JOIN posts p ON p.id = c.target_id
              WHERE c.target_type = 'post'
                AND c.user_id = ?
                AND p.user_id IN (${authorPlaceholders})
              GROUP BY p.user_id
            `,
              [req.auth!.userId, ...candidateAuthorIds]
            ),
            queryAll(
              db,
              `
              SELECT user_id, COUNT(*) as c
              FROM posts
              WHERE user_id IN (${authorPlaceholders})
                AND created_at >= ?
                AND (is_reels_only = 0 OR is_reels_only IS NULL)
              GROUP BY user_id
            `,
              [...candidateAuthorIds, dayStartIso]
            ),
            queryAll(
              db,
              `
              SELECT p.user_id as author_id, COUNT(*) as c
              FROM likes l
              JOIN posts p ON p.id = l.target_id
              WHERE l.target_type = 'post'
                AND p.user_id IN (${authorPlaceholders})
                AND p.created_at >= ?
              GROUP BY p.user_id
            `,
              [...candidateAuthorIds, dayStartIso]
            ),
            queryAll(
              db,
              `
              SELECT p.user_id as author_id, COUNT(*) as c
              FROM comments c
              JOIN posts p ON p.id = c.target_id
              WHERE c.target_type = 'post'
                AND p.user_id IN (${authorPlaceholders})
                AND p.created_at >= ?
              GROUP BY p.user_id
            `,
              [...candidateAuthorIds, dayStartIso]
            ),
          ]);

          const likesCountByPostId = new Map<string, number>();
          const commentsCountByPostId = new Map<string, number>();
          const userLikedAuthorIds = new Set<string>();
          const conversationAuthorIds = new Set<string>();
          const friendAuthorIds = new Set<string>();
          const visitedAuthorIds = new Set<string>();
          const likedAuthorPostCount = new Map<string, number>();
          const commentedAuthorPostCount = new Map<string, number>();
          const todayPostsByAuthorId = new Map<string, number>();
          const todayLikesByAuthorId = new Map<string, number>();
          const todayCommentsByAuthorId = new Map<string, number>();

          for (const row of likeCountRows as any[]) likesCountByPostId.set(String(row.target_id), Number(row.c || 0));
          for (const row of commentCountRows as any[]) commentsCountByPostId.set(String(row.target_id), Number(row.c || 0));
          for (const row of userLikeRows as any[]) userLikedAuthorIds.add(String(row.target_id));
          for (const row of conversationRows as any[]) conversationAuthorIds.add(String(row.other_user_id));
          for (const row of friendRows as any[]) friendAuthorIds.add(String(row.other_user_id));
          for (const row of visitRows as any[]) visitedAuthorIds.add(String(row.visited_user_id));
          for (const row of likedAuthorPostRows as any[]) likedAuthorPostCount.set(String(row.author_id), Number(row.c || 0));
          for (const row of commentedAuthorPostRows as any[]) commentedAuthorPostCount.set(String(row.author_id), Number(row.c || 0));
          for (const row of todayPostRows as any[]) todayPostsByAuthorId.set(String(row.user_id), Number(row.c || 0));
          for (const row of todayLikeRows as any[]) todayLikesByAuthorId.set(String(row.author_id), Number(row.c || 0));
          for (const row of todayCommentRows as any[]) todayCommentsByAuthorId.set(String(row.author_id), Number(row.c || 0));

          // "New since last visit" threshold — posts created after last_seen_at get priority boost
          const _rawLastSeen = (viewerRow as any)?.last_seen_at
            ? new Date(String((viewerRow as any).last_seen_at)).getTime()
            : NaN;
          const lastSeenAtMs = Number.isFinite(_rawLastSeen)
            ? _rawLastSeen
            : nowMs - 24 * 3_600_000; // fallback: treat last 24h as "new"

          const nearbyActiveAuthors = new Set<string>();
          const interactionActiveAuthors = new Set<string>();
          const localPopularAuthors = new Set<string>();
          const ranked = candidateRows.map((row) => {
            const authorId = String(row.author_id);
            const postId = String(row.id);
            const createdAtMs = new Date(String(row.created_at || '')).getTime();
            const recencyHours = Number.isFinite(createdAtMs) ? Math.max(0, (nowMs - createdAtMs) / 3_600_000) : 999;
            const postLikes = likesCountByPostId.get(postId) ?? 0;
            const postComments = commentsCountByPostId.get(postId) ?? 0;
            const todayPosts = todayPostsByAuthorId.get(authorId) ?? 0;
            const recentAuthorEngagement = (todayLikesByAuthorId.get(authorId) ?? 0) + (todayCommentsByAuthorId.get(authorId) ?? 0);
            const authorLat = row.author_lat != null ? Number(row.author_lat) : null;
            const authorLon = row.author_lon != null ? Number(row.author_lon) : null;
            const distanceKm =
              viewerLat !== null && viewerLon !== null && authorLat !== null && authorLon !== null
                ? roundDistanceKm(haversineKm({ lat: viewerLat, lon: viewerLon }, { lat: authorLat, lon: authorLon }))
                : null;
            // Store distance for response payload and proximity filtering
            distanceKmByPostId.set(postId, distanceKm);
            const sameCity = !!viewerCity && viewerCity === normalizeRadarText(row.author_city || '');
            sameCityByPostId.set(postId, sameCity);
            const sameState = !!viewerState && viewerState === normalizeRadarText(row.author_state || '');
            const matchesInterest = matchesLookingFor(viewerLookingFor, row.author_gender);
            const parsedMediaIds = safeJsonParse(row.media_ids_json);
            const hasMedia = Array.isArray(parsedMediaIds)
              ? (parsedMediaIds as unknown[]).some((item) => typeof item === 'string' && item.trim().length > 0)
              : false;

            let distanceScore = 0;
            if (distanceKm !== null) {
              if (distanceKm <= 5) distanceScore = 50;
              else if (distanceKm <= 15) distanceScore = 40;
              else if (distanceKm <= 40) distanceScore = 28;
              else if (distanceKm <= 100) distanceScore = 16;
              else distanceScore = Math.max(2, 12 - Math.floor(distanceKm / 80));
            } else if (sameCity) {
              distanceScore = 24;
            } else if (sameState) {
              distanceScore = 10;
            }

            // Affinity: strong boost for profiles user already engaged with
            const affinityScore =
              (conversationAuthorIds.has(authorId) ? 40 : 0) +
              (userLikedAuthorIds.has(authorId) ? 35 : 0) +
              (friendAuthorIds.has(authorId) ? 22 : 0) +
              (visitedAuthorIds.has(authorId) ? 12 : 0) +
              Math.min((likedAuthorPostCount.get(authorId) ?? 0) * 8, 24) +
              Math.min((commentedAuthorPostCount.get(authorId) ?? 0) * 10, 20);

            const localPopularityScore =
              (sameCity ? 14 : sameState ? 6 : 0) +
              Math.min(todayPosts * 8, 24) +
              Math.min(recentAuthorEngagement * 3, 18);

            // Engagement: comments are more valuable than likes (signal of real interest)
            const postEngagementScore = Math.min(postLikes * 1.5, 18) + Math.min(postComments * 3, 20);

            // Media is essential for engagement — strong boost, penalize text-only
            const mediaScore = hasMedia ? 22 : -8;

            // Recency: 6h window peak, then slower decay — quality older posts can still surface
            const recencyScore = recencyHours <= 6
              ? Math.max(0, 55 - recencyHours * 2)
              : recencyHours <= 24
                ? Math.max(0, 43 - (recencyHours - 6) * 1.1)
                : Math.max(0, 24 - (recencyHours - 24) * 0.25); // very slow decay after 24h so engaged older posts surface

            // Interest: already filtered at SQL level if preferences set, this is bonus
            const interestScore = matchesInterest ? 20 : (viewerLookingFor.length > 0 ? -30 : 0);

            // "New since last visit" bonus — ensures users always see unread content first
            const isNewSinceLastVisit = Number.isFinite(createdAtMs) && createdAtMs > lastSeenAtMs;
            const newContentBonus = isNewSinceLastVisit ? 55 : 0;

            // Variable reward jitter: larger range on older posts to keep feed unpredictable
            // Recent posts (< 6h): ±12 — mostly stable
            // Older posts (> 6h): ±30 — wide shuffle creates genuine variety per visit
            const jitterRange = recencyHours <= 6 ? 12 : 30;
            const jitter = (Math.random() * jitterRange * 2) - jitterRange;

            const totalScore = recencyScore + distanceScore + affinityScore + localPopularityScore + postEngagementScore + mediaScore + interestScore + newContentBonus + jitter;

            let reason: 'nearby' | 'affinity' | 'popular_local' | 'recent' = 'recent';
            let label = isNewSinceLastVisit ? '🆕 Novo para você' : 'Recente';
            if (distanceScore >= 18 || (distanceKm !== null && distanceKm <= 20)) {
              reason = 'nearby';
              label = distanceKm !== null && distanceKm <= 20 ? `${distanceKm} km de você` : 'Perto de você';
            } else if (affinityScore >= 18) {
              reason = 'affinity';
              label = 'Você já interagiu';
            } else if (localPopularityScore >= 18) {
              reason = 'popular_local';
              label = sameCity ? 'Em alta na sua cidade' : 'Em alta na sua região';
            }

            if (createdAtMs >= dayStartMs) {
              if ((distanceKm !== null && distanceKm <= 20) || sameCity) nearbyActiveAuthors.add(authorId);
              if (affinityScore >= 18) interactionActiveAuthors.add(authorId);
              if (localPopularityScore >= 18) localPopularAuthors.add(authorId);
            }

            return {
              row,
              authorId,
              score: totalScore + (hasMedia ? 4 : 0),
              createdAtMs,
              reason,
              label,
              matchesInterest,
            };
          });

          // Ordem cronológica: mais recentes primeiro. Mantém o feed previsível e
          // evita o usuário rever a mesma postagem (a dedup por seenIds cuida do resto).
          ranked.sort((a, b) => b.createdAtMs - a.createdAtMs);

          // Só perfis do interesse do viewer (quando ele definiu preferência)
          const interestFiltered = viewerLookingFor.length > 0
            ? ranked.filter((item) => item.matchesInterest)
            : ranked;

          // Teto por autor: no máximo 2 posts por autor por página (anti-flood)
          const MAX_POSTS_PER_AUTHOR = 2;
          const authorPageCount = new Map<string, number>();
          const cappedRanked = interestFiltered.filter((item) => {
            const count = authorPageCount.get(item.authorId) ?? 0;
            if (count >= MAX_POSTS_PER_AUTHOR) return false;
            authorPageCount.set(item.authorId, count + 1);
            return true;
          });

          for (const item of cappedRanked) {
            feedContextByPostId.set(String(item.row.id), { reason: item.reason, label: item.label });
          }

          feedInsights = {
            nearbyActiveCount: nearbyActiveAuthors.size,
            nearbyRadiusKm: nearbyActiveAuthors.size > 0 ? 20 : null,
            interactionActiveCount: interactionActiveAuthors.size,
            localPopularCount: localPopularAuthors.size,
          };

          return cappedRanked.map((item) => item.row);
        })();

    // Proximity filter: cityOnly = same city; maxDistanceKm = radius in km
    const proximityRows = cityOnly && viewerCity
      ? orderedRows.filter((r: any) => sameCityByPostId.get(String(r.id)) === true)
      : maxDistanceKm !== null && viewerLat !== null && viewerLon !== null
        ? orderedRows.filter((r: any) => {
            const d = distanceKmByPostId.get(String(r.id));
            return d !== null && d !== undefined && d <= maxDistanceKm;
          })
        : orderedRows;

    // Tema do dia: prioriza posts on-theme (ex.: quinta = TBT) no topo, em ordem
    // cronológica. Não-vistos primeiro; ao esgotar, reexibe os vistos uma vez
    // (chegar ao "fim do feed") para manter engajamento sem repetir em loop.
    const THEME_KEYWORDS: string[][] = [
      ['domingo'],                                                 // 0 Dom
      ['segundou', 'segunda'],                                     // 1 Seg
      ['terça', 'terca', 'tentação', 'tentacao'],                  // 2 Ter
      ['quarta'],                                                  // 3 Qua
      ['tbt', 'throwback'],                                        // 4 Qui
      ['sextou', 'sexta'],                                         // 5 Sex
      ['encontro', 'encontros', 'sabadou', 'sábado', 'sabado'],    // 6 Sáb
    ];
    const todayKeywords = THEME_KEYWORDS[new Date().getDay()] ?? [];
    const matchesTheme = (content: any) => {
      if (todayKeywords.length === 0) return false;
      const c = String(content || '').toLowerCase();
      return todayKeywords.some((k) => c.includes(k));
    };
    // Coloca os posts do tema do dia na frente, preservando a ordem cronológica
    const themeFirst = (arr: any[]) => {
      const onTheme: any[] = [];
      const rest: any[] = [];
      for (const r of arr) (matchesTheme(r.content) ? onTheme : rest).push(r);
      return [...onTheme, ...rest];
    };

    // Reels: o SQL já paginou por offset (LIMIT/OFFSET), então a página atual já
    // é a fatia certa — sem tema do dia e sem re-aplicar offset. Isso faz o player
    // percorrer TODOS os posts até achar todos os vídeos (vídeos são esparsos no
    // meio dos posts), em vez de parar na janela limitada.
    //
    // Feed normal: paginação por OFFSET sobre a lista tema-primeiro (determinística,
    // sem repetir posts no mesmo scroll; termina com hasMore=false).
    let slice: any[];
    let feedHasMore: boolean;
    if (includeReelsOnly) {
      slice = proximityRows as any[];
      feedHasMore = (proximityRows as any[]).length >= limit;
    } else {
      const orderedByTheme = themeFirst(proximityRows as any[]);
      slice = orderedByTheme.slice(offset, offset + limit);
      feedHasMore = orderedByTheme.length > offset + limit;
    }
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
        const locked = !includeReelsOnly && !viewerHasPremium && !!mimeType && mimeType.startsWith('video/');
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
          birthDate: r.author_birth_date ?? null,
          partnerBirthDate: r.author_partner_birth_date ?? null,
        },
        mediaIds: mediaIdsByPostId.get(String(r.id)) ?? [],
        media: (mediaIdsByPostId.get(String(r.id)) ?? []).map((mid) => mediaById.get(mid)).filter(Boolean),
        likesCount: likesCountByPostId.get(String(r.id)) ?? 0,
        commentsCount: commentsCountByPostId.get(String(r.id)) ?? 0,
        likedByMe: likedByMeSet.has(String(r.id)),
        reactions: reactionsByPostId.get(String(r.id)) ?? [],
        feedContext: feedContextByPostId.get(String(r.id)) ?? null,
        distanceKm: distanceKmByPostId.get(String(r.id)) ?? null,
      })),
      hasMore: feedHasMore,
      insights: includeReelsOnly ? null : feedInsights,
    });
  });

  // ── Stories ───────────────────────────────────────────────────────────────

  function storyExpiresAt(createdAt: string): string {
    return new Date(new Date(createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  // GET /api/stories/me — meus stories ativos (múltiplos)
  app.get('/api/stories/me', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const now = new Date().toISOString();
    const rows = (await queryAll(
      db,
      `SELECT s.id, s.media_id, s.text, s.background, s.text_overlay, s.created_at, s.expires_at,
              m.filename, m.mime_type
       FROM stories s
       LEFT JOIN media m ON m.id = s.media_id
       WHERE s.user_id = ? AND s.expires_at > ?
       ORDER BY s.created_at ASC`,
      [userId, now]
    )) as any[];
    // Compatibilidade: manter campo `story` apontando para o mais recente
    if (rows.length === 0) { res.json({ story: null, stories: [] }); return; }
    const storiesWithStats = await Promise.all(rows.map(async (s) => {
      const [viewCount, commentCount, likeCount] = await Promise.all([
        queryOne(db, 'SELECT COUNT(*) as c FROM story_views WHERE story_id = ?', [s.id]) as Promise<any>,
        queryOne(db, 'SELECT COUNT(*) as c FROM story_comments WHERE story_id = ?', [s.id]) as Promise<any>,
        queryOne(db, 'SELECT COUNT(*) as c FROM story_likes WHERE story_id = ?', [s.id]) as Promise<any>,
      ]);
      return {
        id: String(s.id),
        mediaUrl: s.filename ? `/uploads/${s.filename}` : null,
        mimeType: String(s.mime_type || ''),
        text: s.text ? String(s.text) : null,
        background: s.background ? String(s.background) : null,
        textOverlay: s.text_overlay ? (safeJsonParse(s.text_overlay) as any) : null,
        createdAt: String(s.created_at),
        expiresAt: String(s.expires_at),
        viewCount: Number(viewCount?.c || 0),
        commentCount: Number(commentCount?.c || 0),
        likeCount: Number(likeCount?.c || 0),
      };
    }));
    res.json({ story: storiesWithStats[storiesWithStats.length - 1], stories: storiesWithStats });
  });

  // GET /api/stories — feed de stories filtrado pelo interesse do viewer.
  // Unidirecional: o usuário só vê stories de quem combina com a SUA preferência
  // (looking_for). Não há restrição do lado do autor — qualquer pessoa interessada
  // no gênero do autor (ou sem preferência) pode ver os stories dele.
  app.get('/api/stories', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const now = new Date().toISOString();

    const me = (await queryOne(db, 'SELECT gender, looking_for_json, lat, lon FROM users WHERE id = ?', [userId])) as any;
    const myLookingFor: string[] = safeJsonParse(me?.looking_for_json) ?? [];
    const myLat = me?.lat != null ? Number(me.lat) : null;
    const myLon = me?.lon != null ? Number(me.lon) : null;

    // Busca stories ativos de outros usuários
    const rows = (await queryAll(
      db,
      `SELECT s.id, s.user_id, s.media_id, s.text, s.background, s.text_overlay, s.created_at, s.expires_at,
              m.filename, m.mime_type,
              u.name, u.gender, u.birth_date, u.partner_birth_date,
              u.city, u.state, u.bio,
              u.fetiches_json, u.intentions_json,
              u.lat, u.lon,
              (SELECT filename FROM media WHERE user_id = u.id AND is_main = 1 AND is_private = 0 ORDER BY created_at DESC LIMIT 1) as avatar_filename
       FROM stories s
       LEFT JOIN media m ON m.id = s.media_id
       JOIN users u ON u.id = s.user_id
       WHERE s.expires_at > ? AND s.user_id != ?
         AND (u.is_banned = 0 OR u.is_banned IS NULL)
         AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       ORDER BY s.created_at DESC`,
      [now, userId]
    )) as any[];

    // Filtra pelo interesse do viewer: só mostra stories de autores cujo gênero
    // combina com a preferência do usuário (ou tudo, se ele não tiver preferência).
    const filtered = rows.filter((r: any) => {
      if (myLookingFor.length === 0) return true;
      return matchesLookingFor(myLookingFor, r.gender);
    });

    // Marca quais já foram vistos pelo usuário
    const storyIds = filtered.map((r: any) => String(r.id));
    let viewedSet = new Set<string>();
    if (storyIds.length > 0) {
      const ph = storyIds.map(() => '?').join(',');
      const viewed = (await queryAll(
        db,
        `SELECT story_id FROM story_views WHERE viewer_id = ? AND story_id IN (${ph})`,
        [userId, ...storyIds]
      )) as any[];
      viewedSet = new Set(viewed.map((v: any) => String(v.story_id)));
    }

    const calcAge = (birthDateStr: string | null) => {
      if (!birthDateStr) return null;
      const birth = new Date(birthDateStr);
      if (isNaN(birth.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    };

    const storiesOut = await Promise.all(filtered.map(async (r: any) => {
      let distanceKm: number | null = null;
      if (myLat != null && myLon != null && r.lat != null && r.lon != null) {
        distanceKm = roundDistanceKm(haversineKm(
          { lat: myLat, lon: myLon },
          { lat: Number(r.lat), lon: Number(r.lon) }
        ));
      }
      const [likeRow, likedRow, reactionRows] = await Promise.all([
        queryOne(db, 'SELECT COUNT(*) as c FROM story_likes WHERE story_id = ?', [r.id]) as Promise<any>,
        queryOne(db, "SELECT COALESCE(reaction, 'heart') AS reaction FROM story_likes WHERE story_id = ? AND liker_id = ?", [r.id, userId]) as Promise<any>,
        queryAll(db, "SELECT COALESCE(reaction, 'heart') AS reaction, COUNT(*) AS c FROM story_likes WHERE story_id = ? GROUP BY COALESCE(reaction, 'heart')", [r.id]) as Promise<any[]>,
      ]);
      return {
        id: String(r.id),
        mediaUrl: r.filename ? `/uploads/${r.filename}` : null,
        mimeType: String(r.mime_type || ''),
        text: r.text ? String(r.text) : null,
        background: r.background ? String(r.background) : null,
        textOverlay: r.text_overlay ? (safeJsonParse(r.text_overlay) as any) : null,
        createdAt: String(r.created_at),
        expiresAt: String(r.expires_at),
        viewed: viewedSet.has(String(r.id)),
        likeCount: Number(likeRow?.c || 0),
        likedByMe: !!likedRow,
        myReaction: likedRow?.reaction ? String(likedRow.reaction) : null,
        reactions: (reactionRows as any[]).map((rr) => ({ type: String(rr.reaction), count: Number(rr.c) })),
        author: {
          id: String(r.user_id),
          name: String(r.name),
          gender: r.gender ? String(r.gender) : null,
          avatar: r.avatar_filename ? `/uploads/${r.avatar_filename}` : null,
          age: calcAge(r.birth_date),
          partnerAge: calcAge(r.partner_birth_date),
          city: r.city ? String(r.city) : null,
          state: r.state ? String(r.state) : null,
          bio: r.bio ? String(r.bio) : null,
          fetiches: (safeJsonParse(r.fetiches_json) as string[] | null) ?? [],
          intentions: (safeJsonParse(r.intentions_json) as string[] | null) ?? [],
          distanceKm,
        },
      };
    }));
    res.json({ stories: storiesOut });
  });

  // GET /api/feed/active-now — perfis ativos nas últimas 2h (postaram, usaram o
  // Radar ou estiveram online), filtrados pelo interesse do viewer e, opcionalmente,
  // por raio de distância. Usado pela fila "Ativos agora" no topo do feed.
  app.get('/api/feed/active-now', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const presence = req.app.get('presence') as undefined | { isOnline: (id: string) => boolean };
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const maxDistanceKm = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;
    const cityOnly = req.query.cityOnly === 'true' || req.query.cityOnly === '1';

    const me = (await queryOne(db, 'SELECT gender, looking_for_json, lat, lon, city FROM users WHERE id = ?', [userId])) as any;
    const myLookingFor: string[] = safeJsonParse(me?.looking_for_json) ?? [];
    const myLat = me?.lat != null ? Number(me.lat) : null;
    const myLon = me?.lon != null ? Number(me.lon) : null;
    const myCity = normalizeRadarText(me?.city || '');

    const rows = (await queryAll(
      db,
      `SELECT u.id, u.name, u.avatar, u.gender, u.city, u.state, u.lat, u.lon,
              MAX(act.last_act) AS last_act,
              MAX(act.posted)   AS posted,
              MAX(act.radar)    AS radar
       FROM (
         SELECT user_id AS uid, CAST(created_at AS text) AS last_act, 1 AS posted, 0 AS radar FROM posts WHERE created_at >= ?
         UNION ALL
         SELECT user_id AS uid, CAST(created_at AS text) AS last_act, 0 AS posted, 1 AS radar FROM radar_broadcasts WHERE created_at >= ?
         UNION ALL
         SELECT id AS uid, CAST(last_seen_at AS text) AS last_act, 0 AS posted, 0 AS radar FROM users WHERE last_seen_at >= ?
       ) act
       JOIN users u ON u.id = act.uid
       WHERE u.id != ? AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       GROUP BY u.id
       ORDER BY last_act DESC
       LIMIT 80`,
      [twoHoursAgo, twoHoursAgo, twoHoursAgo, userId]
    )) as any[];

    const out: any[] = [];
    for (const r of rows) {
      if (myLookingFor.length > 0 && !matchesLookingFor(myLookingFor, r.gender)) continue;

      // Filtro "Minha cidade": só perfis da mesma cidade do viewer
      if (cityOnly && myCity && normalizeRadarText(r.city || '') !== myCity) continue;

      let distanceKm: number | null = null;
      if (myLat != null && myLon != null && r.lat != null && r.lon != null) {
        distanceKm = roundDistanceKm(haversineKm({ lat: myLat, lon: myLon }, { lat: Number(r.lat), lon: Number(r.lon) }));
      }
      if (!cityOnly && maxDistanceKm != null) {
        if (distanceKm == null || distanceKm > maxDistanceKm) continue;
      }

      out.push({
        id: String(r.id),
        name: String(r.name),
        avatar: r.avatar ? String(r.avatar) : null,
        gender: r.gender ? String(r.gender) : null,
        city: r.city ? String(r.city) : null,
        state: r.state ? String(r.state) : null,
        distanceKm,
        isOnline: presence?.isOnline ? presence.isOnline(String(r.id)) : false,
        lastActiveAt: r.last_act ? String(r.last_act) : null,
        reason: Number(r.posted) ? 'posted' : Number(r.radar) ? 'radar' : 'online',
      });
      if (out.length >= 24) break;
    }

    // Online primeiro, depois mais recentes
    out.sort((a, b) => Number(b.isOnline) - Number(a.isOnline));
    res.json({ profiles: out });
  });

  // GET /api/feed/top-day — posts mais curtidos das últimas 24h (com mídia).
  // Vitrine global no topo do feed; renova diariamente para gerar mais dinâmica.
  app.get('/api/feed/top-day', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();

    const rows = (await queryAll(
      db,
      `SELECT p.id, p.media_ids_json, p.created_at,
              u.id as author_id,
              CASE WHEN u.is_admin = 1 THEN 'NoSigilo' ELSE u.name END as author_name,
              CASE WHEN u.is_admin = 1 THEN NULL ELSE u.avatar END as author_avatar,
              u.gender as author_gender,
              (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'post' AND l.target_id = p.id) as like_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.created_at >= ?
         AND (u.is_banned = 0 OR u.is_banned IS NULL)
         AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND p.media_ids_json IS NOT NULL AND p.media_ids_json != '[]'
         AND (p.is_reels_only = 0 OR p.is_reels_only IS NULL)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
              OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
         )
       ORDER BY like_count DESC, p.created_at DESC
       LIMIT 40`,
      [dayAgo, userId, userId]
    )) as any[];

    // Top do Dia é vitrine global: mostra para todos, independente do
    // interesse (looking_for) de quem vê. Exige pelo menos 1 curtida.
    const filtered = rows
      .filter((r) => Number(r.like_count || 0) > 0)
      .slice(0, 12);

    // Resolve a primeira mídia (thumbnail) de cada post
    const firstMediaIdByPost = new Map<string, string>();
    const mediaIdSet = new Set<string>();
    for (const r of filtered) {
      const ids = safeJsonParse(r.media_ids_json);
      const first = Array.isArray(ids) ? ids.find((x: any) => typeof x === 'string' && x.trim()) : null;
      if (first) { firstMediaIdByPost.set(String(r.id), String(first)); mediaIdSet.add(String(first)); }
    }
    const mediaById = new Map<string, { filename: string | null; mime: string | null }>();
    if (mediaIdSet.size > 0) {
      const ids = Array.from(mediaIdSet);
      const ph = ids.map(() => '?').join(', ');
      const mrows = (await queryAll(db, `SELECT id, filename, mime_type FROM media WHERE id IN (${ph})`, ids)) as any[];
      for (const m of mrows) mediaById.set(String(m.id), { filename: m.filename ?? null, mime: m.mime_type ?? null });
    }

    const posts = filtered.map((r, i) => {
      const mid = firstMediaIdByPost.get(String(r.id));
      const media = mid ? mediaById.get(mid) : null;
      return {
        id: String(r.id),
        rank: i + 1,
        likeCount: Number(r.like_count || 0),
        createdAt: String(r.created_at),
        mediaUrl: media?.filename ? `/uploads/${media.filename}` : null,
        mimeType: media?.mime ?? null,
        author: {
          id: String(r.author_id),
          name: String(r.author_name),
          avatar: r.author_avatar ? String(r.author_avatar) : null,
        },
      };
    });

    res.json({ posts });
  });

  // POST /api/stories — criar story a partir de media_id já uploaded OU de texto
  // com fundo colorido (sem mídia: media_id = '' como sentinela).
  app.post('/api/stories', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const { mediaId } = req.body as { mediaId?: string };
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const background = typeof req.body?.background === 'string' ? req.body.background.trim() : '';
    const isText = !mediaId && text.length > 0;         // story de texto puro (fundo colorido)
    const hasOverlay = !!mediaId && text.length > 0;    // texto por cima da mídia (estilo Instagram)

    if (!mediaId && !isText) { res.status(400).json({ error: 'mediaId_or_text_required' }); return; }
    if (text.length > 280) { res.status(400).json({ error: 'text_too_long', message: 'O texto deve ter no máximo 280 caracteres.' }); return; }

    // Estilo do overlay de texto sobre a mídia: posição livre (x/y em %), cor e
    // tamanho, com valores em whitelist / clamp para segurança.
    const OVERLAY_COLORS = ['#ffffff', '#000000', '#ec4899', '#facc15', '#22d3ee'];
    const OVERLAY_SIZES = ['sm', 'md', 'lg', 'xl'];
    let textOverlayJson: string | null = null;
    if (hasOverlay) {
      const raw = (req.body?.textOverlay || {}) as { x?: number; y?: number; color?: string; size?: string };
      const clampPct = (v: any, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : d; };
      const color = OVERLAY_COLORS.includes(String(raw.color)) ? String(raw.color) : '#ffffff';
      const size = OVERLAY_SIZES.includes(String(raw.size)) ? String(raw.size) : 'md';
      textOverlayJson = JSON.stringify({ x: clampPct(raw.x, 50), y: clampPct(raw.y, 50), color, size });
    }

    if (mediaId) {
      const media = (await queryOne(db, 'SELECT id, user_id, filename FROM media WHERE id = ? AND user_id = ?', [mediaId, userId])) as any;
      if (!media) { res.status(404).json({ error: 'media_not_found' }); return; }
    }

    // Limite máximo de 10 stories ativos por usuário
    const now = new Date().toISOString();
    const activeCount = (await queryOne(db, 'SELECT COUNT(*) as c FROM stories WHERE user_id = ? AND expires_at > ?', [userId, now])) as any;
    if (Number(activeCount?.c || 0) >= 10) {
      res.status(400).json({ error: 'max_stories_reached', message: 'Você já tem 10 stories ativos. Apague um antes de postar.' });
      return;
    }

    const id = randomUUID();
    const expiresAt = storyExpiresAt(now);
    // `text` acompanha tanto o story de texto puro quanto o overlay sobre a mídia.
    // `background` só no texto puro; `text_overlay` só quando há texto sobre a mídia.
    const storyText = (isText || hasOverlay) ? text : null;
    await run(
      db,
      'INSERT INTO stories (id, user_id, media_id, text, background, text_overlay, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, userId, mediaId || '', storyText, isText ? (background || 'sunset') : null, textOverlayJson, now, expiresAt],
    );
    await persist();
    // Só mulheres e casais ganham tokens por story.
    await awardContentTokensIfEligible(db, userId, 'story', id, req.app.get('io'));
    res.json({ id, expiresAt });
  });

  // DELETE /api/stories/:id — apagar próprio story
  app.delete('/api/stories/:id', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const storyId = req.params.id;
    const story = (await queryOne(db, 'SELECT id FROM stories WHERE id = ? AND user_id = ?', [storyId, userId])) as any;
    if (!story) { res.status(404).json({ error: 'not_found' }); return; }
    await run(db, 'DELETE FROM story_views WHERE story_id = ?', [storyId]);
    await run(db, 'DELETE FROM story_comments WHERE story_id = ?', [storyId]);
    await run(db, 'DELETE FROM story_likes WHERE story_id = ?', [storyId]);
    await run(db, 'DELETE FROM stories WHERE id = ?', [storyId]);
    await persist();
    res.json({ ok: true });
  });

  // POST /api/stories/:id/view — registrar visualização
  app.post('/api/stories/:id/view', requireAuth(env, db), async (req, res) => {
    const viewerId = req.auth!.userId;
    const storyId = req.params.id;
    const story = (await queryOne(db, 'SELECT id, user_id FROM stories WHERE id = ?', [storyId])) as any;
    if (!story || story.user_id === viewerId) { res.json({ ok: true }); return; }
    const existing = (await queryOne(db, 'SELECT id FROM story_views WHERE story_id = ? AND viewer_id = ?', [storyId, viewerId])) as any;
    if (!existing) {
      await run(db, 'INSERT INTO story_views (id, story_id, viewer_id, viewed_at) VALUES (?, ?, ?, ?)', [randomUUID(), storyId, viewerId, new Date().toISOString()]);
      await persist();
    }
    res.json({ ok: true });
  });

  // GET /api/stories/:id/viewers — quem viu (apenas premium, apenas dono do story)
  app.get('/api/stories/:id/viewers', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const storyId = req.params.id;
    const story = (await queryOne(db, 'SELECT id, user_id FROM stories WHERE id = ?', [storyId])) as any;
    if (!story || story.user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return; }
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const userRow = (await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ?', [userId])) as any;
    if (!hasPremiumAccess(userRow, subscriptionsEnabled, env.BILLING_TEST_EMAILS)) { res.status(403).json({ error: 'premium_required' }); return; }
    const rows = (await queryAll(
      db,
      `SELECT u.id, u.name,
              (SELECT filename FROM media WHERE user_id = u.id AND is_main = 1 AND is_private = 0 ORDER BY created_at DESC LIMIT 1) as avatar_filename,
              sv.viewed_at,
              (SELECT COALESCE(sl.reaction, 'heart') FROM story_likes sl WHERE sl.story_id = sv.story_id AND sl.liker_id = u.id LIMIT 1) as reaction,
              (SELECT sc.text FROM story_comments sc WHERE sc.story_id = sv.story_id AND sc.commenter_id = u.id ORDER BY sc.created_at DESC LIMIT 1) as comment_text
       FROM story_views sv
       JOIN users u ON u.id = sv.viewer_id
       WHERE sv.story_id = ?
       ORDER BY sv.viewed_at DESC`,
      [storyId]
    )) as any[];
    res.json({
      viewers: rows.map((r: any) => ({
        id: String(r.id),
        name: String(r.name),
        avatar: r.avatar_filename ? `/uploads/${r.avatar_filename}` : null,
        viewedAt: String(r.viewed_at),
        reaction: r.reaction ? String(r.reaction) : null,
        comment: r.comment_text ? String(r.comment_text) : null,
      })),
    });
  });

  // POST /api/stories/:id/comments — comentar em story (privado, só o autor vê)
  app.post('/api/stories/:id/comments', requireAuth(env, db), async (req, res) => {
    const commenterId = req.auth!.userId;
    const storyId = req.params.id;
    const io = req.app.get('io') as SocketIOServer | undefined;
    const { text } = req.body as { text?: string };
    if (!text?.trim()) { res.status(400).json({ error: 'text_required' }); return; }
    const story = (await queryOne(db, 'SELECT id, user_id FROM stories WHERE id = ?', [storyId])) as any;
    if (!story) { res.status(404).json({ error: 'not_found' }); return; }
    const id = randomUUID();
    const now = new Date().toISOString();
    await run(db, 'INSERT INTO story_comments (id, story_id, commenter_id, text, created_at) VALUES (?, ?, ?, ?, ?)', [id, storyId, commenterId, text.trim(), now]);
    await persist();
    await awardTokens(db, commenterId, 'comment', id, io);
    // Notifica o dono do story (falha de notificação não deve derrubar o comentário)
    if (story.user_id !== commenterId) {
      try {
        const commenter = (await queryOne(db, 'SELECT name FROM users WHERE id = ?', [commenterId])) as any;
        const commenterName = commenter?.name ? String(commenter.name) : 'Alguém';
        await createNotification({ db, io }, {
          userId: String(story.user_id),
          type: 'story.comment',
          title: 'Comentário no seu story',
          description: `${commenterName} comentou no seu story`,
          dataJson: { storyId, actorId: commenterId, actorName: commenterName },
        });
        await sendPushToUser({ db, env }, {
          userId: String(story.user_id),
          payload: { title: 'Comentário no seu story', body: `${commenterName} comentou no seu story`, url: '/stories', tag: `story.comment:${storyId}`, data: { storyId, actorId: commenterId } },
        });
      } catch (err) {
        console.error('[stories/comments] notification failed', err);
      }

      // Encaminha a resposta para o chat (estilo Instagram): cria/recupera a conversa
      // e insere uma mensagem referenciando o story. Best-effort — não derruba o comentário.
      try {
        const canMessage = await canSendMessage({ db }, { fromUserId: commenterId, toUserId: String(story.user_id) });
        if (canMessage) {
          const pair = [commenterId, String(story.user_id)].sort((a, b) => a.localeCompare(b));
          const existingConv = (await queryOne(db, 'SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ?', [pair[0], pair[1]])) as any;
          let conversationId: string;
          if (existingConv?.id) {
            conversationId = String(existingConv.id);
          } else {
            conversationId = randomUUID();
            await run(db, 'INSERT INTO conversations (id, user_a_id, user_b_id, created_at) VALUES (?, ?, ?, ?)', [conversationId, pair[0], pair[1], now]);
          }
          const msgId = randomUUID();
          await run(
            db,
            'INSERT INTO messages (id, conversation_id, sender_id, content, story_id, is_delivered, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [msgId, conversationId, commenterId, text.trim(), storyId, 1, now]
          );
          await persist();
          const storyMedia = (await queryOne(
            db,
            'SELECT m.filename, m.mime_type FROM stories s JOIN media m ON m.id = s.media_id WHERE s.id = ?',
            [storyId]
          )) as any;
          const replyStory = {
            id: storyId,
            mediaUrl: storyMedia?.filename ? `/uploads/${storyMedia.filename}` : null,
            mimeType: storyMedia?.mime_type ?? null,
          };
          io?.to(conversationId).emit('message.created', {
            id: msgId,
            conversationId,
            senderId: commenterId,
            content: text.trim(),
            mediaId: null,
            mediaUrl: null,
            mediaMimeType: null,
            replyStory,
            isViewOnce: false,
            isDelivered: true,
            createdAt: now,
          });
        }
      } catch (err) {
        console.error('[stories/comments] forward to chat failed', err);
      }
    }
    res.json({ id, ok: true });
  });

  // GET /api/stories/:id/comments — ver comentários (apenas premium, apenas dono)
  app.get('/api/stories/:id/comments', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const storyId = req.params.id;
    const story = (await queryOne(db, 'SELECT id, user_id FROM stories WHERE id = ?', [storyId])) as any;
    if (!story || story.user_id !== userId) { res.status(403).json({ error: 'forbidden' }); return; }
    const subscriptionsEnabled2 = await getSubscriptionsEnabled(db);
    const userRow2 = (await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ?', [userId])) as any;
    if (!hasPremiumAccess(userRow2, subscriptionsEnabled2, env.BILLING_TEST_EMAILS)) { res.status(403).json({ error: 'premium_required' }); return; }
    const rows = (await queryAll(
      db,
      `SELECT sc.id, sc.text, sc.created_at,
              u.id as commenter_id, u.name as commenter_name,
              (SELECT filename FROM media WHERE user_id = u.id AND is_main = 1 AND is_private = 0 ORDER BY created_at DESC LIMIT 1) as avatar_filename
       FROM story_comments sc
       JOIN users u ON u.id = sc.commenter_id
       WHERE sc.story_id = ?
       ORDER BY sc.created_at DESC`,
      [storyId]
    )) as any[];
    res.json({
      comments: rows.map((r: any) => ({
        id: String(r.id),
        text: String(r.text),
        createdAt: String(r.created_at),
        commenter: {
          id: String(r.commenter_id),
          name: String(r.commenter_name),
          avatar: r.avatar_filename ? `/uploads/${r.avatar_filename}` : null,
        },
      })),
    });
  });

  // POST /api/stories/:id/like — reagir/desreagir a um story (toggle por reação)
  app.post('/api/stories/:id/like', requireAuth(env, db), async (req, res) => {
    const likerId = req.auth!.userId;
    const storyId = req.params.id;
    const reactionSchema = z.object({
      reaction: z.enum(['heart', 'love', 'wow', 'devil', 'fire', 'splash', 'hot']).optional(),
    });
    const parsed = reactionSchema.safeParse(req.body || {});
    const reaction = parsed.success && parsed.data.reaction ? parsed.data.reaction : 'heart';
    const HOT_HEART_COST = 1; // Coração Quente consome 1 token
    const story = (await queryOne(db, 'SELECT id, user_id FROM stories WHERE id = ?', [storyId])) as any;
    if (!story) { res.status(404).json({ error: 'not_found' }); return; }
    const existing = (await queryOne(
      db,
      "SELECT id, COALESCE(reaction, 'heart') AS reaction FROM story_likes WHERE story_id = ? AND liker_id = ?",
      [storyId, likerId]
    )) as any;
    const isToggleOff = existing && String(existing.reaction) === reaction;

    // Coração Quente: cobra 1 token ao aplicar (não no toggle-off). Idempotente por
    // story — quem já pagou pode tirar/recolocar de graça depois.
    if (reaction === 'hot' && !isToggleOff && String(story.user_id) !== likerId) {
      const charge = await spendTokens(db, likerId, HOT_HEART_COST, 'hot_heart', storyId, req.app.get('io'));
      if (!charge.ok) {
        res.status(402).json({ error: 'insufficient_tokens', message: 'Você precisa de pelo menos 1 token para dar um Coração Quente.' });
        return;
      }
    }

    let myReaction: string | null = null;
    if (existing) {
      if (isToggleOff) {
        // Mesma reação → remove (toggle off)
        await run(db, 'DELETE FROM story_likes WHERE story_id = ? AND liker_id = ?', [storyId, likerId]);
      } else {
        // Reação diferente → troca
        await run(db, 'UPDATE story_likes SET reaction = ? WHERE story_id = ? AND liker_id = ?', [reaction, storyId, likerId]);
        myReaction = reaction;
      }
    } else {
      await run(db, 'INSERT OR IGNORE INTO story_likes (id, story_id, liker_id, liked_at, reaction) VALUES (?, ?, ?, ?, ?)', [randomUUID(), storyId, likerId, new Date().toISOString(), reaction]);
      myReaction = reaction;
    }
    await persist();
    if (myReaction !== null && myReaction !== 'hot') await awardTokens(db, likerId, 'like', storyId, req.app.get('io'));
    // Notifica o dono do story quando alguém reage (não no toggle-off nem no próprio story)
    if (myReaction !== null && String(story.user_id) !== likerId) {
      try {
        const io = req.app.get('io') as SocketIOServer | undefined;
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [likerId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        const isHot = myReaction === 'hot';
        const notifTitle = isHot ? '🔥 Coração Quente no seu story!' : 'Reagiram ao seu story';
        const notifBody = isHot ? `${actorName} deu um Coração Quente no seu story 🔥` : `${actorName} reagiu ao seu story.`;
        await createNotification({ db, io }, {
          userId: String(story.user_id),
          type: isHot ? 'story.hot' : 'story.liked',
          title: notifTitle,
          description: notifBody,
          dataJson: { storyId, actorId: likerId, actorName, reaction: myReaction },
        });
        await sendPushToUser({ db, env }, {
          userId: String(story.user_id),
          payload: { title: notifTitle, body: notifBody, url: '/stories', tag: `story.liked:${storyId}`, data: { storyId, actorId: likerId } },
        });
      } catch (err) {
        console.error('[stories/like] notification failed', err);
      }
    }
    const countRow = (await queryOne(db, 'SELECT COUNT(*) as c FROM story_likes WHERE story_id = ?', [storyId])) as any;
    const reactionRows = (await queryAll(
      db,
      "SELECT COALESCE(reaction, 'heart') AS reaction, COUNT(*) AS c FROM story_likes WHERE story_id = ? GROUP BY COALESCE(reaction, 'heart')",
      [storyId]
    )) as any[];
    const reactions = reactionRows.map((r) => ({ type: String(r.reaction), count: Number(r.c) }));
    res.json({ liked: myReaction !== null, likeCount: Number(countRow?.c || 0), myReaction, reactions });
  });

  // ── Video search (browse reels like profile search) ───────────────────────
  app.get('/api/videos/search', requireAuth(env, db), async (req, res) => {
    const myId = req.auth!.userId;
    const viewerRow = await queryOne(db, 'SELECT id, lat, lon, looking_for_json FROM users WHERE id = ? LIMIT 1', [myId]) as any;
    const viewerLat = typeof viewerRow?.lat === 'number' ? viewerRow.lat : null;
    const viewerLon = typeof viewerRow?.lon === 'number' ? viewerRow.lon : null;
    // Preferência do viewer ("o que eu curto"). Por padrão só mostra vídeos de perfis
    // que combinam com esse interesse; o front pode pedir all=true para ver de todos.
    const myLookingFor: string[] = safeJsonParse(viewerRow?.looking_for_json) ?? [];
    const showAllProfiles = String(req.query.all || '') === 'true';

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(40, Math.max(1, Number(req.query.limit || 24)));
    // Over-fetch de posts (muitos são só imagem e serão filtrados depois). A paginação
    // avança por POSTS escaneados — não por vídeos — senão as páginas seguintes
    // re-escaneiam quase os mesmos posts e o scroll trava nos primeiros vídeos.
    const scanLimit = (limit + 1) * 8;
    const offset = (page - 1) * scanLimit;

    const filterGender = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';
    const filterCity   = typeof req.query.city === 'string'   ? req.query.city.trim().toLowerCase()   : '';
    const filterMaxKm  = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;
    const sortParam    = ['recent', 'liked', 'commented', 'random'].includes(String(req.query.sort || '')) ? String(req.query.sort) : 'recent';

    const params: (string | number)[] = [myId, myId];
    let whereExtra = '';

    if (filterGender) {
      if (filterGender.toLowerCase().startsWith('casal') || filterGender.toLowerCase() === 'couple') {
        whereExtra += ' AND (u.gender LIKE ? OR u.gender LIKE ?)';
        params.push('Casal%', 'casal%');
      } else {
        whereExtra += ' AND u.gender = ?';
        params.push(filterGender);
      }
    }

    if (filterCity) {
      whereExtra += ' AND (LOWER(u.city) LIKE ? OR LOWER(u.state) LIKE ?)';
      params.push(`%${filterCity}%`, `%${filterCity}%`);
    }

    params.push(limit + 1, offset);

    // Use pre-aggregated JOINs instead of correlated subqueries in ORDER BY (huge perf gain)
    let orderByClause: string;
    let aggregateJoins = '';
    if (sortParam === 'liked') {
      aggregateJoins = `LEFT JOIN (SELECT target_id, COUNT(*) as agg_cnt FROM likes WHERE target_type = 'post' GROUP BY target_id) agg ON agg.target_id = p.id`;
      orderByClause = 'COALESCE(agg.agg_cnt, 0) DESC, p.created_at DESC';
    } else if (sortParam === 'commented') {
      aggregateJoins = `LEFT JOIN (SELECT target_id, COUNT(*) as agg_cnt FROM comments WHERE target_type = 'post' GROUP BY target_id) agg ON agg.target_id = p.id`;
      orderByClause = 'COALESCE(agg.agg_cnt, 0) DESC, p.created_at DESC';
    } else if (sortParam === 'random') {
      // Ordem aleatória: mistura vídeos novos, antigos, curtidos e não curtidos.
      // random() existe no SQLite e no PostgreSQL. Como a ordem muda a cada consulta,
      // a paginação por offset não se aplica — zeramos o offset e o cliente deduplica
      // pelos ids já carregados, sacando novos vídeos aleatórios a cada página.
      orderByClause = 'random()';
    } else {
      orderByClause = 'p.created_at DESC';
    }

    // params termina com (limit+1, offset); troca o limit+1 pelo scanLimit real da varredura
    const scanParams = [...params];
    scanParams[scanParams.length - 2] = scanLimit;
    // Ordem aleatória amostra do conjunto todo a cada página (offset não faz sentido).
    if (sortParam === 'random') scanParams[scanParams.length - 1] = 0;

    const rows = await queryAll(
      db,
      `SELECT p.id as post_id, p.content, p.created_at, p.media_ids_json,
              u.id as author_id,
              CASE WHEN u.is_admin = 1 THEN 'NoSigilo' ELSE u.name END as author_name,
              CASE WHEN u.is_admin = 1 THEN NULL ELSE u.avatar END as author_avatar,
              u.gender as author_gender, u.city as author_city, u.state as author_state,
              u.lat as author_lat, u.lon as author_lon
       FROM posts p
       JOIN users u ON u.id = p.user_id
       ${aggregateJoins}
       WHERE (u.is_banned = 0 OR u.is_banned IS NULL)
         AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND p.media_ids_json IS NOT NULL
         AND p.media_ids_json != '[]'
         AND p.media_ids_json != 'null'
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
              OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
         )
         ${whereExtra}
       ORDER BY ${orderByClause}
       LIMIT ? OFFSET ?`,
      scanParams
    ) as any[];

    // Process all fetched rows; hasMore is determined after video filtering below
    const slice = rows;

    // Load video media for each post
    const mediaIdSet = new Set<string>();
    const mediaIdsByPostId = new Map<string, string[]>();
    for (const r of slice) {
      const ids = Array.isArray(safeJsonParse(r.media_ids_json)) ? (safeJsonParse(r.media_ids_json) as any[]) : [];
      const list = ids.filter((x: any) => typeof x === 'string') as string[];
      mediaIdsByPostId.set(String(r.post_id), list);
      for (const mid of list) mediaIdSet.add(mid);
    }

    const mediaById = new Map<string, { id: string; url: string; mimeType: string }>();
    if (mediaIdSet.size > 0) {
      const mediaIds = Array.from(mediaIdSet);
      const placeholders = mediaIds.map(() => '?').join(', ');
      const mediaRows = await queryAll(
        db,
        `SELECT id, filename, mime_type FROM media WHERE is_private = 0 AND id IN (${placeholders})`,
        mediaIds
      ) as any[];
      for (const mr of mediaRows) {
        const mimeType = String(mr.mime_type || '');
        if (mimeType.startsWith('video/')) {
          mediaById.set(String(mr.id), { id: String(mr.id), url: `/uploads/${mr.filename}`, mimeType });
        }
      }
    }

    // Likes counts
    const postIds = slice.map((r: any) => String(r.post_id));
    const likesCountByPostId = new Map<string, number>();
    const commentsCountByPostId = new Map<string, number>();
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(', ');
      const [likeCounts, commentCounts] = await Promise.all([
        queryAll(
          db,
          `SELECT target_id, COUNT(*) as c FROM likes WHERE target_type = 'post' AND target_id IN (${placeholders}) GROUP BY target_id`,
          postIds
        ) as Promise<any[]>,
        queryAll(
          db,
          `SELECT target_id, COUNT(*) as c FROM comments WHERE target_type = 'post' AND target_id IN (${placeholders}) GROUP BY target_id`,
          postIds
        ) as Promise<any[]>,
      ]);
      for (const lr of likeCounts) likesCountByPostId.set(String(lr.target_id), Number(lr.c || 0));
      for (const cr of commentCounts) commentsCountByPostId.set(String(cr.target_id), Number(cr.c || 0));
    }

    // Build result entries (one per video media item), with distance calc + filter
    const videos: any[] = [];
    for (const r of slice) {
      // Filtro por interesse do viewer: por padrão só vídeos de perfis que ele curte.
      // Ignorado se o usuário escolheu um gênero específico (filterGender) ou pediu "ver todos" (all=true).
      if (!filterGender && !showAllProfiles && !matchesLookingFor(myLookingFor, r.author_gender)) continue;

      const videoMedia = (mediaIdsByPostId.get(String(r.post_id)) ?? [])
        .map((mid) => mediaById.get(mid))
        .filter(Boolean) as { id: string; url: string; mimeType: string }[];

      if (videoMedia.length === 0) continue;

      const aLat = typeof r.author_lat === 'number' ? r.author_lat : null;
      const aLon = typeof r.author_lon === 'number' ? r.author_lon : null;
      const distanceKm =
        viewerLat !== null && viewerLon !== null && aLat !== null && aLon !== null
          ? roundDistanceKm(haversineKm({ lat: viewerLat, lon: viewerLon }, { lat: aLat, lon: aLon }))
          : null;

      if (filterMaxKm !== null && (distanceKm === null || distanceKm > filterMaxKm)) continue;

      for (const media of videoMedia) {
        videos.push({
          mediaId: media.id,
          postId: String(r.post_id),
          videoUrl: media.url,
          content: String(r.content || ''),
          createdAt: String(r.created_at || ''),
          likesCount: likesCountByPostId.get(String(r.post_id)) ?? 0,
          commentsCount: commentsCountByPostId.get(String(r.post_id)) ?? 0,
          distanceKm,
          author: {
            id: String(r.author_id),
            name: String(r.author_name || ''),
            avatar: r.author_avatar ?? null,
            gender: r.author_gender ?? null,
            city: r.author_city ?? null,
            state: r.author_state ?? null,
          },
        });
      }
    }

    // Retorna todos os vídeos encontrados no lote escaneado. Há mais páginas se a
    // varredura de posts veio cheia (rows.length === scanLimit) — assim o offset por
    // posts avança corretamente sem repetir vídeos.
    const hasMore = rows.length >= scanLimit;
    res.json({ videos, hasMore });
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
    // Só perfis de mulheres e casais ganham tokens por postagem.
    await awardContentTokensIfEligible(db, req.auth!.userId, 'post', id, req.app.get('io'));
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
        u.id as author_id,
        CASE WHEN u.is_admin = 1 THEN 'NoSigilo' ELSE u.name END as author_name,
        CASE WHEN u.is_admin = 1 THEN NULL ELSE u.avatar END as author_avatar,
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
      title: z.string().max(120).optional().or(z.literal('')),
      description: z.string().min(20).max(50000),
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
      buildExperienceTitle(parsed.data.title, parsed.data.description),
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
      rows.map((r: any) => {
        const isPrivate = !!r.is_private;
        const filename = String(r.filename || '');

        // For private photos, verify file exists on disk before issuing a token.
        // Self-heal first: se o arquivo ficou na pasta errada (ex.: toggle
        // público/privado antigo que não movia o arquivo), realoca automaticamente.
        // Só marca "broken" se realmente não existir em lugar nenhum.
        if (isPrivate) {
          const fileExists = !!ensureMediaFileInExpectedDir(filename, true);
          if (!fileExists) {
            return {
              id: r.id,
              url: '',
              isPrivate: true,
              isMain: !!r.is_main,
              createdAt: r.created_at,
              mimeType: r.mime_type ? String(r.mime_type) : null,
              broken: true,
            };
          }
          return {
            id: r.id,
            url: `/private-uploads/${r.id}?token=${encodeURIComponent(jwt.sign({ mediaId: String(r.id) }, env.JWT_SECRET, { expiresIn: '2h' }))}`,
            isPrivate: true,
            isMain: !!r.is_main,
            createdAt: r.created_at,
            mimeType: r.mime_type ? String(r.mime_type) : null,
            broken: false,
          };
        }

        // Auto-cura o mesmo descompasso para fotos públicas (arquivo preso na pasta privada).
        ensureMediaFileInExpectedDir(filename, false);
        return {
          id: r.id,
          url: `/uploads/${filename}`,
          isPrivate: false,
          isMain: !!r.is_main,
          createdAt: r.created_at,
          mimeType: r.mime_type ? String(r.mime_type) : null,
          broken: false,
        };
      })
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

  // ── Social Pulse ─────────────────────────────────────────────────────────
  // Returns today's profile activity stats for the "curiosity gap" card on feed.
  // Non-premium users see counts but not identities (drives upgrade).
  app.get('/api/feed/social-pulse', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const viewerRow = await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ?', [userId]);
    const isPremium = hasPremiumAccess(viewerRow, subscriptionsEnabled, env.BILLING_TEST_EMAILS);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    // Profile likes received today
    const likesToday = await queryOne(
      db,
      `SELECT COUNT(DISTINCT user_id) as c FROM likes
       WHERE target_type = 'user' AND target_id = ? AND created_at >= ?`,
      [userId, todayStr]
    );

    // Profile visits received today
    const visitorsToday = await queryOne(
      db,
      `SELECT COUNT(DISTINCT visitor_user_id) as c FROM profile_visits
       WHERE visited_user_id = ? AND created_at >= ?`,
      [userId, todayStr]
    );

    // Mutual likes (matches) — total, not just today
    const mutualLikes = await queryOne(
      db,
      `SELECT COUNT(*) as c FROM likes a
       JOIN likes b ON b.user_id = a.target_id AND b.target_id = a.user_id AND b.target_type = 'user'
       WHERE a.user_id = ? AND a.target_type = 'user'`,
      [userId]
    );

    // Unread notifications count
    const unreadNotifs = await queryOne(
      db,
      `SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    // Last 3 visitors today (only returned for premium — non-premium gets null)
    let recentVisitors: Array<{ id: string; name: string; avatar: string | null }> | null = null;
    if (isPremium) {
      const rows = await queryAll(
        db,
        `SELECT u.id, u.name, u.avatar FROM profile_visits pv
         JOIN users u ON u.id = pv.visitor_user_id
         WHERE pv.visited_user_id = ? AND pv.created_at >= ?
           AND (u.is_banned = 0 OR u.is_banned IS NULL)
         ORDER BY pv.created_at DESC LIMIT 3`,
        [userId, todayStr]
      );
      recentVisitors = (rows as any[]).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        avatar: r.avatar ?? null,
      }));
    }

    // Last 3 users who liked my profile (premium sees real data, non-premium sees null)
    let recentLikers: Array<{ id: string; name: string; avatar: string | null }> | null = null;
    if (isPremium) {
      const likerRows = await queryAll(
        db,
        `SELECT u.id, u.name, u.avatar FROM likes l
         JOIN users u ON u.id = l.user_id
         WHERE l.target_type = 'user' AND l.target_id = ?
           AND (u.is_banned = 0 OR u.is_banned IS NULL)
         ORDER BY l.created_at DESC LIMIT 3`,
        [userId]
      );
      recentLikers = (likerRows as any[]).map((r) => ({
        id: String(r.id),
        name: String(r.name || ''),
        avatar: r.avatar ?? null,
      }));
    }

    res.json({
      likesToday: Number(likesToday?.c || 0),
      visitorsToday: Number(visitorsToday?.c || 0),
      mutualLikes: Number(mutualLikes?.c || 0),
      unreadNotifs: Number(unreadNotifs?.c || 0),
      recentVisitors, // null for non-premium (curiosity gap)
      recentLikers,   // null for non-premium (curiosity gap)
      isPremium,
    });
  });

  // ── Daily Streak — helper ─────────────────────────────────────────────────
  // Shared streak-update logic used by register-activity.
  async function applyStreakAction(
    userId: string,
    todayLocal: string // "YYYY-MM-DD" in user's local calendar day
  ): Promise<{ streak: number; maxStreak: number; streakRegistered: boolean; alreadyDoneToday: boolean; streakBroken: boolean }> {
    const userRow = await queryOne(
      db,
      'SELECT login_streak, login_streak_updated_date, login_streak_max FROM users WHERE id = ?',
      [userId]
    ) as any;
    if (!userRow) return { streak: 0, maxStreak: 0, streakRegistered: false, alreadyDoneToday: false, streakBroken: false };

    const lastDate: string | null = userRow.login_streak_updated_date ?? null;
    const currentStreak = Number(userRow.login_streak || 0);
    const maxStreak = Number(userRow.login_streak_max || 0);

    // Already registered an activity today — idempotent
    if (lastDate === todayLocal) {
      return { streak: currentStreak, maxStreak, streakRegistered: false, alreadyDoneToday: true, streakBroken: false };
    }

    let newStreak: number;
    let streakBroken = false;

    if (!lastDate) {
      newStreak = 1;
    } else {
      const lastMs = new Date(lastDate + 'T00:00:00Z').getTime();
      const todayMs = new Date(todayLocal + 'T00:00:00Z').getTime();
      const diffDays = Math.round((todayMs - lastMs) / 86_400_000);
      if (diffDays === 1) {
        newStreak = currentStreak + 1;
      } else {
        streakBroken = currentStreak >= 3;
        newStreak = 1;
      }
    }

    const newMax = Math.max(newStreak, maxStreak);
    await db.run(
      'UPDATE users SET login_streak = ?, login_streak_updated_date = ?, login_streak_max = ?, last_seen_at = ? WHERE id = ?',
      [newStreak, todayLocal, newMax, new Date().toISOString(), userId]
    );

    // Milestone in-app notification
    const milestones: Record<number, string> = {
      3:  '3 dias seguidos! Você está pegando o ritmo 🔥',
      7:  'Uma semana de sequência! Você está dominando 🔥🔥',
      14: '14 dias consecutivos! Você é um regular VIP 🏆',
      30: '30 dias! Mês inteiro — incrível 🏅',
      60: '60 dias de sequência! Você é lendário 👑',
    };
    if (milestones[newStreak]) {
      const notifId = `streak-${userId}-${newStreak}-${todayLocal}`;
      await db.run(
        `INSERT OR IGNORE INTO notifications (id, user_id, type, title, description, is_read, created_at)
         VALUES (?, ?, 'daily.streak.milestone', 'Nova sequência!', ?, 0, ?)`,
        [notifId, userId, milestones[newStreak], new Date().toISOString()]
      );
    }

    return { streak: newStreak, maxStreak: newMax, streakRegistered: true, alreadyDoneToday: false, streakBroken };
  }

  // ── GET streak info (read-only, called on app load) ───────────────────────
  app.post('/api/users/daily-checkin', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    // Login alone does NOT count as a qualifying action — just read and return.
    await db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), userId]);
    const userRow = await queryOne(
      db,
      'SELECT login_streak, login_streak_updated_date, login_streak_max FROM users WHERE id = ?',
      [userId]
    ) as any;
    const streak = Number(userRow?.login_streak || 0);
    const maxStreak = Number(userRow?.login_streak_max || 0);
    const lastDate = userRow?.login_streak_updated_date ?? null;
    // Detect broken streak (hasn't acted in 2+ days) for display purposes
    let streakBroken = false;
    if (lastDate && streak >= 3) {
      const lastMs = new Date(lastDate + 'T00:00:00Z').getTime();
      const diffDays = Math.round((Date.now() - lastMs) / 86_400_000);
      if (diffDays >= 2) streakBroken = true;
    }
    res.json({ streak, maxStreak, isNewDay: false, streakBroken, todayUtc: new Date().toISOString().slice(0, 10) });
  });

  // ── POST register-activity (qualifying action → updates streak) ───────────
  // Called client-side whenever a qualifying action is performed.
  // Actions: like | comment | message | post | radar | match_view | reel | chat_start | event_confirm | invite
  // timezoneOffsetMinutes: client's UTC offset (e.g. -180 for BRT)
  app.post('/api/users/register-activity', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const action = typeof req.body?.action === 'string' ? req.body.action : 'unknown';
    const tzOffset = typeof req.body?.timezoneOffsetMinutes === 'number' ? req.body.timezoneOffsetMinutes : 0;

    // Compute "today" in user's local timezone
    const nowLocal = new Date(Date.now() - tzOffset * 60_000);
    const todayLocal = nowLocal.toISOString().slice(0, 10);

    const result = await applyStreakAction(userId, todayLocal);
    // Check-in diário rende pontos uma vez por dia (a ação em si é registrada no servidor pelos endpoints)
    if (result.streakRegistered) {
      await awardTokens(db, userId, 'checkin', `checkin-${todayLocal}`, req.app.get('io'));
    }
    res.json({ ...result, action, todayLocal });
  });

  // ── Tokens: saldo + histórico do usuário ──────────────────────────────────
  app.get('/api/tokens/me', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const row = (await queryOne(
      db,
      'SELECT COALESCE(token_points,0) AS points, COALESCE(token_points_total,0) AS total, COALESCE(token_free_days,0) AS free_days, boost_until FROM users WHERE id = ?',
      [userId]
    )) as any;
    const history = (await queryAll(
      db,
      'SELECT action_type, points, created_at FROM token_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    )) as any[];
    const points = Number(row?.points || 0);
    const boostUntilRaw = row?.boost_until ? String(row.boost_until) : null;
    const boostActive = !!(boostUntilRaw && new Date(boostUntilRaw).getTime() > Date.now());
    res.json({
      points,
      total: Number(row?.total || 0),
      freeDays: Number(row?.free_days || 0),
      pointsPerDay: POINTS_PER_FREE_DAY,
      nextDayProgress: points % POINTS_PER_FREE_DAY,
      boostUntil: boostActive ? boostUntilRaw : null,
      boostCost: BOOST_COST,
      boostHours: BOOST_HOURS,
      history: history.map((h) => ({ action: String(h.action_type), points: Number(h.points), createdAt: String(h.created_at) })),
    });
  });

  // ── Tokens: ranking por tipo de perfil (Homem / Mulher / Casal) ───────────
  // Ranking MENSAL: soma apenas os pontos ganhos no mês corrente (a partir do
  // token_transactions). Zera naturalmente na virada do mês, sem job agendado
  // e sem afetar o saldo nem os dias grátis dos usuários.
  app.get('/api/tokens/ranking', requireAuth(env, db), async (req, res) => {
    // Liquida o mês anterior na 1ª visualização do novo mês (idempotente).
    await settlePreviousMonthIfNeeded(db, env, req.app.get('io') as SocketIOServer | undefined);
    const type = String(req.query.type || 'homem').toLowerCase();
    const genderCond =
      type === 'mulher' ? "u.gender = 'Mulher'"
      : type === 'casal' ? "u.gender LIKE 'Casal%'"
      : "u.gender = 'Homem'";
    // Início do mês atual em UTC (consistente com o teto diário, que usa UTC).
    const monthStart = `${nowIso().slice(0, 7)}-01`;
    const rows = (await queryAll(
      db,
      `SELECT u.id, u.name, u.avatar, u.gender,
              COALESCE(SUM(CASE WHEN t.points > 0 THEN t.points ELSE 0 END), 0) AS total
       FROM users u
       JOIN token_transactions t ON t.user_id = u.id AND t.created_at >= ? AND t.action_type != 'gift_received'
       WHERE (u.is_admin = 0 OR u.is_admin IS NULL)
         AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND ${genderCond}
       GROUP BY u.id, u.name, u.avatar, u.gender, u.created_at
       HAVING COALESCE(SUM(CASE WHEN t.points > 0 THEN t.points ELSE 0 END), 0) > 0
       ORDER BY total DESC, u.created_at ASC
       LIMIT 50`,
      [monthStart]
    )) as any[];
    const myId = req.auth!.userId;
    res.json({
      type,
      ranking: rows.map((r, i) => ({
        position: i + 1,
        id: String(r.id),
        name: String(r.name || ''),
        avatar: r.avatar ? String(r.avatar) : null,
        gender: r.gender ? String(r.gender) : null,
        total: Number(r.total || 0),
        isMe: String(r.id) === myId,
      })),
    });
  });

  // ── Tokens: presentear outro perfil ──────────────────────────────────────
  // Transfere tokens do remetente para o destinatário (com mensagem opcional).
  // O destinatário recebe notificação in-app + push; tokens recebidos contam no
  // saldo/total e podem virar dia grátis, mas são EXCLUÍDOS do ranking (anti-farm).
  app.post('/api/tokens/gift', requireAuth(env, db), async (req, res) => {
    const fromId = req.auth!.userId;
    const io = req.app.get('io') as SocketIOServer | undefined;

    const schema = z.object({
      toUserId: z.string().min(1),
      amount: z.number().int().positive().max(5000),
      message: z.string().trim().max(280).optional(),
    });
    const parsed = schema.safeParse({
      toUserId: req.body?.toUserId,
      amount: Number(req.body?.amount),
      message: req.body?.message,
    });
    if (!parsed.success) return res.status(400).json({ message: 'Dados inválidos.' });
    const { toUserId, amount } = parsed.data;
    const message = parsed.data.message?.trim() || null;

    if (toUserId === fromId) return res.status(400).json({ message: 'Você não pode presentear a si mesmo.' });

    const recipient = (await queryOne(db, 'SELECT id, name, is_banned, is_deactivated FROM users WHERE id = ? LIMIT 1', [toUserId])) as any;
    if (!recipient) return res.status(404).json({ message: 'Perfil não encontrado.' });
    if (recipient.is_banned || recipient.is_deactivated) return res.status(400).json({ message: 'Não é possível presentear este perfil.' });

    if (await isUserBlocked({ db }, { viewerId: fromId, targetId: toUserId })) {
      return res.status(403).json({ message: 'Não é possível presentear este perfil.' });
    }

    const senderRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p, name FROM users WHERE id = ?', [fromId])) as any;
    const balance = Number(senderRow?.p || 0);
    if (balance < amount) return res.status(400).json({ message: 'Saldo de tokens insuficiente.' });

    const giftId = randomUUID();
    const now = nowIso();

    // Debita o remetente
    await run(db, 'UPDATE users SET token_points = COALESCE(token_points,0) - ? WHERE id = ?', [amount, fromId]);
    await run(
      db,
      'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), fromId, 'gift_sent', -amount, giftId, now]
    );

    // Credita o destinatário (saldo + total; excluído do ranking)
    await run(
      db,
      'UPDATE users SET token_points = COALESCE(token_points,0) + ?, token_points_total = COALESCE(token_points_total,0) + ? WHERE id = ?',
      [amount, amount, toUserId]
    );
    await run(
      db,
      'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), toUserId, 'gift_received', amount, giftId, now]
    );

    // Conversão automática do destinatário: cada 100 pontos vira 1 dia grátis
    let freeDaysGranted = 0;
    const rBalRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [toUserId])) as any;
    let rBalance = Number(rBalRow?.p || 0);
    while (rBalance >= POINTS_PER_FREE_DAY) {
      freeDaysGranted += 1;
      await run(db, 'UPDATE users SET token_points = COALESCE(token_points,0) - ?, token_free_days = COALESCE(token_free_days,0) + 1 WHERE id = ?', [POINTS_PER_FREE_DAY, toUserId]);
      await grantPremiumDays(db, toUserId, 1);
      await run(
        db,
        'INSERT INTO token_transactions (id, user_id, action_type, points, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), toUserId, 'convert_day', -POINTS_PER_FREE_DAY, null, nowIso()]
      );
      rBalance -= POINTS_PER_FREE_DAY;
    }

    await db.persist();

    const fromName = String(senderRow?.name || 'Alguém');
    const plural = amount > 1 ? 's' : '';
    const desc = message
      ? `${fromName} te presenteou com ${amount} token${plural}: "${message}"`
      : `${fromName} te presenteou com ${amount} token${plural}.`;
    try {
      await createNotification({ db, io }, {
        userId: toUserId,
        type: 'tokens.gift',
        title: '🎁 Você ganhou um presente!',
        description: desc,
        dataJson: { fromUserId: fromId, fromName, amount, message },
      });
    } catch { /* non-fatal */ }
    try {
      await sendPushToUser({ db, env }, {
        userId: toUserId,
        payload: { title: '🎁 Você ganhou tokens!', body: desc, url: '/tokens', tag: `gift-${giftId}` },
      });
    } catch { /* non-fatal */ }

    // Saldos em tempo real para os dois lados
    const sBalRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [fromId])) as any;
    const rNewBalRow = (await queryOne(db, 'SELECT COALESCE(token_points,0) AS p FROM users WHERE id = ?', [toUserId])) as any;
    io?.to(`user:${fromId}`).emit('tokens.updated', { points: Number(sBalRow?.p || 0) });
    io?.to(`user:${toUserId}`).emit('tokens.updated', { points: Number(rNewBalRow?.p || 0), gifted: amount, freeDaysGranted });

    res.json({ ok: true, balance: Number(sBalRow?.p || 0), recipientName: String(recipient.name || '') });
  });

  // ── Tokens: destacar o próprio perfil (sink) ──────────────────────────────
  // Gasta BOOST_COST tokens e prioriza o perfil na descoberta por BOOST_HOURS.
  // Se já estiver destacado, soma o tempo (empilha).
  app.post('/api/tokens/boost', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const io = req.app.get('io') as SocketIOServer | undefined;

    const spend = await spendTokens(db, userId, BOOST_COST, 'boost', `boost-${Date.now()}`, io);
    if (!spend.ok) {
      return res.status(400).json({ message: 'Saldo de tokens insuficiente.', balance: spend.balance });
    }

    // Empilha sobre o destaque vigente (se ainda ativo)
    const row = (await queryOne(db, 'SELECT boost_until FROM users WHERE id = ?', [userId])) as any;
    const current = row?.boost_until ? new Date(String(row.boost_until)).getTime() : 0;
    const base = Math.max(Date.now(), current || 0);
    const boostUntil = new Date(base + BOOST_HOURS * 3600 * 1000).toISOString();
    await run(db, 'UPDATE users SET boost_until = ? WHERE id = ?', [boostUntil, userId]);
    await db.persist();

    res.json({ ok: true, balance: spend.balance, boostUntil, boostHours: BOOST_HOURS });
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
        bioLink: z.string().max(200).optional().nullable(),
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
        intentions: z.array(z.string().max(50)).max(10).optional().nullable(),
        fetiches: z.array(z.string().max(50)).max(30).optional().nullable(),
        availabilityStatus: z.enum(['now', 'week', 'month', 'online_only', 'not_looking']).optional().nullable(),
        meetingTagline: z.string().max(100).optional().nullable(),
        allowMessages: z.enum(['everyone', 'matches', 'friends', 'nobody']).optional().nullable(),
        blockOutsidePrefs: z.boolean().optional().nullable(),
        notificationVisits: z.boolean().optional().nullable(),
        notificationEmail: z.boolean().optional().nullable(),
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

    // Não permite trocar para um nome em lista negra (de perfil banido).
    if (typeof data.name === 'string' && await isNameBlacklisted(db, data.name)) {
      res.status(409).json({ error: 'name_blacklisted' });
      return;
    }

    // Tipo de perfil (gênero) é imutável: definido uma vez no cadastro, não muda mais.
    if ('gender' in data) {
      const cur = (await queryOne(db, 'SELECT gender FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
      if (cur?.gender && String(cur.gender).trim() !== '') {
        delete (data as any).gender;
      }
    }

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
      partnerName: 'partner_name',
      partnerSexualOrientation: 'partner_sexual_orientation',
      partnerEthnicity: 'partner_ethnicity',
      partnerHair: 'partner_hair',
      partnerEyes: 'partner_eyes',
      partnerHeight: 'partner_height',
      partnerBodyType: 'partner_body_type',
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
      meetingTagline: 'meeting_tagline',
      allowMessages: 'allow_messages',
      blockOutsidePrefs: 'block_outside_prefs',
      notificationVisits: 'notification_visits',
      notificationEmail: 'notify_email',
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
        values.push(key === 'city' ? sanitizeCityValue((data as any)[key]) : (data as any)[key]);
      }
    }
    if ('bioLink' in data) {
      // Normaliza e valida o link da bio (só http/https; bloqueia javascript:, etc.)
      const raw = String(data.bioLink ?? '').trim();
      let normalized: string | null = null;
      if (raw) {
        let url = raw;
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        try {
          const u = new URL(url);
          if (u.protocol === 'http:' || u.protocol === 'https:') normalized = u.toString();
        } catch { normalized = null; }
      }
      setParts.push('bio_link = ?');
      values.push(normalized);
    }
    if ('lookingFor' in data) {
      setParts.push('looking_for_json = ?');
      values.push(data.lookingFor ? JSON.stringify(data.lookingFor) : null);
    }
    if ('intentions' in data) {
      setParts.push('intentions_json = ?');
      values.push(data.intentions ? JSON.stringify(data.intentions) : null);
    }
    if ('fetiches' in data) {
      setParts.push('fetiches_json = ?');
      values.push(data.fetiches ? JSON.stringify(data.fetiches) : null);
    }
    if ('availabilityStatus' in data) {
      const status = data.availabilityStatus ?? null;
      setParts.push('availability_status = ?');
      values.push(status);
      // Set expiry: 'now' → 24h, 'week' → 7 days, 'month' → 30 days, 'online_only'/'not_looking' → no expiry, null → clear
      const expiry = status === 'now'
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : status === 'week'
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : status === 'month'
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            : null; // 'online_only', 'not_looking', null → no expiry / clear
      setParts.push('availability_until = ?');
      values.push(expiry);
    }

    if (setParts.length > 0) {
      values.push(req.auth!.userId);
      await run(db, `UPDATE users SET ${setParts.join(', ')} WHERE id = ?`, values);
      await persist();

      // Referral action tracking: bit0 = profile ≥50% complete
      try {
        const ioSvc = req.app.get('io') as SocketIOServer | undefined;
        const pu = (await queryOne(
          db,
          'SELECT name, avatar, bio, city, birth_date, gender, marital_status, looking_for_json FROM users WHERE id = ? LIMIT 1',
          [req.auth!.userId]
        )) as any;
        const filledFields = [pu?.name, pu?.avatar, pu?.bio, pu?.city, pu?.birth_date, pu?.gender, pu?.marital_status, pu?.looking_for_json].filter(
          (v) => v !== null && v !== undefined && String(v).trim() !== ''
        ).length;
        if (filledFields >= 4) {
          void markInviteeAction(db, ioSvc, req.auth!.userId, 0b001, env).catch(() => {});
        }
      } catch {}
    }

    const row = await getUserWithSponsorById(db, req.auth!.userId);
    const presence = req.app.get('presence');
    res.json(rowToPublicUser(row, presence?.isOnline(String(row.id)), { showEmail: true }));
  });

  // ── Search preferences ────────────────────────────────────────────────────

  app.get('/api/users/search-preferences', requireAuth(env, db), async (req, res) => {
    const row = await queryOne(db, 'SELECT * FROM user_search_preferences WHERE user_id = ?', [req.auth!.userId]) as any;
    if (!row) {
      res.json(null);
      return;
    }
    res.json({
      profileTypes: safeJsonParse(row.profile_types_json) ?? [],
      maxDistance: row.max_distance ?? null,
      intentions: safeJsonParse(row.intentions_json) ?? [],
      availabilityFilter: row.availability_filter ?? null,
      updatedAt: row.updated_at,
    });
  });

  app.put('/api/users/search-preferences', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      profileTypes: z.array(z.string().max(60)).max(20).optional().nullable(),
      maxDistance: z.number().int().min(1).max(5000).optional().nullable(),
      intentions: z.array(z.string().max(50)).max(10).optional().nullable(),
      availabilityFilter: z.enum(['any', 'available']).optional().nullable(),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const { profileTypes, maxDistance, intentions, availabilityFilter } = parsed.data;
    const now = nowIso();
    await run(
      db,
      `INSERT INTO user_search_preferences (user_id, profile_types_json, max_distance, intentions_json, availability_filter, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         profile_types_json  = excluded.profile_types_json,
         max_distance        = excluded.max_distance,
         intentions_json     = excluded.intentions_json,
         availability_filter = excluded.availability_filter,
         updated_at          = excluded.updated_at`,
      [
        req.auth!.userId,
        profileTypes != null ? JSON.stringify(profileTypes) : null,
        maxDistance ?? null,
        intentions != null ? JSON.stringify(intentions) : null,
        availabilityFilter ?? null,
        now,
      ]
    );
    await persist();
    res.json({ success: true });
  });

  // Deactivate profile
  app.put('/api/profile/deactivate', requireAuth(env, db), async (req, res) => {
    try {
      const userId = req.auth!.userId;
      await run(
        db,
        'UPDATE users SET is_deactivated = 1, deactivated_at = ?, deactivated_by_admin = 0, deactivated_by = NULL WHERE id = ?',
        [nowIso(), userId]
      );
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
      await run(
        db,
        'UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivated_by_admin = 0, deactivated_by = NULL WHERE id = ?',
        [userId]
      );
      await persist();
      res.json({ ok: true });
    } catch (err) {
      console.error('[profile/reactivate]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/profile/visits', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
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

  // Autocomplete de perfis por nome (dropdown na busca). Ignora distância/gênero —
  // procura no Brasil todo. Prioriza nome exato > começa com > contém.
  // IMPORTANTE: definida antes de /api/users/:userId para não ser capturada como id.
  app.get('/api/users/suggest', requireAuth(env, db), async (req, res) => {
    const viewerId = req.auth!.userId;
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (q.length < 2) { res.json({ users: [] }); return; }
    const rows = (await queryAll(
      db,
      `SELECT u.id, u.name, u.avatar, u.gender, u.city, u.state
       FROM users u
       WHERE u.id != ?
         AND (u.is_banned = 0 OR u.is_banned IS NULL)
         AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
         AND (u.is_admin = 0 OR u.is_admin IS NULL)
         AND u.name LIKE ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_user_id = ? AND b.blocked_user_id = u.id)
              OR (b.blocker_user_id = u.id AND b.blocked_user_id = ?)
         )
       ORDER BY CASE WHEN LOWER(u.name) = LOWER(?) THEN 0 WHEN LOWER(u.name) LIKE LOWER(?) THEN 1 ELSE 2 END, u.name ASC
       LIMIT 8`,
      [viewerId, `%${q}%`, viewerId, viewerId, q, `${q}%`]
    )) as any[];
    res.json({
      users: rows.map((r: any) => ({
        id: String(r.id),
        name: String(r.name || ''),
        avatar: r.avatar ?? null,
        gender: r.gender ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
      })),
    });
  });

  app.get('/api/users/:userId', requireAuth(env, db), async (req, res) => {
    const userId = req.params.userId;
    const viewerId = req.auth!.userId;
    const viewerRow = viewerId === userId ? null : ((await queryOne(db, 'SELECT is_admin, lat, lon FROM users WHERE id = ?', [viewerId])) as any);
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
          FROM media m
          WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'video/%' AND (m.source IS NULL OR m.source != 'chat')
        ) as videos_count,
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
    if (viewerId !== userId && Number((row as any).is_admin || 0) === 1 && Number(viewerRow?.is_admin || 0) !== 1) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // Perfil banido ou desativado some das consultas (exceto para o próprio dono e admins).
    if (
      viewerId !== userId &&
      Number(viewerRow?.is_admin || 0) !== 1 &&
      (Number((row as any).is_banned || 0) === 1 || Number((row as any).is_deactivated || 0) === 1)
    ) {
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
    const distanceKm =
      viewerId !== userId && viewerRow?.lat != null && viewerRow?.lon != null && (row as any).lat != null && (row as any).lon != null
        ? roundDistanceKm(
            haversineKm(
              { lat: Number(viewerRow.lat), lon: Number(viewerRow.lon) },
              { lat: Number((row as any).lat), lon: Number((row as any).lon) }
            )
          )
        : null;
    res.json({
      ...rowToPublicUser(row, presence?.isOnline(String(row.id))),
      publicPhotosCount: Number((row as any).public_photos_count || 0),
      privatePhotosCount: Number((row as any).private_photos_count || 0),
      videosCount: Number((row as any).videos_count || 0),
      testimonialsCount: Number((row as any).approved_testimonials_count || 0),
      profileVisitsCount: Number((row as any).profile_visits_count || 0),
      distanceKm,
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
      `INSERT OR IGNORE INTO blocks (id, blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?, ?)`,
      [randomUUID(), blockerId, targetId, new Date().toISOString()]
    );
    await persist();
    res.json({ success: true, blocked: true });
  });

  app.delete('/api/users/:userId/block', requireAuth(env, db), async (req, res) => {
    const targetId = String(req.params.userId || '');
    const blockerId = req.auth!.userId;
    await db.run(
      `DELETE FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`,
      [blockerId, targetId]
    );
    await persist();
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
    const viewerRow = (await queryOne(db, 'SELECT is_admin, lat, lon, city FROM users WHERE id = ?', [viewerId])) as any;
    const viewerIsAdmin = Number(viewerRow?.is_admin || 0) === 1;
    const page   = Math.max(1, Number(req.query.page  || 1));
    const limit  = Math.min(40, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const search   = req.query.search   ? String(req.query.search).trim()   : '';
    const city     = req.query.city     ? String(req.query.city).trim()     : '';
    const ageRange = req.query.ageRange ? String(req.query.ageRange).trim() : 'all';
    const genders  = req.query.genders  ? String(req.query.genders).split(',').map((g) => g.trim()).filter(Boolean) : [];
    const radarKm      = req.query.radar       ? Number(req.query.radar)           : null;
    const sort         = ['active', 'new', 'nearby', 'available'].includes(String(req.query.sort || '')) ? String(req.query.sort) : 'nearby';
    const availableOnly = req.query.availableOnly === 'true' || req.query.availableOnly === '1';
    const intentionFilter = req.query.intention ? String(req.query.intention).trim() : '';

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

    if (!viewerIsAdmin) {
      conditions.push('(u.is_admin = 0 OR u.is_admin IS NULL)');
    }

    if (search) {
      conditions.push('(u.name LIKE ? OR u.city LIKE ? OR u.state LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (city) {
      conditions.push('(u.city LIKE ? OR u.state LIKE ?)');
      params.push(`%${city}%`, `%${city}%`);
    }

    // Busca por nome/cidade ignora o filtro de gênero — ao procurar um perfil
    // específico, o usuário quer encontrá-lo independentemente do tipo de perfil.
    if (!search && genders.length > 0) {
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

    if (availableOnly) {
      const nowIso = new Date().toISOString();
      conditions.push(`(u.availability_status IS NOT NULL AND u.availability_status != 'not_looking' AND (u.availability_until IS NULL OR u.availability_until > ?))`);
      params.push(nowIso);
    }

    if (intentionFilter) {
      conditions.push(`(u.intentions_json IS NOT NULL AND u.intentions_json LIKE ?)`);
      params.push(`%${intentionFilter}%`);
    }

    let viewerLat: number | null = viewerRow?.lat != null ? Number(viewerRow.lat) : null;
    let viewerLon: number | null = viewerRow?.lon != null ? Number(viewerRow.lon) : null;
    // Busca por nome ignora o raio de distância (procura no Brasil todo).
    if (!search && radarKm !== null) {
      if (viewerLat !== null && viewerLon !== null) {
        const latDelta = radarKm / 111;
        const lonDelta = radarKm / (111 * Math.cos((viewerLat * Math.PI) / 180));
        conditions.push('u.lat BETWEEN ? AND ? AND u.lon BETWEEN ? AND ?');
        params.push(viewerLat - latDelta, viewerLat + latDelta, viewerLon - lonDelta, viewerLon + lonDelta);
      }
    }

    const whereClause = conditions.join(' AND ');
    const presence = req.app.get('presence') as undefined | { isOnline: (id: string) => boolean };

    const distanceOrderBy =
      viewerLat !== null && viewerLon !== null
        ? `CASE WHEN u.lat IS NOT NULL AND u.lon IS NOT NULL THEN 0 ELSE 1 END ASC,
      ABS(u.lat - ${viewerLat}) + ABS(u.lon - ${viewerLon}) ASC,`
        : '';

    // Mesma cidade primeiro (nome igual, ignorando caixa/espaços). Inline-escapado
    // como o distanceOrderBy — a cidade vem do nosso DB, não de input do usuário.
    const viewerCity = viewerRow?.city ? String(viewerRow.city).trim() : '';
    const sameCityOrderBy = viewerCity
      ? `CASE WHEN u.city IS NOT NULL AND LOWER(TRIM(u.city)) = LOWER('${viewerCity.replace(/'/g, "''")}') THEN 0 ELSE 1 END ASC,`
      : '';

    let orderBy: string;
    if (sort === 'new') {
      orderBy = 'u.created_at DESC';
    } else if (sort === 'active') {
      orderBy = `CASE WHEN u.last_seen_at IS NOT NULL THEN 0 ELSE 1 END ASC, u.last_seen_at DESC, u.created_at DESC`;
    } else if (sort === 'available') {
      // NOW first, then WEEK, then MONTH, then ONLINE_ONLY, then others; within group by distance
      const nowIso2 = new Date().toISOString();
      params.push(nowIso2, nowIso2, nowIso2, nowIso2);
      orderBy = `
        CASE
          WHEN u.availability_status = 'now'         AND (u.availability_until IS NULL OR u.availability_until > ?) THEN 0
          WHEN u.availability_status = 'week'        AND (u.availability_until IS NULL OR u.availability_until > ?) THEN 1
          WHEN u.availability_status = 'month'       AND (u.availability_until IS NULL OR u.availability_until > ?) THEN 2
          WHEN u.availability_status = 'online_only' AND (u.availability_until IS NULL OR u.availability_until > ?) THEN 3
          ELSE 4
        END ASC,
        ${distanceOrderBy}
        u.last_seen_at DESC
      `;
    } else {
      // 'nearby' — mesma cidade primeiro, depois distância, depois online, recência.
      const onlineThresholdIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      params.push(onlineThresholdIso);
      orderBy = `
        ${sameCityOrderBy}
        ${distanceOrderBy}
        CASE WHEN u.last_seen_at IS NOT NULL AND u.last_seen_at >= ? THEN 0 ELSE 1 END ASC,
        CASE WHEN u.last_seen_at IS NOT NULL THEN 0 ELSE 1 END ASC,
        u.last_seen_at DESC,
        u.created_at DESC
      `;
    }

    // Fetch limit+1 to know if there are more pages
    params.push(limit + 1, offset);
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
        const distanceKm =
          viewerLat !== null && viewerLon !== null && r.lat != null && r.lon != null
            ? roundDistanceKm(
                haversineKm(
                  { lat: viewerLat, lon: viewerLon },
                  { lat: Number(r.lat), lon: Number(r.lon) }
                )
              )
            : null;
        return {
          ...u,
          mainMediaUrl: r.main_filename ? `/uploads/${String(r.main_filename)}` : null,
          distanceKm,
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

  app.get('/api/users/:userId/badges', requireAuth(env, db), async (req, res) => {
    const userId = String(req.params.userId || '');
    const row = (await queryOne(
      db,
      `SELECT u.created_at, u.last_seen_at,
        (SELECT COUNT(*) FROM media m WHERE m.user_id = u.id AND m.is_private = 0 AND m.mime_type LIKE 'image/%' AND (m.source IS NULL OR m.source != 'chat')) as photos_count,
        (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'user' AND l.target_id = u.id) as likes_received,
        (SELECT COUNT(*) FROM conversations c WHERE (c.user_a_id = u.id OR c.user_b_id = u.id) AND EXISTS (SELECT 1 FROM messages m2 WHERE m2.conversation_id = c.id LIMIT 1)) as conversations_count
       FROM users u WHERE u.id = ? LIMIT 1`,
      [userId]
    )) as any;
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ badges: computeBadges(row) });
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
      await sendPushToUser(
        { db, env },
        {
          userId: ownerId,
          payload: {
            title: 'Pedido de fotos privadas',
            body: `${requester?.name ? String(requester.name) : 'Alguém'} pediu acesso às suas fotos privadas.`,
            url: '/notifications',
            tag: `private_photos.request:${requesterId}`,
            data: { requesterId },
          },
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
    await sendPushToUser(
      { db, env },
      {
        userId: ownerId,
        payload: {
          title: 'Pedido de fotos privadas',
          body: `${requester?.name ? String(requester.name) : 'Alguém'} pediu acesso às suas fotos privadas.`,
          url: '/notifications',
          tag: `private_photos.request:${requesterId}`,
          data: { requesterId },
        },
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
    await sendPushToUser(
      { db, env },
      {
        userId: String(row.requester_user_id),
        payload: {
          title: 'Acesso às fotos privadas aprovado',
          body: `${owner?.name ? String(owner.name) : 'O usuário'} autorizou você a ver as fotos privadas.`,
          url: '/notifications',
          tag: `private_photos.approved:${req.auth!.userId}`,
          data: { ownerId: req.auth!.userId },
        },
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

    // Idempotência: evita duplicar a mesma mídia em uploads repetidos (toque duplo
    // ou retry de rede). Se o mesmo arquivo (nome + tamanho) já foi enviado por este
    // usuário nos últimos 60s, retorna a mídia existente em vez de criar outra.
    const dupSince = new Date(Date.now() - 60_000).toISOString();
    const dup = (await queryOne(
      db,
      'SELECT id, filename FROM media WHERE user_id = ? AND original_name = ? AND size = ? AND is_private = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1',
      [req.auth!.userId, req.file.originalname, storedFile.size, isPrivate ? 1 : 0, dupSince]
    )) as any;
    if (dup?.id) {
      if (isPrivate) {
        const token = jwt.sign({ mediaId: String(dup.id) }, env.JWT_SECRET, { expiresIn: '30m' });
        res.json({ id: dup.id, url: `/private-uploads/${dup.id}?token=${encodeURIComponent(token)}` });
      } else {
        res.json({ id: dup.id, url: `/uploads/${String(dup.filename)}` });
      }
      return;
    }

    // pHash: bloqueia o reenvio de imagens marcadas (uso indevido de imagem / NCII).
    let imagePhash: string | null = null;
    if (mime.startsWith('image/')) {
      const fp = resolveMediaFilePath(storedFile.filename, isPrivate);
      if (fp) imagePhash = await computeImagePHash(fp);
      if (await isHashBlocked(imagePhash)) {
        if (fp) { try { unlinkSync(fp); } catch { /* noop */ } }
        res.status(403).json({ error: 'blocked_content', message: 'Esta imagem foi bloqueada por uso indevido e não pode ser publicada.' });
        return;
      }
    }

    const id = randomUUID();
    await run(
      db,
      'INSERT INTO media (id, user_id, filename, original_name, mime_type, size, is_private, is_main, source, phash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
      [id, req.auth!.userId, storedFile.filename, req.file.originalname, storedFile.mimetype, storedFile.size, isPrivate ? 1 : 0, mediaSource, imagePhash, nowIso()]
    );
    await persist();
    if (mediaSource === 'profile' && mime.startsWith('image/')) {
      // Só mulheres e casais ganham tokens por foto.
      await awardContentTokensIfEligible(db, req.auth!.userId, 'photo', id, req.app.get('io'));
    }
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

    // Move o arquivo físico entre as pastas pública/privada (o toggle antigo só
    // atualizava o banco, deixando o arquivo na pasta errada — causa do "arquivo
    // não encontrado" nas fotos privadas).
    if (media.filename) ensureMediaFileInExpectedDir(String(media.filename), isPrivate);

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
    const media = (await queryOne(db, 'SELECT id, user_id FROM media WHERE id = ? LIMIT 1', [mediaId])) as any;
    if (!media) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (String(media.user_id) !== req.auth!.userId && !req.auth!.isAdmin) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    await deleteStoredMedia(mediaId);
    res.json({ ok: true });
  });

  app.get('/api/onboarding/suggestions', async (req, res) => {
    try {
      const city = req.query.city ? String(req.query.city) : null;
      const state = req.query.state ? String(req.query.state) : null;
      const lookingFor = parseAudiencePreferences(req.query.lookingFor ? String(req.query.lookingFor) : '');

      // Priority order: same city > same state > verified > has avatar > recently active
      const qualityOrder = [
        'CASE WHEN avatar IS NOT NULL AND avatar <> \'\' THEN 0 ELSE 1 END',
        'CASE WHEN is_verified = 1 THEN 0 ELSE 1 END',
        'CASE WHEN last_seen_at IS NOT NULL THEN 0 ELSE 1 END',
      ];

      let rows: any[] = [];
      if (lookingFor.length > 0) {
        const placeholders = lookingFor.map(() => '?').join(', ');
        const params: any[] = [...lookingFor];
        const orderParts: string[] = [];
        const audiencePriority = buildAudiencePriorityOrder('gender', lookingFor);
        orderParts.push(...audiencePriority.orderParts);
        params.push(...audiencePriority.params);
        if (city) {
          orderParts.push('CASE WHEN city = ? THEN 0 ELSE 1 END');
          params.push(city);
        }
        if (state) {
          orderParts.push('CASE WHEN state = ? THEN 0 ELSE 1 END');
          params.push(state);
        }
        orderParts.push(...qualityOrder);
        const orderBy = `${orderParts.join(', ')}, last_seen_at DESC NULLS LAST`;
        rows = await queryAll(
          db,
          `SELECT * FROM users WHERE is_admin = 0 AND (is_banned = 0 OR is_banned IS NULL) AND (is_deactivated = 0 OR is_deactivated IS NULL) AND gender IN (${placeholders}) ORDER BY ${orderBy} LIMIT 18`,
          params
        );
      }

      if (rows.length === 0) {
        rows = await queryAll(db, `SELECT * FROM users WHERE is_admin = 0 AND (is_banned = 0 OR is_banned IS NULL) AND (is_deactivated = 0 OR is_deactivated IS NULL) AND avatar IS NOT NULL AND avatar <> '' ORDER BY ${baseAudienceRankingSql('gender')}, is_verified DESC, last_seen_at DESC NULLS LAST LIMIT 18`);
      }

      res.json(rows.filter((r: any) => r.avatar).slice(0, 6).map((row: any) => rowToPublicUser(row)));
    } catch (err) {
      console.error('[onboarding/suggestions]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/match/cards', requireAuth(env, db), async (req, res) => {
    if (!(await userHasPremiumAccess(db, req.auth!.userId))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const me = (await queryOne(db, 'SELECT lat, lon, city, looking_for_json, is_admin FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const myLat = me?.lat ? Number(me.lat) : null;
    const myLon = me?.lon ? Number(me.lon) : null;
    const myCity = String(me?.city || '').trim() || null;
    const myLookingFor = Array.isArray(safeJsonParse(me?.looking_for_json)) ? safeJsonParse(me?.looking_for_json) as string[] : [];
    const viewerIsAdmin = Number(me?.is_admin || 0) === 1;

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
    if (!viewerIsAdmin) {
      whereClause += ' AND (u.is_admin = 0 OR u.is_admin IS NULL)';
    }
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

    // Perfis com destaque ativo (comprado com tokens) aparecem primeiro.
    const boostPrioritySql = "CASE WHEN u.boost_until IS NOT NULL AND u.boost_until > ? THEN 0 ELSE 1 END,";
    params.push(nowIso());

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
        ) as videos_count,
        (
          SELECT COUNT(*)
          FROM likes l2
          WHERE l2.target_type = 'user' AND l2.target_id = u.id
        ) as likes_received,
        (
          SELECT COUNT(*)
          FROM conversations c
          WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)
            AND EXISTS (SELECT 1 FROM messages m2 WHERE m2.conversation_id = c.id LIMIT 1)
        ) as conversations_count
      FROM users u
      WHERE ${whereClause}
      ORDER BY
        ${boostPrioritySql}
        ${cityPrioritySql}
        ${myLat !== null && myLon !== null
          ? `ABS(u.lat - ${myLat}) + ABS(u.lon - ${myLon}) ASC,`
          : ''}
        CASE WHEN u.is_premium = 1 OR (u.trial_ends_at IS NOT NULL AND u.trial_ends_at > ?) THEN 0 ELSE 1 END,
        ${audiencePriority.orderParts.length > 0 ? `${audiencePriority.orderParts.join(', ')},` : `${baseAudienceRankingSql('u.gender')},`}
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
        const rLat = r.lat != null ? Number(r.lat) : null;
        const rLon = r.lon != null ? Number(r.lon) : null;
        const distanceKm =
          myLat !== null && myLon !== null && rLat !== null && rLon !== null
            ? roundDistanceKm(haversineKm({ lat: myLat, lon: myLon }, { lat: rLat, lon: rLon }))
            : null;
        return {
          ...u,
          mainMediaUrl: mainUrl,
          mediaSummary: { photosCount, videosCount },
          badges: computeBadges(r),
          distanceKm,
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

    let isMutualMatch = false;
    let matchConversationId: string | undefined;

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
      await sendPushToUser(
        { db, env },
        {
          userId: targetUserId,
          payload: {
            title: 'Você recebeu um match',
            body: `${actorName} deu match com você.`,
            url: '/match',
            tag: `profile.liked:${myId}`,
            data: { actorId: myId, actorName },
          },
        }
      );

      const reciprocalLike = (await queryOne(
        db,
        'SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ? LIMIT 1',
        [targetUserId, 'user', myId]
      )) as any;

      if (reciprocalLike?.id) {
        isMutualMatch = true;
        // Auto-create friendship on mutual like (if not already friends)
        const existingFriendship = (await queryOne(
          db,
          `SELECT id FROM friend_requests
           WHERE ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
           LIMIT 1`,
          [myId, targetUserId, targetUserId, myId]
        )) as any;
        if (!existingFriendship) {
          await run(db, 'INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)', [
            randomUUID(), myId, targetUserId, 'accepted', nowIso(),
          ]);
        } else if (String(existingFriendship.status) === 'pending') {
          await run(db, 'UPDATE friend_requests SET status = ? WHERE id = ?', ['accepted', existingFriendship.id]);
        }

        const conversationId = await ensureConversationBetweenUsers(db, myId, targetUserId);
        matchConversationId = conversationId;
        const matchMessageId = randomUUID();
        const matchCreatedAt = nowIso();
        const matchMessage = 'Vocês se curtiram mutuamente. Agora podem conversar por aqui.';

        await run(
          db,
          'INSERT INTO messages (id, conversation_id, sender_id, content, is_delivered, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [matchMessageId, conversationId, myId, matchMessage, 1, matchCreatedAt]
        );
        await persist();

        const messagePayload = {
          id: matchMessageId,
          conversationId,
          senderId: myId,
          content: matchMessage,
          mediaId: null,
          mediaUrl: null,
          mediaMimeType: null,
          clientId: null,
          isViewOnce: false,
          isDelivered: true,
          createdAt: matchCreatedAt,
        };

        io?.to(`user:${myId}`).emit('message.new', messagePayload);
        io?.to(`user:${targetUserId}`).emit('message.new', messagePayload);

        const targetUser = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [targetUserId])) as any;
        const targetName = targetUser?.name ? String(targetUser.name) : 'essa pessoa';
        await createNotification(
          { db, io },
          {
            userId: myId,
            type: 'match.mutual',
            title: 'Curtida recíproca',
            description: `Você e ${targetName} se curtiram. A conversa já está liberada.`,
            dataJson: { conversationId, actorId: targetUserId, actorName: targetName },
          }
        );
        await createNotification(
          { db, io },
          {
            userId: targetUserId,
            type: 'match.mutual',
            title: 'Curtida recíproca',
            description: `Você e ${actorName} se curtiram. A conversa já está liberada.`,
            dataJson: { conversationId, actorId: myId, actorName },
          }
        );
        await sendPushToUser(
          { db, env },
          {
            userId: myId,
            payload: {
              title: 'Novo match confirmado',
              body: `Você e ${targetName} se curtiram. Toque para abrir o chat.`,
              url: `/chat?conversationId=${encodeURIComponent(conversationId)}`,
              tag: `match:${conversationId}`,
              data: { conversationId, actorId: targetUserId },
            },
          }
        );
        await sendPushToUser(
          { db, env },
          {
            userId: targetUserId,
            payload: {
              title: 'Novo match confirmado',
              body: `Você e ${actorName} se curtiram. Toque para abrir o chat.`,
              url: `/chat?conversationId=${encodeURIComponent(conversationId)}`,
              tag: `match:${conversationId}`,
              data: { conversationId, actorId: myId },
            },
          }
        );
        const chatUrl = `${String(env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '')}/chat?conversationId=${encodeURIComponent(conversationId)}`;
        await sendTelegramToUser({ db, env }, {
          userId: myId,
          text: `💞 <b>Match confirmado!</b>\nVocê e <b>${targetName}</b> se curtiram mutuamente.\n\n👉 <a href="${chatUrl}">Abrir conversa</a>`,
        });
        await sendTelegramToUser({ db, env }, {
          userId: targetUserId,
          text: `💞 <b>Match confirmado!</b>\nVocê e <b>${actorName}</b> se curtiram mutuamente.\n\n👉 <a href="${chatUrl}">Abrir conversa</a>`,
        });
      }
    }
    await run(db, 'DELETE FROM match_passes WHERE user_id = ? AND passed_user_id = ?', [myId, targetUserId]);
    await persist();

    res.json({ ok: true, mutual: isMutualMatch, conversationId: matchConversationId });
  });

  // Check if current user has liked a specific profile
  app.get('/api/match/like-status', requireAuth(env, db), async (req, res) => {
    const targetId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
    if (!targetId) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const myId = req.auth!.userId;
    const liked = await queryOne(
      db,
      `SELECT id FROM likes WHERE user_id = ? AND target_type = 'user' AND target_id = ? LIMIT 1`,
      [myId, targetId]
    );
    // Also check for mutual friendship
    const friendship = await queryOne(
      db,
      `SELECT id FROM friend_requests
       WHERE status = 'accepted'
         AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))
       LIMIT 1`,
      [myId, targetId, targetId, myId]
    );
    res.json({ liked: !!liked, isFriend: !!friendship });
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

    const viewer = (await queryOne(db, 'SELECT lat, lon, is_admin FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const viewerLat = viewer?.lat != null ? Number(viewer.lat) : null;
    const viewerLon = viewer?.lon != null ? Number(viewer.lon) : null;
    const viewerIsAdmin = Number(viewer?.is_admin || 0) === 1;

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
        ${viewerIsAdmin ? '' : 'AND (u.is_admin = 0 OR u.is_admin IS NULL)'}
      ORDER BY l.created_at DESC
      LIMIT 200
    `,
      [req.auth!.userId]
    );

    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    res.json(
      rows.map((r: any) => {
        const distanceKm =
          viewerLat !== null && viewerLon !== null && r.lat != null && r.lon != null
            ? roundDistanceKm(
                haversineKm(
                  { lat: viewerLat, lon: viewerLon },
                  { lat: Number(r.lat), lon: Number(r.lon) }
                )
              )
            : null;
        return {
          ...rowToPublicUser(r, presence?.isOnline ? presence.isOnline(String(r.id)) : false),
          likedAt: r.liked_at,
          mainMediaUrl: r.main_filename ? `/uploads/${String(r.main_filename)}` : null,
          distanceKm,
        };
      })
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
      'SELECT id, email, name, gender, city, state, looking_for_json, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    if (!hasPremiumAccess(me, subscriptionsEnabled, env.BILLING_TEST_EMAILS)) {
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
    if (weeklyUsed >= 1) {
      res.status(403).json({ error: 'radar_weekly_limit', weeklyLimit: 1, weeklyUsed });
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
        'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, via_radar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [messageId, String(conversation.id), req.auth!.userId, radarMessage, null, 0, 1, 1, messageCreatedAt]
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
        viaRadar: true,
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
      const distanceKm =
        radarLat !== null && radarLon !== null && candidateLat !== null && candidateLon !== null
          ? roundDistanceKm(haversineKm({ lat: radarLat, lon: radarLon }, { lat: candidateLat, lon: candidateLon }))
          : null;
      const actorLabel = parsed.data.isAnonymous ? 'Alguém' : String(me.name || 'Alguém');
      const body =
        distanceKm !== null
          ? `${actorLabel} a ${distanceKm} km de você acabou de publicar um radar. Veja agora.`
          : `${actorLabel} acabou de publicar um radar na sua região. Veja agora.`;
      await sendPushToUser(
        { db, env },
        {
          userId: String(candidate.id),
          payload: {
            title: 'Radar ativo perto de você',
            body,
            url: '/radar',
            tag: `radar:${id}`,
            data: {
              broadcastId: id,
              senderId: req.auth!.userId,
              city: radarCity,
              state: radarState,
              distanceKm,
            },
          },
        }
      );
      const actorLabelTg = parsed.data.isAnonymous ? 'Alguém' : String(me.name || 'Alguém');
      const tgRadarText = distanceKm !== null
        ? `📡 <b>Radar ativo!</b>\n${actorLabelTg} está a ${distanceKm} km de você e quer encontrar alguém com o seu perfil.\n\n👉 <a href="${String(env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '')}/radar">Ver radar</a>`
        : `📡 <b>Radar ativo!</b>\n${actorLabelTg} ativou o radar na sua região.\n\n👉 <a href="${String(env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '')}/radar">Ver radar</a>`;
      await sendTelegramToUser({ db, env }, { userId: String(candidate.id), text: tgRadarText });
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
        weeklyLimit: 1,
        weeklyUsed: weeklyUsed + 1,
        weeklyRemaining: Math.max(0, 1 - (weeklyUsed + 1)),
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

  // ─── Daily Missions ───────────────────────────────────────────────────────
  app.get('/api/missions/today', requireAuth(env, db), async (req, res) => {
    try {
    const myId = req.auth!.userId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString().slice(0, 10); // YYYY-MM-DD

    const [
      likesGiven,
      postsToday,
      messagesSent,
      profilesVisited,
      storiesToday,
    ] = await Promise.all([
      // Likes given to other users today
      queryOne(db,
        `SELECT COUNT(*) as c FROM likes WHERE user_id = ? AND target_type = 'user' AND DATE(created_at) = ?`,
        [myId, todayIso]
      ) as Promise<any>,
      // Posts (with media) created today
      queryOne(db,
        `SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND DATE(created_at) = ? AND media_ids_json IS NOT NULL AND media_ids_json != '[]'`,
        [myId, todayIso]
      ) as Promise<any>,
      // Messages sent today (distinct conversations)
      queryOne(db,
        `SELECT COUNT(DISTINCT conversation_id) as c FROM messages WHERE sender_id = ? AND DATE(created_at) = ?`,
        [myId, todayIso]
      ) as Promise<any>,
      // Profile visits today (distinct targets)
      queryOne(db,
        `SELECT COUNT(DISTINCT visited_user_id) as c FROM profile_visits WHERE visitor_user_id = ? AND DATE(created_at) = ?`,
        [myId, todayIso]
      ) as Promise<any>,
      // Stories published today
      queryOne(db,
        `SELECT COUNT(*) as c FROM stories WHERE user_id = ? AND DATE(created_at) = ?`,
        [myId, todayIso]
      ) as Promise<any>,
    ]);

    const missions = [
      {
        id: 'access_app',
        title: 'Acessar o app hoje',
        description: 'Você já está aqui! ✅',
        icon: '📱',
        target: 1,
        progress: 1,
        completed: true,
        reward: 'Sequência mantida',
        rewardIcon: '🔥',
      },
      {
        id: 'like_profiles',
        title: 'Curtir 5 perfis',
        description: 'Curta perfis no Match ou no feed',
        icon: '❤️',
        target: 5,
        progress: Math.min(Number(likesGiven?.c ?? 0), 5),
        completed: Number(likesGiven?.c ?? 0) >= 5,
        reward: 'Destaque no feed por 2h',
        rewardIcon: '⭐',
      },
      {
        id: 'post_content',
        title: 'Publicar uma foto ou vídeo',
        description: 'Poste no feed com mídia',
        icon: '📸',
        target: 1,
        progress: Math.min(Number(postsToday?.c ?? 0), 1),
        completed: Number(postsToday?.c ?? 0) >= 1,
        reward: 'Radar bônus',
        rewardIcon: '📡',
      },
      {
        id: 'post_story',
        title: 'Publique 1 Story hoje',
        description: 'Poste um story de foto, vídeo ou texto — some em 24h',
        icon: '✨',
        target: 1,
        progress: Math.min(Number(storiesToday?.c ?? 0), 1),
        completed: Number(storiesToday?.c ?? 0) >= 1,
        reward: 'Aparece no topo do feed',
        rewardIcon: '🔥',
      },
      {
        id: 'reply_messages',
        title: 'Responder 2 conversas',
        description: 'Mande mensagens em pelo menos 2 chats',
        icon: '💬',
        target: 2,
        progress: Math.min(Number(messagesSent?.c ?? 0), 2),
        completed: Number(messagesSent?.c ?? 0) >= 2,
        reward: 'Sobe no ranking semanal',
        rewardIcon: '🏆',
      },
      {
        id: 'visit_profiles',
        title: 'Visitar 3 perfis',
        description: 'Clique e veja o perfil de outras pessoas',
        icon: '👁️',
        target: 3,
        progress: Math.min(Number(profilesVisited?.c ?? 0), 3),
        completed: Number(profilesVisited?.c ?? 0) >= 3,
        reward: 'Aparece como "Perfil Ativo"',
        rewardIcon: '✨',
      },
    ];

    const completedCount = missions.filter((m) => m.completed).length;
    res.json({ missions, completedCount, totalCount: missions.length, date: todayIso });
    } catch (err) {
      console.error('[missions/today]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/radar', requireAuth(env, db), async (req, res) => {
    const presence = req.app.get('presence') as undefined | { isOnline: (userId: string) => boolean };
    const io = req.app.get('io') as SocketIOServer | undefined;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const me = (await queryOne(
      db,
      'SELECT id, name, avatar, gender, city, state, lat, lon, looking_for_json, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ? LIMIT 1',
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
         u.id as sender_id, u.name as sender_name, u.avatar as sender_avatar, u.gender as sender_gender, u.city as sender_city, u.state as sender_state, u.lat as sender_lat, u.lon as sender_lon, u.looking_for_json as sender_looking_for_json
        FROM radar_broadcasts rb
       JOIN users u ON u.id = rb.user_id
       WHERE rb.user_id != ?
         AND rb.deactivated_at IS NULL
         AND rb.expires_at > ?
       ORDER BY rb.created_at DESC
       LIMIT 100`,
      [req.auth!.userId, nowIso()]
    );

    const activeBroadcastIds = activeRows.map((row: any) => String(row.id));
    const existingViewRows =
      activeBroadcastIds.length > 0
        ? await queryAll(
            db,
            `SELECT id, broadcast_id, delivered_at, viewed_at, contacted_at
             FROM radar_broadcast_views
             WHERE viewer_user_id = ?
               AND broadcast_id IN (${activeBroadcastIds.map(() => '?').join(', ')})`,
            [req.auth!.userId, ...activeBroadcastIds]
          )
        : [];
    const existingViewsByBroadcastId = new Map<string, any>();
    for (const row of existingViewRows as any[]) {
      existingViewsByBroadcastId.set(String(row.broadcast_id), row);
    }

    const incoming: any[] = [];
    const heatmapZoneCounts = new Map<string, number>();
    for (const row of activeRows as any[]) {
      const parsedTargetGenders = safeJsonParse(row.target_genders_json);
      const targetGenders = Array.isArray(parsedTargetGenders) ? (parsedTargetGenders as string[]) : ['all'];
      if (!radarTargetsUser(targetGenders, me.gender)) continue;
      if (row.only_online && presence?.isOnline && !presence.isOnline(String(req.auth!.userId))) continue;
      const parsedSenderLookingFor = safeJsonParse(row.sender_looking_for_json);
      const senderLookingFor = Array.isArray(parsedSenderLookingFor) ? (parsedSenderLookingFor as string[]) : [];
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

      const existingView = existingViewsByBroadcastId.get(String(row.id)) as any;
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
        const deliveredAt = nowIso();
        const viewedAt = nowIso();
        const newViewId = randomUUID();
        await run(
          db,
          'INSERT INTO radar_broadcast_views (id, broadcast_id, viewer_user_id, delivered_at, viewed_at, contacted_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newViewId, String(row.id), req.auth!.userId, deliveredAt, viewedAt, null]
        );
        existingViewsByBroadcastId.set(String(row.id), {
          id: newViewId,
          broadcast_id: String(row.id),
          delivered_at: deliveredAt,
          viewed_at: viewedAt,
          contacted_at: null,
        });
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

      const senderLat = row.sender_lat != null ? Number(row.sender_lat) : null;
      const senderLon = row.sender_lon != null ? Number(row.sender_lon) : null;
      const markerLat = senderLat ?? radarLat;
      const markerLon = senderLon ?? radarLon;
      const distanceKm =
        markerLat !== null && markerLon !== null && myLat !== null && myLon !== null
          ? roundDistanceKm(haversineKm({ lat: markerLat, lon: markerLon }, { lat: myLat, lon: myLon }))
          : null;
      const zoneLabel =
        markerLat !== null && markerLon !== null && myLat !== null && myLon !== null
          ? radarZoneLabelFromCoordinates({ lat: myLat, lon: myLon }, { lat: markerLat, lon: markerLon })
          : 'Sua região';
      heatmapZoneCounts.set(zoneLabel, (heatmapZoneCounts.get(zoneLabel) ?? 0) + 1);

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
        distanceKm,
        zoneLabel,
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

    const heatmapZones = ['Noroeste', 'Norte', 'Nordeste', 'Oeste', 'Centro', 'Leste', 'Sudoeste', 'Sul', 'Sudeste'].map((label) => ({
      id: normalizeRadarText(label),
      label,
      count: heatmapZoneCounts.get(label) ?? 0,
    }));
    const hottestZone = [...heatmapZones].sort((a, b) => b.count - a.count)[0];

    res.json({
      canCreate: hasPremiumAccess(me, subscriptionsEnabled, env.BILLING_TEST_EMAILS),
      usage: {
        dailyLimit: 1,
        dailyUsed: Number(dailyUsedRow?.c || 0),
        dailyRemaining: Math.max(0, 1 - Number(dailyUsedRow?.c || 0)),
        weeklyLimit: 1,
        weeklyUsed: Number(weeklyUsedRow?.c || 0),
        weeklyRemaining: Math.max(0, 1 - Number(weeklyUsedRow?.c || 0)),
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
      heatmap: {
        totalActive: incoming.length,
        hottestZone: hottestZone?.count ? hottestZone.label : null,
        zones: heatmapZones,
      },
    });
  });

  app.get('/api/radar/highlights', requireAuth(env, db), async (req, res) => {
    const me = (await queryOne(
      db,
      'SELECT id, name, gender, city, state, lat, lon, looking_for_json FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    if (!me) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const myLookingForRaw = safeJsonParse(me.looking_for_json);
    const myLookingFor = Array.isArray(myLookingForRaw) ? (myLookingForRaw as string[]) : [];
    const rows = await queryAll(
      db,
      `SELECT
         rb.*,
         u.id as sender_id, u.name as sender_name, u.avatar as sender_avatar, u.gender as sender_gender,
         u.city as sender_city, u.state as sender_state, u.looking_for_json as sender_looking_for_json
       FROM radar_broadcasts rb
       JOIN users u ON u.id = rb.user_id
       WHERE rb.user_id != ?
         AND rb.deactivated_at IS NULL
         AND rb.expires_at > ?
       ORDER BY rb.created_at DESC
       LIMIT 40`,
      [req.auth!.userId, nowIso()]
    );

    const highlights: any[] = [];
    for (const row of rows as any[]) {
      const targetGenders = Array.isArray(safeJsonParse(row.target_genders_json)) ? (safeJsonParse(row.target_genders_json) as string[]) : ['all'];
      if (!radarTargetsUser(targetGenders, me.gender)) continue;

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
      const distanceKm =
        radarLat !== null && radarLon !== null && myLat !== null && myLon !== null
          ? roundDistanceKm(haversineKm({ lat: radarLat, lon: radarLon }, { lat: myLat, lon: myLon }))
          : null;

      if (distanceKm !== null) {
        matchesLocation = distanceKm <= Number(row.radius_km || 25);
      } else {
        matchesLocation =
          normalizeRadarText(row.city) === normalizeRadarText(me.city) &&
          normalizeRadarText(row.state) === normalizeRadarText(me.state);
      }
      if (!matchesLocation) continue;

      highlights.push({
        id: String(row.id),
        city: String(row.city),
        state: String(row.state),
        message: String(row.message),
        radius: Number(row.radius_km || 25),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        distanceKm,
        isAnonymous: !!row.is_anonymous,
        sender: {
          id: String(row.sender_id),
          name: !!row.is_anonymous ? 'Perfil discreto' : String(row.sender_name),
          avatar: !!row.is_anonymous ? null : row.sender_avatar ?? null,
          gender: !!row.is_anonymous ? null : row.sender_gender ?? null,
          city: row.sender_city ?? null,
          state: row.sender_state ?? null,
        },
      });
      if (highlights.length >= 6) break;
    }

    res.json({ highlights });
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
    const viewer = (await queryOne(db, 'SELECT lat, lon FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const viewerLat = viewer?.lat != null ? Number(viewer.lat) : null;
    const viewerLon = viewer?.lon != null ? Number(viewer.lon) : null;
    const rows = await queryAll(
      db,
      `
      SELECT * FROM (
        SELECT c.id, c.user_a_id, c.user_b_id, c.created_at, c.is_highlighted, c.highlight_note, c.highlight_color,
          ua.name as user_a_name, ua.avatar as user_a_avatar, ua.gender as user_a_gender, ua.city as user_a_city, ua.state as user_a_state, ua.lat as user_a_lat, ua.lon as user_a_lon, ua.last_seen_at as user_a_last_seen_at,
          ub.name as user_b_name, ub.avatar as user_b_avatar, ub.gender as user_b_gender, ub.city as user_b_city, ub.state as user_b_state, ub.lat as user_b_lat, ub.lon as user_b_lon, ub.last_seen_at as user_b_last_seen_at,
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
        WHERE (c.user_a_id = ? OR c.user_b_id = ?)
          AND (ua.is_banned = 0 OR ua.is_banned IS NULL)
          AND (ub.is_banned = 0 OR ub.is_banned IS NULL)
          AND (ua.is_deactivated = 0 OR ua.is_deactivated IS NULL)
          AND (ub.is_deactivated = 0 OR ub.is_deactivated IS NULL)
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
                distanceKm:
                  viewerLat !== null && viewerLon !== null && r.user_b_lat != null && r.user_b_lon != null
                    ? roundDistanceKm(
                        haversineKm(
                          { lat: viewerLat, lon: viewerLon },
                          { lat: Number(r.user_b_lat), lon: Number(r.user_b_lon) }
                        )
                      )
                    : null,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_b_id)) : false,
                lastSeenAt: r.user_b_last_seen_at ?? null,
              }
            : {
                id: r.user_a_id,
                name: r.user_a_name,
                avatar: r.user_a_avatar,
                gender: r.user_a_gender ?? null,
                city: r.user_a_city ?? null,
                state: r.user_a_state ?? null,
                distanceKm:
                  viewerLat !== null && viewerLon !== null && r.user_a_lat != null && r.user_a_lon != null
                    ? roundDistanceKm(
                        haversineKm(
                          { lat: viewerLat, lon: viewerLon },
                          { lat: Number(r.user_a_lat), lon: Number(r.user_a_lon) }
                        )
                      )
                    : null,
                isOnline: presence?.isOnline ? presence.isOnline(String(r.user_a_id)) : false,
                lastSeenAt: r.user_a_last_seen_at ?? null,
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

  // Marca a conversa como não lida para quem visualiza: reabre a última mensagem
  // recebida (is_read = 0). Não emite 'message.read' — é uma ação local do leitor,
  // o remetente não deve receber "não lido de novo".
  app.post('/api/conversations/:conversationId/unread', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;

    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const lastIncoming = (await queryOne(
      db,
      'SELECT id FROM messages WHERE conversation_id = ? AND sender_id != ? ORDER BY created_at DESC LIMIT 1',
      [conversationId, req.auth!.userId]
    )) as any;

    if (!lastIncoming) {
      res.json({ ok: true, unread: false });
      return;
    }

    await run(db, 'UPDATE messages SET is_read = 0 WHERE id = ?', [String(lastIncoming.id)]);
    await persist();

    res.json({ ok: true, unread: true });
  });

  app.get('/api/conversations/:conversationId/messages', requireAuth(env, db), async (req, res) => {
    const conversationId = req.params.conversationId;
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [conversationId])) as any;
    if (!conv || (conv.user_a_id !== req.auth!.userId && conv.user_b_id !== req.auth!.userId)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const viewer = (await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const canViewReceived = hasPremiumAccess(viewer, subscriptionsEnabled, env.BILLING_TEST_EMAILS);

    // Mark messages as read
    await run(db, 'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [conversationId, req.auth!.userId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(conversationId).emit('message.read', { conversationId, readerId: req.auth!.userId });

    const rows = await queryAll(
      db,
      `
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.media_id, m.is_view_once, m.is_viewed, m.is_delivered, m.created_at, m.is_read,
             m.deleted_for_all, m.deleted_by_ids, m.story_id, m.reaction, m.reply_to_message_id, m.via_radar,
             med.filename as media_filename, med.mime_type as media_mime_type,
             smed.filename as story_media_filename, smed.mime_type as story_media_mime_type,
             s.text as story_text, s.background as story_background,
             rm.sender_id as reply_sender_id, rm.content as reply_content, rm.media_id as reply_media_id
      FROM messages m
      LEFT JOIN media med ON med.id = m.media_id
      LEFT JOIN stories s ON s.id = m.story_id
      LEFT JOIN media smed ON smed.id = s.media_id
      LEFT JOIN messages rm ON rm.id = m.reply_to_message_id
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
          viaRadar: !!m.via_radar,
          isLocked: !deletedForMe && !canViewReceived && m.sender_id !== viewerId,
          replyStory: deletedForMe || !m.story_id ? null : {
            id: String(m.story_id),
            mediaUrl: m.story_media_filename ? `/uploads/${m.story_media_filename}` : null,
            mimeType: m.story_media_mime_type ?? null,
            text: m.story_text ?? null,
            background: m.story_background ?? null,
          },
          reaction: deletedForMe ? null : (m.reaction ?? null),
          replyTo: (deletedForMe || !m.reply_to_message_id) ? null : {
            id: String(m.reply_to_message_id),
            senderId: m.reply_sender_id ? String(m.reply_sender_id) : '',
            content: m.reply_content ? String(m.reply_content) : null,
            hasMedia: !!m.reply_media_id,
          },
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

  // POST /api/messages/:messageId/reaction — reagir/desreagir a uma mensagem do chat
  // (estilo Instagram), com as mesmas reações "safadas" do feed. Toggle por reação.
  app.post('/api/messages/:messageId/reaction', requireAuth(env, db), async (req, res) => {
    const userId = req.auth!.userId;
    const messageId = req.params.messageId;
    const reactionSchema = z.object({
      reaction: z.enum(['heart', 'love', 'wow', 'devil', 'fire', 'splash']).optional(),
    });
    const parsed = reactionSchema.safeParse(req.body || {});
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input' }); return; }

    const msg = (await queryOne(
      db,
      'SELECT id, conversation_id, sender_id, COALESCE(reaction, \'\') AS reaction FROM messages WHERE id = ?',
      [messageId]
    )) as any;
    if (!msg) { res.status(404).json({ error: 'not_found' }); return; }

    // Só participantes da conversa podem reagir
    const conv = (await queryOne(db, 'SELECT id, user_a_id, user_b_id FROM conversations WHERE id = ?', [String(msg.conversation_id)])) as any;
    if (!conv || (String(conv.user_a_id) !== userId && String(conv.user_b_id) !== userId)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (!(await userHasPremiumAccess(db, userId, env.BILLING_TEST_EMAILS))) {
      res.status(403).json({ error: 'premium_required' });
      return;
    }

    const requested = parsed.data.reaction || 'heart';
    const current = String(msg.reaction || '');
    // Toggle: mesma reação → remove; reação diferente (ou vazia) → aplica.
    const nextReaction = current === requested ? null : requested;
    await run(db, 'UPDATE messages SET reaction = ? WHERE id = ?', [nextReaction, messageId]);
    await persist();

    const io = req.app.get('io') as SocketIOServer | undefined;
    io?.to(String(msg.conversation_id)).emit('message.reaction', {
      messageId,
      conversationId: String(msg.conversation_id),
      reaction: nextReaction,
      reactorId: userId,
    });

    // Notifica o autor da mensagem quando alguém reage (não no toggle-off, nem na própria msg)
    if (nextReaction && String(msg.sender_id) !== userId) {
      try {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        const emoji = ({ heart: '💜', love: '😍', wow: '🤤', devil: '😈', fire: '🔥', splash: '💦' } as Record<string, string>)[nextReaction] || '💜';
        await createNotification({ db, io }, {
          userId: String(msg.sender_id),
          type: 'message.reaction',
          title: `${emoji} Reagiram à sua mensagem`,
          description: `${actorName} reagiu ${emoji} à sua mensagem.`,
          dataJson: { conversationId: String(msg.conversation_id), messageId, actorId: userId, actorName, reaction: nextReaction },
        });
        await sendPushToUser({ db, env }, {
          userId: String(msg.sender_id),
          payload: {
            title: `${emoji} ${actorName}`,
            body: `Reagiu ${emoji} à sua mensagem.`,
            url: `/chat?conversationId=${encodeURIComponent(String(msg.conversation_id))}`,
            tag: `chat-reaction:${messageId}`,
            data: { conversationId: String(msg.conversation_id), messageId },
          },
        });
      } catch (err) {
        console.error('[messages/reaction] notification failed', err);
      }
    }

    res.json({ reaction: nextReaction });
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
      replyToMessageId: z.string().max(100).optional(),
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

    // Mensagem citada (resposta): só vale se for da MESMA conversa.
    let replyTo: { id: string; senderId: string; content: string | null; hasMedia: boolean } | null = null;
    if (parsed.data.replyToMessageId) {
      const rm = (await queryOne(
        db,
        'SELECT id, conversation_id, sender_id, content, media_id FROM messages WHERE id = ? LIMIT 1',
        [parsed.data.replyToMessageId]
      )) as any;
      if (rm && String(rm.conversation_id) === conversationId) {
        replyTo = {
          id: String(rm.id),
          senderId: String(rm.sender_id),
          content: rm.content ? String(rm.content) : null,
          hasMedia: !!rm.media_id,
        };
      }
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
    await run(db, 'INSERT INTO messages (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, created_at, reply_to_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      conversationId,
      req.auth!.userId,
      content,
      mediaId,
      isViewOnce,
      1, // is_delivered
      createdAt,
      replyTo?.id ?? null,
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
      createdAt,
      replyTo,
    });
    const sender = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const senderName = sender?.name ? String(sender.name) : 'Nova mensagem';
    const previewText = content
      ? String(content).trim().slice(0, 140)
      : String(mediaMimeType || '').startsWith('video/')
        ? 'Enviou um vídeo para você.'
        : 'Enviou uma foto para você.';
    await sendPushToUser(
      { db, env },
      {
        userId: otherId,
        payload: {
          title: senderName,
          body: previewText || 'Nova mensagem no chat.',
          url: `/chat?conversationId=${encodeURIComponent(conversationId)}`,
          tag: `chat:${conversationId}`,
          data: { conversationId, senderId: req.auth!.userId },
        },
      }
    );
    // Referral action tracking: bit1 = sent_message
    void markInviteeAction(db, io, req.auth!.userId, 0b010, env).catch(() => {});
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
    await awardTokens(db, req.auth!.userId, 'like', parsed.data.targetId, req.app.get('io'));
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
        await sendPushToUser(
          { db, env },
          {
            userId: ownerId,
            payload: {
              title: 'Curtiram sua publicação',
              body: `${actorName} curtiu sua publicação.`,
              url: `/feed?postId=${parsed.data.targetId}`,
              tag: `post.liked:${parsed.data.targetId}`,
              data: { postId: parsed.data.targetId, actorId: req.auth!.userId },
            },
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
        await sendPushToUser(
          { db, env },
          {
            userId: targetUserId,
            payload: {
              title: 'Seu perfil foi favoritado',
              body: `${actorName} favoritou seu perfil.`,
              url: '/match',
              tag: `profile.favorited:${req.auth!.userId}`,
              data: { actorId: req.auth!.userId },
            },
          }
        );
        // Referral action tracking: bit2 = liked_profile
        void markInviteeAction(db, io, req.auth!.userId, 0b100, env).catch(() => {});
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
        await sendPushToUser(
          { db, env },
          {
            userId: ownerId,
            payload: {
              title: 'Curtiram seu conto',
              body: `${actorName} curtiu seu conto.`,
              url: '/feed',
              tag: `experience.liked:${parsed.data.targetId}`,
              data: { experienceId: parsed.data.targetId, actorId: req.auth!.userId },
            },
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
    const schema = z.object({
      targetType: z.enum(['post', 'user', 'photo', 'experience']),
      targetId: z.string().min(1),
      content: z.string().min(1).max(2000),
      parentCommentId: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    // Validate parent comment exists and belongs to same target
    if (parsed.data.parentCommentId) {
      const parent = (await queryOne(db, 'SELECT id, target_id FROM comments WHERE id = ? AND parent_comment_id IS NULL LIMIT 1', [parsed.data.parentCommentId])) as any;
      if (!parent || String(parent.target_id) !== parsed.data.targetId) {
        res.status(400).json({ error: 'invalid_parent_comment' });
        return;
      }
    }
    const id = randomUUID();
    const createdAt = nowIso();
    const parentId = parsed.data.parentCommentId ?? null;
    await run(db, 'INSERT INTO comments (id, user_id, target_type, target_id, content, created_at, parent_comment_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id,
      req.auth!.userId,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.content,
      createdAt,
      parentId,
    ]);
    await persist();
    await awardTokens(db, req.auth!.userId, 'comment', id, req.app.get('io'));
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
        await sendPushToUser(
          { db, env },
          {
            userId: ownerId,
            payload: {
              title: 'Novo comentário',
              body: `${actorName} comentou: ${preview}`,
              url: `/feed?postId=${parsed.data.targetId}&openComments=1`,
              tag: `post.commented:${parsed.data.targetId}`,
              data: { postId: parsed.data.targetId, commentId: id, actorId: req.auth!.userId },
            },
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
        await sendPushToUser(
          { db, env },
          {
            userId: ownerId,
            payload: {
              title: 'Novo comentário no seu conto',
              body: `${actorName} comentou: ${preview}`,
              url: '/feed',
              tag: `experience.commented:${parsed.data.targetId}`,
              data: { experienceId: parsed.data.targetId, commentId: id, actorId: req.auth!.userId },
            },
          }
        );
      }
    }
    // Notify parent comment author when someone replies
    if (parentId) {
      const parentComment = (await queryOne(db, 'SELECT user_id FROM comments WHERE id = ? LIMIT 1', [parentId])) as any;
      const parentOwnerId = parentComment?.user_id ? String(parentComment.user_id) : null;
      if (parentOwnerId && parentOwnerId !== req.auth!.userId) {
        const actor = (await queryOne(db, 'SELECT name FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
        const actorName = actor?.name ? String(actor.name) : 'Alguém';
        const preview = String(parsed.data.content).slice(0, 140);
        await createNotification({ db, io }, {
          userId: parentOwnerId,
          type: 'comment.replied',
          title: 'Responderam seu comentário',
          description: `${actorName} respondeu: ${preview}`,
          dataJson: { postId: parsed.data.targetId, commentId: id, parentCommentId: parentId, actorId: req.auth!.userId, actorName },
        });
        await sendPushToUser({ db, env }, {
          userId: parentOwnerId,
          payload: {
            title: 'Responderam seu comentário',
            body: `${actorName}: ${preview}`,
            url: '/feed',
            tag: `comment.replied:${id}`,
            data: { commentId: id, actorId: req.auth!.userId },
          },
        });
      }
    }
    res.json({ id, parentCommentId: parentId });
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
      `SELECT c.id, c.content, c.created_at, c.parent_comment_id,
        u.id as user_id, u.name as user_name, u.avatar as user_avatar,
        u.gender as user_gender, u.city as user_city, u.state as user_state
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.target_type = ? AND c.target_id = ?
       ORDER BY c.created_at ASC
       LIMIT ?`,
      [parsed.data.targetType, parsed.data.targetId, limit]
    );

    const toComment = (r: any) => ({
      id: String(r.id),
      content: String(r.content),
      createdAt: String(r.created_at),
      parentCommentId: r.parent_comment_id ? String(r.parent_comment_id) : null,
      user: {
        id: String(r.user_id),
        name: String(r.user_name),
        avatar: r.user_avatar ?? null,
        gender: r.user_gender ?? null,
        city: r.user_city ?? null,
        state: r.user_state ?? null,
      },
    });

    // Build nested structure: top-level comments with replies array
    const allComments = (rows as any[]).map(toComment);
    const topLevel = allComments.filter((c) => !c.parentCommentId);
    const repliesMap: Record<string, typeof allComments> = {};
    allComments.filter((c) => c.parentCommentId).forEach((c) => {
      if (!repliesMap[c.parentCommentId!]) repliesMap[c.parentCommentId!] = [];
      repliesMap[c.parentCommentId!].push(c);
    });

    res.json(topLevel.map((c) => ({ ...c, replies: repliesMap[c.id] ?? [] })));
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
        u.name as friend_name, u.avatar as friend_avatar, u.gender as friend_gender,
        u.city as friend_city, u.state as friend_state,
        u.birth_date as friend_birth_date,
        u.availability_status as friend_availability_status,
        u.last_seen_at as friend_last_seen_at,
        u.is_verified as friend_is_verified,
        u.sexual_orientation as friend_sexual_orientation,
        u.marital_status as friend_marital_status,
        u.intentions_json as friend_intentions_json,
        u.meeting_tagline as friend_meeting_tagline
      FROM friend_requests fr
      JOIN users u ON u.id = (CASE WHEN fr.from_user_id = ? THEN fr.to_user_id ELSE fr.from_user_id END)
      WHERE (fr.from_user_id = ? OR fr.to_user_id = ?) AND fr.status = 'accepted'
      ORDER BY fr.created_at DESC
      LIMIT 200
    `,
      [req.auth!.userId, req.auth!.userId, req.auth!.userId, req.auth!.userId]
    );

    const nowMs = Date.now();
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
      friends: friends.map((r: any) => {
        const lastSeen = r.friend_last_seen_at ? new Date(r.friend_last_seen_at).getTime() : null;
        const isOnline = lastSeen ? nowMs - lastSeen < 5 * 60 * 1000 : false;
        return {
          id: r.friend_id,
          name: r.friend_name,
          avatar: r.friend_avatar,
          gender: r.friend_gender ?? null,
          city: r.friend_city ?? null,
          state: r.friend_state ?? null,
          birthDate: r.friend_birth_date ?? null,
          availabilityStatus: r.friend_availability_status ?? null,
          lastSeenAt: r.friend_last_seen_at ?? null,
          isOnline,
          isVerified: !!r.friend_is_verified,
          sexualOrientation: r.friend_sexual_orientation ?? null,
          maritalStatus: r.friend_marital_status ?? null,
          intentions: safeJsonParse(r.friend_intentions_json) ?? [],
          meetingTagline: r.friend_meeting_tagline ?? null,
          createdAt: r.created_at,
        };
      }),
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

  // Remove a friend (delete the accepted friend_request in either direction)
  app.delete('/api/friends/:userId', requireAuth(env, db), async (req, res) => {
    const myId = req.auth!.userId;
    const targetId = req.params.userId;
    if (!targetId || targetId === myId) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }
    await run(
      db,
      `DELETE FROM friend_requests
       WHERE status = 'accepted'
         AND ((from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?))`,
      [myId, targetId, targetId, myId]
    );
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/push/public-key', requireAuth(env, db), async (_req, res) => {
    res.json({ publicKey: pushConfig.publicKey });
  });

  app.post('/api/push/subscribe', requireAuth(env, db), async (req, res) => {
    const schema = z.object({
      endpoint: z.string().url(),
      expirationTime: z.number().nullable().optional(),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    const subscription = parsed.data as BrowserPushSubscription;
    const existing = (await queryOne(db, 'SELECT id FROM push_subscriptions WHERE endpoint = ? LIMIT 1', [
      subscription.endpoint,
    ])) as any;
    const timestamp = nowIso();
    const userAgent = limitText(getHeaderValue(req, 'user-agent'), 255);

    if (existing?.id) {
      await run(
        db,
        'UPDATE push_subscriptions SET user_id = ?, subscription_json = ?, user_agent = ?, updated_at = ? WHERE id = ?',
        [
          req.auth!.userId,
          JSON.stringify(subscription),
          userAgent,
          timestamp,
          String(existing.id),
        ]
      );
    } else {
      await run(
        db,
        `INSERT INTO push_subscriptions (id, user_id, endpoint, subscription_json, user_agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          req.auth!.userId,
          subscription.endpoint,
          JSON.stringify(subscription),
          userAgent,
          timestamp,
          timestamp,
        ]
      );
    }

    await persist();
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', requireAuth(env, db), async (req, res) => {
    const schema = z.object({ endpoint: z.string().url() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }

    await run(db, 'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [
      req.auth!.userId,
      parsed.data.endpoint,
    ]);
    await persist();
    res.json({ ok: true });
  });

  app.get('/api/notifications', requireAuth(env, db), async (req, res) => {
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const me = (await queryOne(db, 'SELECT email, is_premium, trial_ends_at, hub_license_end_at FROM users WHERE id = ?', [req.auth!.userId])) as any;
    const isPremium = hasPremiumAccess(me, subscriptionsEnabled, env.BILLING_TEST_EMAILS);

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

  app.get('/api/subscriptions/plans', requireAuth(env, db), async (req, res) => {
    try {
      const globalEnabled = await getSubscriptionsEnabled(db);
      const userRow = (await queryOne(db, 'SELECT email FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
      const subscriptionsEnabled = isBillingEnabledForUser(globalEnabled, String(userRow?.email || ''), env.BILLING_TEST_EMAILS);
      if (!subscriptionsEnabled) {
        res.json([]);
        return;
      }
      let rawPlans: any[];
      if (shouldUseHubBilling(env)) {
        try {
          const plansTimeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('HubBilling timeout')), 5000)
          );
          rawPlans = await Promise.race([listHubPlans(getHubConfig(env)), plansTimeout]);
        } catch (hubError) {
          console.warn('[subscriptions/plans] HubBilling unavailable, using fallback plans:', (hubError as Error).message);
          rawPlans = fallbackSubscriptionPlans();
        }
      } else {
        rawPlans = fallbackSubscriptionPlans();
      }
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
      res.status(500).json({ error: 'plans_unavailable' });
    }
  });

  app.get('/api/subscriptions/discount', requireAuth(env, db), (_req, res) => {
    res.json({ percent: 0 });
  });

  app.get('/api/subscriptions/status', requireAuth(env, db), async (req, res) => {
    const globalEnabled = await getSubscriptionsEnabled(db);
    const row = (await queryOne(
      db,
      'SELECT id, email, hub_customer_id, hub_product_id, hub_access_status, hub_access_reason, hub_banner, hub_license_end_at, trial_started_at, trial_ends_at, is_premium FROM users WHERE id = ? LIMIT 1',
      [req.auth!.userId]
    )) as any;
    const subscriptionsEnabled = isBillingEnabledForUser(globalEnabled, String(row?.email || ''), env.BILLING_TEST_EMAILS);
    if (!row) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    // For billing-test whitelist users (when subscriptions are globally disabled),
    // skip HubBilling re-sync so manual DB overrides (is_premium=0) are preserved for testing.
    const isTestUser = !globalEnabled && isBillingEnabledForUser(false, String(row?.email || ''), env.BILLING_TEST_EMAILS);
    if (!shouldUseHubBilling(env) || !row.hub_customer_id || isTestUser) {
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
      await syncHubAccessForUser(db, req.auth!.userId, status, { io: req.app.get('io') as SocketIOServer | undefined, env });
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
    const globalEnabled = await getSubscriptionsEnabled(db);
    const checkoutUserRow = (await queryOne(db, 'SELECT email FROM users WHERE id = ? LIMIT 1', [req.auth!.userId])) as any;
    const subscriptionsEnabled = isBillingEnabledForUser(globalEnabled, String(checkoutUserRow?.email || ''), env.BILLING_TEST_EMAILS);
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
        // Só reatribui automaticamente quando o e-mail das duas contas é idêntico —
        // sinal forte de que é a mesma pessoa (users.email é UNIQUE e normalizado em
        // lowercase em todo cadastro, então isso só ocorre em anomalia de dados
        // legada, não em uso normal). CPF sozinho NÃO é prova de identidade — não é
        // segredo, e qualquer pessoa que soubesse o CPF de outro usuário poderia
        // digitá-lo numa conta nova. Sem o e-mail batendo, cai no bloqueio normal e
        // o caso vai para o suporte, que verifica manualmente antes de mexer no
        // acesso pago de alguém.
        const oldEmail = String(existingCustomerOwner.email || '').trim().toLowerCase();
        const newEmail = String(user.email || '').trim().toLowerCase();
        const sameOwner = !!oldEmail && oldEmail === newEmail;

        if (!sameOwner) {
          res.status(409).json({
            error: 'hub_customer_already_linked',
            message:
              'Este CPF/CNPJ ja esta vinculado a outro cadastro no NoSigilo. Use os dados do titular correto para gerar o PIX.',
          });
          return;
        }

        await run(
          db,
          'UPDATE users SET is_premium = 0, hub_access_status = NULL, hub_customer_id = NULL WHERE id = ?',
          [String(existingCustomerOwner.id)]
        );
        await persist();
        console.log(
          `[checkout] hub_customer_id ${customerId} reatribuido de ${existingCustomerOwner.id} para ${req.auth!.userId} (mesmo e-mail: ${newEmail})`
        );
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
      // Para onde o cliente volta após pagar em checkout hospedado (ex: LivePix).
      // Aponta para o próprio NoSigilo — sem isso, o Hub usa o endereço dele e o
      // cliente cai na tela de login do painel administrativo.
      const returnUrl = `${String(env.FRONTEND_ORIGIN || '').replace(/\/$/, '')}/bem-vindo`;
      const checkout = await createHubCheckout(hubConfig, {
        orderId,
        billingType: parsed.data.billingType || 'PIX',
        payerName: checkoutBilling.legalName,
        payerDocument: checkoutBilling.document || null,
        returnUrl: returnUrl || null,
      });
      await persist();

      // Registro best-effort da geração para a métrica de abandono no admin.
      // Envolto em try/catch próprio: falha aqui NUNCA pode quebrar o checkout.
      try {
        await run(
          db,
          'INSERT INTO checkout_generations (id, user_id, plan_id, billing_type, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [randomUUID(), req.auth!.userId, planId, parsed.data.billingType || 'PIX', String(orderId), nowIso()]
        );
        await persist();
      } catch (logErr) {
        console.warn('[checkout] falha ao registrar checkout_generation (ignorado):', (logErr as Error).message);
      }

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

    // Respond immediately so the gateway never times out waiting for us
    res.json({ ok: true });

    // Process asynchronously — errors here are caught and emailed to the admin
    const adminEmailOpts = { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: env.APP_NAME || 'NoSigilo' };
    const adminTo = env.HUB_BILLING_ADMIN_EMAIL || '';

    const notifyAdmin = (title: string, detail: string) => {
      if (!adminTo) return;
      sendAdminAlertEmail(adminEmailOpts, {
        to: adminTo,
        subject: `[NoSigilo] Falha no webhook de pagamento — ${eventType || 'evento desconhecido'}`,
        title,
        body: detail,
      }).catch((e) => console.error('[webhook/admin-alert] failed to send email:', e));
    };

    try {
      const user = (await queryOne(db, 'SELECT id FROM users WHERE hub_customer_id = ? LIMIT 1', [customerId])) as any;
      if (!user) {
        console.log(`[hub-billing/webhook] customerId=${customerId} not found — ignored`);
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

        // ── Promoter commission: paga/ativa licença gera comissão ─────────────
        // Tanto payment.approved quanto license.activated concedem acesso, então
        // ambos devem gerar comissão (idempotente por assinante).
        if (eventType === 'payment.approved' || eventType === 'license.activated') {
          try {
            const created = await ensurePromoterCommission(
              db,
              String(user.id),
              Number(payload?.payload?.amount || 990),
              eventType,
              { io: req.app.get('io') as SocketIOServer | undefined, env }
            );
            if (created) await persist();
          } catch (err) {
            console.error('[promoter] commission error:', err);
          }
        }

        // ── Cancel commission on chargeback ─────────────────────────────────
        if (eventType === 'payment.chargeback') {
          try {
            await run(db, "UPDATE promoter_commissions SET status = 'cancelled' WHERE subscriber_user_id = ?", [String(user.id)]);
            await persist();
          } catch (err) {
            console.error('[promoter] cancel commission error:', err);
          }
        }
      }

      console.log(`[hub-billing/webhook] event=${eventType} customerId=${customerId} status=${nextStatus ?? 'ignored'}`);
    } catch (err) {
      const errMsg = err instanceof Error ? `${err.message}\n\n${err.stack || ''}` : String(err);
      console.error('[hub-billing/webhook] processing error:', err);
      notifyAdmin(
        `Falha ao processar evento "${eventType}"`,
        `customerId: ${customerId}\neventType: ${eventType}\nerro: ${errMsg}\n\npayload:\n${JSON.stringify(payload, null, 2)}`
      );
    }
  });

  app.post('/api/events', requireAuth(env, db), async (req, res) => {
    const io = req.app.get('io') as SocketIOServer | undefined;
    const subscriptionsEnabled = await getSubscriptionsEnabled(db);
    const userRow = (await queryOne(db, 'SELECT email, name, is_premium, trial_ends_at, hub_license_end_at, lat, lon FROM users WHERE id = ?', [req.auth!.userId])) as any;
    if (!hasPremiumAccess(userRow, subscriptionsEnabled, env.BILLING_TEST_EMAILS)) {
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
        await sendPushToUser(
          { db, env },
          {
            userId: String(targetUser.id),
            payload: {
              title: `Novo evento: ${payload.title}`,
              body: `${userRow.name} convidou você para um evento em ${payload.location}.`,
              url: '/events',
              tag: `event_invitation:${id}`,
              data: { eventId: id },
            },
          }
        );

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

  // ── Feed: atividade "Perto de você" (radares + eventos compatíveis) ───────
  // Radares: reaproveita os que o fan-out do radar já entregou a este viewer.
  // Eventos: futuros, com público-alvo compatível e na cidade/estado do viewer.
  app.get('/api/feed/nearby-activity', requireAuth(env, db), async (req, res) => {
    const myId = req.auth!.userId;
    const me = (await queryOne(db, 'SELECT gender, city, state, lat, lon FROM users WHERE id = ? LIMIT 1', [myId])) as any;
    if (!me) { res.json({ radars: [], events: [] }); return; }
    const myLat = me.lat != null ? Number(me.lat) : null;
    const myLon = me.lon != null ? Number(me.lon) : null;
    const myCityNorm = normalizeRadarText(me.city);
    const myStateNorm = normalizeRadarText(me.state);
    const now = nowIso();

    // Radares compatíveis já entregues a mim (deduzido pelo fan-out do radar)
    const radarRows = (await queryAll(
      db,
      `SELECT rb.id, rb.message, rb.city, rb.state, rb.city_lat, rb.city_lon, rb.is_anonymous, rb.created_at, rb.expires_at,
              u.name AS sender_name, u.avatar AS sender_avatar
       FROM radar_broadcast_views v
       JOIN radar_broadcasts rb ON rb.id = v.broadcast_id
       JOIN users u ON u.id = rb.user_id
       WHERE v.viewer_user_id = ? AND rb.deactivated_at IS NULL AND rb.expires_at > ?
         AND (u.is_banned = 0 OR u.is_banned IS NULL) AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       ORDER BY rb.created_at DESC LIMIT 20`,
      [myId, now]
    )) as any[];

    const radars = radarRows.map((r: any) => {
      const anon = Number(r.is_anonymous || 0) === 1;
      const rLat = r.city_lat != null ? Number(r.city_lat) : null;
      const rLon = r.city_lon != null ? Number(r.city_lon) : null;
      const distanceKm = (myLat !== null && myLon !== null && rLat !== null && rLon !== null)
        ? roundDistanceKm(haversineKm({ lat: myLat, lon: myLon }, { lat: rLat, lon: rLon }))
        : null;
      return {
        id: String(r.id),
        message: String(r.message || ''),
        senderName: anon ? 'Perfil discreto' : String(r.sender_name || 'Alguém'),
        senderAvatar: anon ? null : (r.sender_avatar ?? null),
        city: r.city ?? null,
        state: r.state ?? null,
        distanceKm,
        createdAt: String(r.created_at || ''),
        expiresAt: String(r.expires_at || ''),
      };
    });

    // Eventos compatíveis (futuros, público-alvo e localização)
    const sinceIso = new Date(Date.now() - 60 * 86400000).toISOString();
    const eventRows = (await queryAll(
      db,
      `SELECT e.id, e.payload_json, e.created_at, u.name AS creator_name, u.avatar AS creator_avatar
       FROM events e JOIN users u ON u.id = e.user_id
       WHERE e.user_id != ? AND e.created_at >= ?
         AND (u.is_banned = 0 OR u.is_banned IS NULL) AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
       ORDER BY e.created_at DESC LIMIT 150`,
      [myId, sinceIso]
    )) as any[];

    const today = new Date().toISOString().slice(0, 10);
    const myAudience = mapUserGenderToRadarAudience(me.gender ?? null);
    const events: any[] = [];
    for (const er of eventRows) {
      const p = (safeJsonParse(er.payload_json) ?? {}) as any;
      const date = String(p.date || '');
      if (date && date < today) continue; // evento já passou
      const target = Array.isArray(p?.notificationSettings?.targetGender) ? (p.notificationSettings.targetGender as string[]) : ['all'];
      if (!target.includes('all') && (!myAudience || !target.includes(myAudience))) continue;
      const locNorm = normalizeRadarText(String(p.location || ''));
      const cityMatch = !!myCityNorm && locNorm.includes(myCityNorm);
      const stateMatch = !!myStateNorm && locNorm.includes(myStateNorm);
      if (!cityMatch && !stateMatch) continue;
      events.push({
        id: String(er.id),
        title: String(p.title || 'Evento'),
        location: String(p.location || ''),
        date,
        coverImage: p.coverImage ?? p.image ?? null,
        createdBy: String(er.creator_name || ''),
        creatorAvatar: er.creator_avatar ?? null,
      });
      if (events.length >= 20) break;
    }

    res.json({ radars, events });
  });

  app.get('/api/admin/photos', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    const rows = await queryAll(
      db,
      `
      SELECT m.id, m.filename, m.created_at, m.is_private, u.id as user_id, u.name as user_name
      FROM media m
      JOIN users u ON u.id = m.user_id
      WHERE m.mime_type LIKE 'image/%'
        AND (m.source IS NULL OR m.source != 'chat')
      ORDER BY m.created_at DESC
      LIMIT 50
    `
    );
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        url: Number(r.is_private || 0) === 1
          ? `/private-uploads/${r.id}?token=${encodeURIComponent(jwt.sign({ mediaId: String(r.id) }, env.JWT_SECRET, { expiresIn: '30m' }))}`
          : `/uploads/${r.filename}`,
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

  app.delete('/api/admin/photos/:photoId', requireAuth(env, db), requireAdmin(), async (req, res) => {
    const photoId = String(req.params.photoId || '');
    if (!photoId) {
      res.status(400).json({ error: 'invalid_input' });
      return;
    }
    const media = await deleteStoredMedia(photoId);
    if (!media) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({ ok: true, id: photoId });
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
        isDeactivated: Number(row.is_deactivated || 0) === 1,
        deactivatedAt: row.deactivated_at ?? null,
        deactivatedByAdmin: Number(row.deactivated_by_admin || 0) === 1,
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
      const adminId = req.auth!.userId;
      const target = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId]);
      if (!target) { res.status(404).json({ error: 'not_found' }); return; }
      await banUserEverywhere(db, userId, adminId);
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

  app.put('/api/admin/users/:userId/deactivate', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { userId } = req.params;
      const adminId = req.auth!.userId;
      const target = (await queryOne(db, 'SELECT id, is_admin FROM users WHERE id = ?', [userId])) as any;
      if (!target) { res.status(404).json({ error: 'not_found' }); return; }
      if (String(target.id) === adminId) { res.status(400).json({ error: 'cannot_deactivate_self' }); return; }
      if (Number(target.is_admin || 0) === 1) { res.status(400).json({ error: 'cannot_deactivate_admin' }); return; }
      await run(
        db,
        'UPDATE users SET is_deactivated = 1, deactivated_at = ?, deactivated_by_admin = 1, deactivated_by = ? WHERE id = ?',
        [nowIso(), adminId, userId]
      );
      await persist();
      res.json({ ok: true, userId, deactivated: true });
    } catch (err) {
      console.error('[admin/users/deactivate]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.put('/api/admin/users/:userId/reactivate', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { userId } = req.params;
      const target = await queryOne(db, 'SELECT id FROM users WHERE id = ?', [userId]);
      if (!target) { res.status(404).json({ error: 'not_found' }); return; }
      await run(
        db,
        'UPDATE users SET is_deactivated = 0, deactivated_at = NULL, deactivated_by_admin = 0, deactivated_by = NULL WHERE id = ?',
        [userId]
      );
      await persist();
      res.json({ ok: true, userId, deactivated: false });
    } catch (err) {
      console.error('[admin/users/reactivate]', err);
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
    try {
      const processMemory = process.memoryUsage();
      const systemTotal = totalmem();
      const systemFree = freemem();
      const systemUsed = Math.max(0, systemTotal - systemFree);
      const rss = Number(processMemory.rss || 0);
      const cpuCount = Math.max(1, cpus().length);
      const currentLoad = loadavg();

      const toMb = (value: number) => Math.round((value / 1024 / 1024) * 100) / 100;
      const toGb = (value: number) => Math.round((value / 1024 / 1024 / 1024) * 100) / 100;
      const toPct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 10000) / 100 : 0);
      const clampPct = (value: number) => Math.max(0, Math.min(100, Math.round(value * 100) / 100));
      const cpuUsagePercent = clampPct((Number(currentLoad[0] || 0) / cpuCount) * 100);
      const asNumber = (value: number | bigint | undefined | null) => typeof value === 'bigint' ? Number(value) : Number(value || 0);
      const diskStats = statfsSync(backendRootDir);
      const diskBlockSize = asNumber((diskStats as any).bsize || (diskStats as any).frsize || 0);
      const diskAvailableBlocks = asNumber((diskStats as any).bavail ?? (diskStats as any).bfree ?? 0);
      const diskTotalBlocks = asNumber((diskStats as any).blocks || 0);
      const diskTotalBytes = diskBlockSize > 0 ? diskBlockSize * diskTotalBlocks : 0;
      const diskFreeBytes = diskBlockSize > 0 ? diskBlockSize * diskAvailableBlocks : 0;
      const diskUsedBytes = Math.max(0, diskTotalBytes - diskFreeBytes);

      res.json({
        checkedAt: nowIso(),
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSec: Math.round(process.uptime()),
        cpu: {
          count: cpuCount,
          loadAvg1m: Number(Number(currentLoad[0] || 0).toFixed(2)),
          loadAvg5m: Number(Number(currentLoad[1] || 0).toFixed(2)),
          loadAvg15m: Number(Number(currentLoad[2] || 0).toFixed(2)),
          usagePercent: cpuUsagePercent,
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
        disk: {
          totalGb: toGb(diskTotalBytes),
          freeGb: toGb(diskFreeBytes),
          usedGb: toGb(diskUsedBytes),
          usagePercent: toPct(diskUsedBytes, diskTotalBytes),
        },
      });
    } catch (error) {
      console.error('[admin/resources-status]', error);
      res.status(500).json({ error: 'resources_unavailable' });
    }
  });

  app.get('/api/admin/finance/summary', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    try {
      const oneDayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [subscribersRow, newTodayRow, licensedRow] = await Promise.all([
        queryOne(db, 'SELECT COUNT(*) as c FROM users WHERE is_premium = 1') as Promise<any>,
        queryOne(db, 'SELECT COUNT(*) as c FROM users WHERE created_at >= ?', [oneDayAgoIso]) as Promise<any>,
        queryOne(db, "SELECT COUNT(*) as c FROM users WHERE hub_access_status = 'licensed'") as Promise<any>,
      ]);

      let revenue = 0;
      if (shouldUseHubBilling(env)) {
        try {
          const hubConfig = getHubConfig(env);
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('HubBilling timeout')), 5000)
          );
          const plans = await Promise.race([listHubPlans(hubConfig), timeout]);
          const activePlan = plans.find((p) => p.isActive && p.status === 'active') ?? plans[0];
          if (activePlan) {
            const licensedCount = Number(licensedRow?.c || 0);
            revenue = (activePlan.amount / 100) * licensedCount;
          }
        } catch (hubErr) {
          console.warn('[admin/finance/summary] Could not fetch hub plans:', (hubErr as Error).message);
        }
      }

      res.json({
        revenue,
        subscribers: Number(subscribersRow?.c || 0),
        newToday: Number(newTodayRow?.c || 0),
        churnRate: 0,
      });
    } catch (error) {
      console.error('[admin/finance/summary]', error);
      res.status(500).json({ error: 'finance_summary_unavailable' });
    }
  });

  // Abandono de PIX: dos usuários que geraram um checkout, quantos NÃO viraram
  // assinantes. Métrica vale a partir do deploy da tabela checkout_generations —
  // gerações anteriores não existem. Carência de 24h: só conta como abandono quem
  // gerou há mais de 24h (quem gerou agora ainda pode estar pagando). Conversão é
  // derivada do estado atual do usuário (is_premium / licensed), não do webhook.
  app.get('/api/admin/finance/pix-abandonment', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    try {
      const graceCutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Usuários distintos que geraram PIX antes da carência (elegíveis à métrica).
      const eligibleRow = (await queryOne(
        db,
        'SELECT COUNT(DISTINCT user_id) as c FROM checkout_generations WHERE user_id IS NOT NULL AND created_at <= ?',
        [graceCutoffIso]
      )) as any;
      // Desses, quantos converteram (hoje são premium ou licenciados).
      const convertedRow = (await queryOne(
        db,
        `SELECT COUNT(DISTINCT cg.user_id) as c
           FROM checkout_generations cg
           JOIN users u ON u.id = cg.user_id
          WHERE cg.created_at <= ?
            AND (u.is_premium = 1 OR u.hub_access_status = 'licensed')`,
        [graceCutoffIso]
      )) as any;
      // Total de gerações (tentativas), incluindo repetições do mesmo usuário.
      const totalGenRow = (await queryOne(db, 'SELECT COUNT(*) as c FROM checkout_generations')) as any;

      const eligibleUsers = Number(eligibleRow?.c || 0);
      const convertedUsers = Number(convertedRow?.c || 0);
      const abandonedUsers = Math.max(0, eligibleUsers - convertedUsers);
      const abandonmentRate = eligibleUsers > 0 ? Math.round((abandonedUsers / eligibleUsers) * 1000) / 10 : 0;

      res.json({
        eligibleUsers,
        convertedUsers,
        abandonedUsers,
        abandonmentRate,
        totalGenerations: Number(totalGenRow?.c || 0),
        graceHours: 24,
      });
    } catch (error) {
      console.error('[admin/finance/pix-abandonment]', error);
      res.status(500).json({ error: 'pix_abandonment_unavailable' });
    }
  });

  // Relatório de receita recorrente (MRR): histórico + projeção 12 meses.
  // Sem ledger de pagamentos: MRR real é registrado mês a mês a partir de agora
  // (revenue_snapshots); meses anteriores são ESTIMADOS pela data de cadastro dos
  // assinantes atuais. A projeção usa o crescimento médio mês a mês.
  app.get('/api/admin/finance/revenue-report', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    try {
      // 1. Preço do plano (HubBilling se disponível, senão fallback R$9,90)
      let priceCents = 990;
      if (shouldUseHubBilling(env)) {
        try {
          const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
          const plans = await Promise.race([listHubPlans(getHubConfig(env)), timeout]);
          const activePlan = plans.find((p) => p.isActive && p.status === 'active') ?? plans[0];
          if (activePlan?.amount) priceCents = Number(activePlan.amount);
        } catch (e) {
          console.warn('[revenue-report] hub plans indisponível, usando fallback:', (e as Error).message);
        }
      }

      // 2. Assinantes atuais e suas datas de cadastro (proxy do histórico)
      const subs = (await queryAll(
        db,
        "SELECT created_at FROM users WHERE (hub_access_status = 'licensed' OR is_premium = 1) AND (is_banned = 0 OR is_banned IS NULL) AND (is_deactivated = 0 OR is_deactivated IS NULL)"
      )) as any[];
      const createdTimes = subs
        .map((s) => new Date(String(s.created_at)).getTime())
        .filter((t) => !Number.isNaN(t));
      const payingNow = createdTimes.length;
      const currentMrrCents = payingNow * priceCents;

      // 3. Registra/atualiza o snapshot real do mês atual
      const currentMonth = nowIso().slice(0, 7);
      await run(
        db,
        `INSERT INTO revenue_snapshots (month, mrr_cents, paying_users, captured_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET mrr_cents = excluded.mrr_cents, paying_users = excluded.paying_users, captured_at = excluded.captured_at`,
        [currentMonth, currentMrrCents, payingNow, nowIso()]
      );
      await db.persist();

      // Snapshots reais existentes (mês -> dados)
      const snapRows = (await queryAll(db, 'SELECT month, mrr_cents, paying_users FROM revenue_snapshots', [])) as any[];
      const snapByMonth = new Map<string, { mrrCents: number; payingUsers: number }>();
      for (const r of snapRows) snapByMonth.set(String(r.month), { mrrCents: Number(r.mrr_cents || 0), payingUsers: Number(r.paying_users || 0) });

      // 4. Histórico dos últimos 12 meses
      const monthOffset = (off: number) => {
        const d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + off);
        return d.toISOString().slice(0, 7);
      };
      const startOfNextMonthMs = (monthStr: string) => {
        const [y, m] = monthStr.split('-').map(Number);
        const ny = m === 12 ? y + 1 : y;
        const nm = m === 12 ? 1 : m + 1;
        return Date.UTC(ny, nm - 1, 1);
      };

      const history: Array<{ month: string; mrrCents: number; payingUsers: number; estimated: boolean }> = [];
      for (let i = 11; i >= 0; i--) {
        const month = monthOffset(-i);
        const snap = snapByMonth.get(month);
        if (snap) {
          history.push({ month, mrrCents: snap.mrrCents, payingUsers: snap.payingUsers, estimated: false });
        } else {
          const boundary = startOfNextMonthMs(month);
          const estPaying = createdTimes.filter((t) => t < boundary).length;
          history.push({ month, mrrCents: estPaying * priceCents, payingUsers: estPaying, estimated: true });
        }
      }

      // 5. Crescimento médio mês a mês (últimos meses com base > 0), limitado
      const growths: number[] = [];
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1].mrrCents;
        const cur = history[i].mrrCents;
        if (prev > 0) growths.push(cur / prev - 1);
      }
      const recent = growths.slice(-6);
      let growthRate = recent.length > 0 ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
      growthRate = Math.max(-0.5, Math.min(1, growthRate));

      // 6. Projeção dos próximos 12 meses
      const projection: Array<{ month: string; mrrCents: number }> = [];
      let running = currentMrrCents;
      for (let i = 1; i <= 12; i++) {
        running = Math.round(running * (1 + growthRate));
        projection.push({ month: monthOffset(i), mrrCents: running });
      }

      const projected12mCents = projection.length > 0 ? projection[projection.length - 1].mrrCents : currentMrrCents;

      res.json({
        currency: 'BRL',
        planPriceCents: priceCents,
        payingUsers: payingNow,
        currentMrrCents,
        arrCents: currentMrrCents * 12,
        growthRate,
        projected12mCents,
        history,
        projection,
        historyIsEstimated: history.some((h) => h.estimated),
      });
    } catch (error) {
      console.error('[admin/finance/revenue-report]', error);
      res.status(500).json({ error: 'revenue_report_unavailable' });
    }
  });

  app.get('/api/admin/analytics/visits', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const requestedLimit = Number(req.query.limit || 120);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 20), 500)
        : 120;
      const requestedCityUsersPeriodDays = Number(req.query.cityUsersPeriodDays || 0);
      const cityUsersPeriodDays = [30, 90, 365].includes(requestedCityUsersPeriodDays)
        ? requestedCityUsersPeriodDays
        : null;
      const cityUsersFromIso = cityUsersPeriodDays
        ? new Date(Date.now() - cityUsersPeriodDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      // Período opcional para "Acessos por região" e "Acessos por cidade".
      const requestedAccessPeriodDays = Number(req.query.accessPeriodDays || 0);
      const accessPeriodDays = [7, 30, 90, 365].includes(requestedAccessPeriodDays)
        ? requestedAccessPeriodDays
        : null;
      const accessFromIso = accessPeriodDays
        ? new Date(Date.now() - accessPeriodDays * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const accessWhere = accessFromIso ? 'WHERE sv.created_at >= ?' : '';
      const accessParams = accessFromIso ? [accessFromIso] : [];
      const todayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const sevenDaysAgoIso  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenDaysAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      // Crescimento de cidades usa o período selecionado (30/90/365) ou 30 dias por padrão
      const growthPeriodDays = cityUsersPeriodDays || 30;
      const growthFromIso = cityUsersFromIso || thirtyDaysAgoIso;

      const presence = req.app.get('presence') as undefined | { countOnline?: () => number };

      // created_at é texto ISO em UTC. Para "hora/dia local" (horário de Brasília,
      // UTC-3) nos gráficos de pico e de únicos por dia, convertemos por dialeto.
      const localHourExpr = db.mode === 'pg'
        ? `EXTRACT(HOUR FROM (sv.created_at)::timestamptz AT TIME ZONE 'America/Sao_Paulo')::int`
        : `CAST(strftime('%H', datetime(sv.created_at, '-3 hours')) AS INTEGER)`;
      const localDayExpr = db.mode === 'pg'
        ? `to_char((sv.created_at)::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`
        : `strftime('%Y-%m-%d', datetime(sv.created_at, '-3 hours'))`;
      // Identificador de usuário único: prioriza user_id, depois ip_hash, senão a visita.
      const uniqueUserExpr = `COUNT(DISTINCT COALESCE(NULLIF(sv.user_id, ''), NULLIF(sv.ip_hash, ''), sv.id))`;

      const [totalRow, todayRow, last7DaysRow, uniqueTodayRow, uniqueLastHourRow, rows, dailyRows, regionRows, cityAccessRows, topUsersRows, topCitiesRows, totalUsersByCityRow, deviceRows, hourlyRows, newUsersByDayRows, cityGrowthRows, uniqueByDayRows] = await Promise.all([
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
        queryOne(
          db,
          `SELECT COUNT(DISTINCT COALESCE(NULLIF(user_id, ''), NULLIF(ip_hash, ''), id)) as c
           FROM site_visits
           WHERE created_at >= ?`,
          [oneHourAgoIso]
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
           ${accessWhere}
           GROUP BY region_label
           ORDER BY c DESC
           LIMIT 10`,
          accessParams
        ),
        queryAll(
          db,
          `SELECT
             CASE
               WHEN TRIM(COALESCE(u.city, '')) <> '' AND TRIM(COALESCE(u.state, '')) <> '' THEN TRIM(COALESCE(u.city, '')) || ', ' || UPPER(TRIM(COALESCE(u.state, '')))
               WHEN TRIM(COALESCE(u.city, '')) <> '' THEN TRIM(COALESCE(u.city, ''))
               WHEN TRIM(COALESCE(sv.country, '')) <> '' THEN TRIM(COALESCE(sv.country, ''))
               ELSE 'Não informado'
             END AS city_label,
             COUNT(*) AS c
           FROM site_visits sv
           LEFT JOIN users u ON u.id = sv.user_id
           ${accessWhere}
           GROUP BY city_label
           ORDER BY c DESC
           LIMIT 20`,
          accessParams
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
        // Top cidades por usuários — cidade+UF crus; normalização no JS
        queryAll(
          db,
          `SELECT TRIM(COALESCE(u.city, '')) AS city,
                  UPPER(TRIM(COALESCE(u.state, ''))) AS uf,
                  COUNT(*) AS c
           FROM users u
           WHERE (u.is_admin = 0 OR u.is_admin IS NULL)
             ${cityUsersFromIso ? 'AND u.created_at >= ?' : ''}
           GROUP BY TRIM(COALESCE(u.city, '')), UPPER(TRIM(COALESCE(u.state, '')))`,
          cityUsersFromIso ? [cityUsersFromIso] : []
        ),
        queryOne(
          db,
          `SELECT COUNT(*) as c
           FROM users u
           WHERE (u.is_admin = 0 OR u.is_admin IS NULL)
             ${cityUsersFromIso ? 'AND u.created_at >= ?' : ''}`,
          cityUsersFromIso ? [cityUsersFromIso] : []
        ),
        queryAll(
          db,
          `SELECT COALESCE(NULLIF(TRIM(device_type), ''), 'desktop') AS device_label, COUNT(*) AS c
           FROM site_visits
           GROUP BY device_label
           ORDER BY c DESC`
        ),
        // Usuários únicos por (dia local, hora local) nos últimos 30 dias. Depois,
        // no JS, tiramos a média por hora (soma ÷ nº de dias) para saber quantos
        // únicos ficavam online em média a cada hora — o horário de pico.
        queryAll(
          db,
          `SELECT ${localHourExpr} AS hour_num,
                  ${localDayExpr} AS day,
                  ${uniqueUserExpr} AS cnt
           FROM site_visits sv
           WHERE sv.created_at >= ? AND LENGTH(sv.created_at) >= 13
           GROUP BY hour_num, day`,
          [thirtyDaysAgoIso]
        ),
        // Novos cadastros por dia (últimos 30 dias)
        queryAll(
          db,
          `SELECT SUBSTR(u.created_at, 1, 10) AS reg_day, COUNT(*) AS c
           FROM users u
           WHERE u.created_at >= ? AND (u.is_admin = 0 OR u.is_admin IS NULL)
           GROUP BY SUBSTR(u.created_at, 1, 10)
           ORDER BY 1 ASC`,
          [thirtyDaysAgoIso]
        ),
        // Crescimento de cidades: novos no período vs total da cidade.
        // Agrupado por cidade+UF crus; a normalização (unir "São Luís" e
        // "São Luís, MA") e o cálculo da taxa são feitos no JS abaixo.
        queryAll(
          db,
          `SELECT TRIM(COALESCE(u.city, '')) AS city,
                  UPPER(TRIM(COALESCE(u.state, ''))) AS uf,
                  SUM(CASE WHEN u.created_at >= ? THEN 1 ELSE 0 END) AS novos,
                  COUNT(*) AS total
           FROM users u
           WHERE (u.is_admin = 0 OR u.is_admin IS NULL)
             AND TRIM(COALESCE(u.city, '')) != ''
           GROUP BY TRIM(COALESCE(u.city, '')), UPPER(TRIM(COALESCE(u.state, '')))`,
          [growthFromIso]
        ),
        // Usuários únicos que acessaram por dia (local), últimos 30 dias.
        queryAll(
          db,
          `SELECT ${localDayExpr} AS day, ${uniqueUserExpr} AS c
           FROM site_visits sv
           WHERE sv.created_at >= ? AND LENGTH(sv.created_at) >= 13
           GROUP BY day
           ORDER BY day ASC`,
          [thirtyDaysAgoIso]
        ),
      ]);

      // Diagnóstico temporário: confirma no log do servidor se a query de
      // tráfego por hora está retornando dados (remover depois de confirmado).
      if (!Array.isArray(hourlyRows) || hourlyRows.length === 0) {
        console.warn('[admin/analytics/visits] hourlyRows veio vazio', {
          sevenDaysAgoIso,
          sampleCreatedAt: (rows as any[])[0]?.created_at ?? null,
        });
      } else {
        console.log('[admin/analytics/visits] hourlyRows amostra', (hourlyRows as any[]).slice(0, 3));
      }

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

      const totalUsersByCity = Number((totalUsersByCityRow as any)?.c || 0);
      const totalVisits = Number((totalRow as any)?.c || 0);
      // Média de usuários únicos por hora: soma dos únicos/dia ÷ 30 (janela fixa).
      const hourSum = new Array(24).fill(0);
      for (const r of hourlyRows as any[]) {
        const h = Number(r.hour_num);
        if (!Number.isInteger(h) || h < 0 || h > 23) continue;
        hourSum[h] += Number(r.cnt || 0);
      }
      const HOUR_AVG_DAYS = 30;
      const byHourFinal = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: Math.round((hourSum[h] / HOUR_AVG_DAYS) * 10) / 10, // média de únicos por hora
      }));
      res.json({
        total: totalVisits,
        today: Number((todayRow as any)?.c || 0),
        last7Days: Number((last7DaysRow as any)?.c || 0),
        uniqueToday: Number((uniqueTodayRow as any)?.c || 0),
        uniqueLastHour: Number((uniqueLastHourRow as any)?.c || 0),
        onlineNow: presence?.countOnline ? Number(presence.countOnline()) : 0,
        byDay: (dailyRows as any[]).map((row: any) => ({
          label: String(row.day || ''),
          count: Number(row.c || 0),
        })),
        // Acessos por dia da semana (soma dos últimos 30 dias, derivado do mesmo
        // dailyRows já buscado acima — sem query nova, sem risco de dialeto SQL).
        byWeekday: (() => {
          const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
          const totals = new Array(7).fill(0);
          for (const row of dailyRows as any[]) {
            const day = String(row.day || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
            const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
            totals[weekday] += Number(row.c || 0);
          }
          return WEEKDAY_LABELS.map((label, weekday) => ({ weekday, label, count: totals[weekday] }));
        })(),
        byRegion: (regionRows as any[]).map((row: any) => ({
          label: String(row.region_label || 'Desconhecido'),
          count: Number(row.c || 0),
        })),
        byAccessCity: (cityAccessRows as any[]).map((row: any) => ({
          label: String(row.city_label || 'Não informado'),
          count: Number(row.c || 0),
        })),
        byUserCity: (() => {
          // Agrupa por cidade normalizada, unindo variações com/sem UF
          const cityMap = new Map<string, { city: string; ufCounts: Map<string, number>; count: number }>();
          for (const row of (topCitiesRows as any[])) {
            const cityRaw = String(row.city || '').trim();
            const uf = String(row.uf || '').trim();
            const count = Number(row.c || 0);
            const key = cityRaw ? cityRaw.toLowerCase() : '__none__';
            let entry = cityMap.get(key);
            if (!entry) { entry = { city: cityRaw, ufCounts: new Map(), count: 0 }; cityMap.set(key, entry); }
            entry.count += count;
            if (cityRaw && uf) entry.ufCounts.set(uf, (entry.ufCounts.get(uf) || 0) + count);
          }
          return Array.from(cityMap.values())
            // Mantém "Não informado" (cidade vazia), mas remove nomes inválidos de 1-2 letras
            .filter((e) => e.city === '' || e.city.trim().length >= 3)
            .map((e) => {
              let topUf = ''; let maxC = 0;
              for (const [uf, c] of e.ufCounts) { if (c > maxC) { maxC = c; topUf = uf; } }
              const label = !e.city ? 'Não informado' : (topUf ? `${e.city}, ${topUf}` : e.city);
              return {
                label,
                count: e.count,
                percentage: totalUsersByCity > 0 ? Number(((e.count / totalUsersByCity) * 100).toFixed(2)) : 0,
              };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 20);
        })(),
        byDevice: (deviceRows as any[]).map((row: any) => {
          const count = Number(row.c || 0);
          const rawLabel = String(row.device_label || 'desktop').toLowerCase();
          const label = rawLabel === 'mobile'
            ? 'mobile'
            : rawLabel === 'tablet'
              ? 'tablet'
              : 'desktop';
          return {
            label,
            count,
            percentage: totalVisits > 0 ? Number(((count / totalVisits) * 100).toFixed(2)) : 0,
          };
        }),
        cityUsersTotal: totalUsersByCity,
        cityUsersPeriodDays,
        accessPeriodDays,
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
        byHour: byHourFinal,
        // Usuários únicos que acessaram por dia (local), últimos 30 dias.
        uniqueUsersByDay: (uniqueByDayRows as any[]).map((row: any) => ({
          label: String(row.day || ''),
          count: Number(row.c || 0),
        })),
        newUsersByDay: (newUsersByDayRows as any[]).map((row: any) => ({
          label: String(row.reg_day || ''),
          count: Number(row.c || 0),
        })),
        growthPeriodDays,
        growingCities: (() => {
          const MIN_USERS = 5; // ignora cidades minúsculas
          // Agrupa por cidade normalizada (lowercase), unindo variações com/sem UF
          const cityMap = new Map<string, { city: string; ufCounts: Map<string, number>; novos: number; total: number }>();
          for (const row of (cityGrowthRows as any[])) {
            const cityRaw = String(row.city || '').trim();
            if (!cityRaw) continue;
            const key = cityRaw.toLowerCase();
            const uf = String(row.uf || '').trim();
            const novos = Number(row.novos || 0);
            const total = Number(row.total || 0);
            let entry = cityMap.get(key);
            if (!entry) { entry = { city: cityRaw, ufCounts: new Map(), novos: 0, total: 0 }; cityMap.set(key, entry); }
            entry.novos += novos;
            entry.total += total;
            if (uf) entry.ufCounts.set(uf, (entry.ufCounts.get(uf) || 0) + total);
          }
          return Array.from(cityMap.values())
            // Ignora nomes inválidos (1-2 letras) — não há município brasileiro tão curto
            .filter((e) => e.city.trim().length >= 3 && e.total >= MIN_USERS && e.novos > 0)
            .map((e) => {
              // UF predominante para o rótulo
              let topUf = ''; let maxC = 0;
              for (const [uf, c] of e.ufCounts) { if (c > maxC) { maxC = c; topUf = uf; } }
              const label = topUf ? `${e.city}, ${topUf}` : e.city;
              // Taxa: % dos usuários da cidade que entraram no período
              const growth = Math.round((e.novos / e.total) * 100);
              return { label, novos: e.novos, total: e.total, growth };
            })
            // Ordena pelo NÚMERO de novos cadastros nos últimos 30 dias (taxa só desempata)
            .sort((x, y) => y.novos - x.novos || y.growth - x.growth)
            .slice(0, 30);
        })(),
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
      const reporterId = req.auth!.userId;
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
      const adminId = req.auth!.userId;
      const io = req.app.get('io') as SocketIOServer | undefined;
      const action = ['ban', 'warn', 'remove_content', 'dismiss'].includes(String(req.body?.action))
        ? String(req.body.action)
        : 'dismiss';
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';

      const report = (await queryOne(
        db,
        'SELECT id, target_type, target_id, reporter_user_id FROM reports WHERE id = ?',
        [reportId]
      )) as any;
      if (!report) { res.status(404).json({ error: 'not_found' }); return; }

      const targetType = String(report.target_type);
      const targetId = String(report.target_id);
      const reporterId = report.reporter_user_id ? String(report.reporter_user_id) : null;

      // Resolve o autor do perfil/conteúdo denunciado
      let ownerId: string | null = null;
      if (targetType === 'user') ownerId = targetId;
      else if (targetType === 'post') ownerId = (((await queryOne(db, 'SELECT user_id FROM posts WHERE id = ?', [targetId])) as any)?.user_id) ?? null;
      else if (targetType === 'photo') ownerId = (((await queryOne(db, 'SELECT user_id FROM media WHERE id = ?', [targetId])) as any)?.user_id) ?? null;
      else if (targetType === 'message') ownerId = (((await queryOne(db, 'SELECT sender_id FROM messages WHERE id = ?', [targetId])) as any)?.sender_id) ?? null;
      ownerId = ownerId ? String(ownerId) : null;

      const notify = async (userId: string | null, type: string, title: string, description: string) => {
        if (!userId) return;
        try {
          await createNotification({ db, io }, { userId, type, title, description, dataJson: { reportId, action } });
          await sendPushToUser({ db, env }, { userId, payload: { title, body: description, url: '/notifications', tag: `${type}:${reportId}` } });
        } catch (err) {
          console.error('[admin/reports/resolve] notify failed', err);
        }
      };

      const emailOpts = {
        apiKey: env.RESEND_API_KEY,
        fromEmail: env.RESEND_FROM_EMAIL,
        appName: env.APP_NAME || 'NoSigilo',
        siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net',
      };
      const emailUser = async (userId: string | null, subject: string, heading: string, lines: string[]) => {
        if (!userId) return;
        try {
          const u = (await queryOne(db, 'SELECT email, name FROM users WHERE id = ?', [userId])) as any;
          if (u?.email) {
            await sendModerationEmail(emailOpts, { to: String(u.email), userName: u.name, subject, heading, lines });
          }
        } catch (err) {
          console.error('[admin/reports/resolve] e-mail de moderação falhou', err);
        }
      };

      // Executa a ação de moderação
      if (action === 'ban' && ownerId) {
        await banUserEverywhere(db, ownerId, adminId);
        // Bloqueia o pHash de todas as imagens do banido — impede que as MESMAS fotos
        // (ex.: uso indevido de imagem) sejam reenviadas, mesmo por uma conta nova.
        await blockUserMediaHashes(ownerId, `ban:${reportId}`, adminId);
        // Banido não recebe notificação in-app (perde acesso), mas recebe um e-mail
        // informando a decisão — exceção transacional à regra de não enviar a banidos.
        await emailUser(ownerId, `${emailOpts.appName}: sua conta foi banida`, 'Sua conta foi banida', [
          note || 'Após análise de uma denúncia, sua conta foi banida por violar as regras da comunidade.',
          'O acesso à plataforma foi encerrado. Se você acredita que houve um engano, responda este e-mail para falar com a moderação.',
        ]);
      } else if (action === 'warn') {
        const warnMsg = note || 'Um conteúdo seu foi reportado e analisado pela moderação. Reveja as regras da comunidade para evitar uma suspensão.';
        await notify(ownerId, 'moderation.warning', 'Você recebeu uma advertência', warnMsg);
        await emailUser(ownerId, `${emailOpts.appName}: você recebeu uma advertência`, 'Você recebeu uma advertência', [
          warnMsg,
          'Reveja as diretrizes da comunidade. Novas violações podem levar à suspensão da conta.',
        ]);
      } else if (action === 'remove_content') {
        if (targetType === 'post') {
          await run(db, 'DELETE FROM likes WHERE target_type = ? AND target_id = ?', ['post', targetId]);
          await run(db, 'DELETE FROM comments WHERE target_type = ? AND target_id = ?', ['post', targetId]);
          await run(db, 'DELETE FROM posts WHERE id = ?', [targetId]);
        } else if (targetType === 'photo') {
          // Bloqueia o pHash ANTES de apagar o arquivo (depois ele não existe mais).
          await blockMediaHashByMediaId(targetId, `removed:${reportId}`, adminId);
          await deleteStoredMedia(targetId);
        } else if (targetType === 'message') {
          await run(db, 'UPDATE messages SET deleted_for_all = 1, content = NULL, media_id = NULL WHERE id = ?', [targetId]);
        }
        const removeMsg = note || 'Um conteúdo seu foi removido por violar as regras da comunidade.';
        await notify(ownerId, 'moderation.content_removed', 'Conteúdo removido', removeMsg);
        await emailUser(ownerId, `${emailOpts.appName}: um conteúdo seu foi removido`, 'Conteúdo removido', [
          removeMsg,
          'Reveja as diretrizes da comunidade para evitar advertências ou suspensão.',
        ]);
      }
      // dismiss: apenas resolve a denúncia (improcedente)

      await run(
        db,
        'UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ?, resolution_action = ? WHERE id = ?',
        ['resolved', adminId, nowIso(), action, reportId]
      );

      // Notifica o denunciante sobre o desfecho (sem expor a ação detalhada nem o denunciado)
      if (reporterId && reporterId !== ownerId) {
        const outcome = action === 'dismiss'
          ? 'Analisamos sua denúncia e, desta vez, não identificamos violação das regras. Obrigado por ajudar a manter a comunidade segura.'
          : 'Analisamos sua denúncia e tomamos as medidas necessárias. Obrigado por ajudar a manter a comunidade segura.';
        await notify(reporterId, 'report.reviewed', 'Sua denúncia foi analisada', outcome);

        // No banimento, também envia e-mail ao denunciante — preservando o sigilo
        // total da identidade dele (o perfil banido nunca sabe quem denunciou).
        if (action === 'ban') {
          await emailUser(reporterId, `${emailOpts.appName}: sua denúncia foi analisada`, 'Tomamos as medidas necessárias', [
            'Analisamos a denúncia que você enviou e o perfil foi banido da plataforma.',
            'Sua identidade é mantida em total sigilo: o perfil denunciado não tem como saber que a denúncia partiu de você. Obrigado por ajudar a manter a comunidade segura.',
          ]);
        }
      }

      await persist();
      res.json({ id: reportId, status: 'resolved', action });
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

  // ─── Admin: Referral Stats ────────────────────────────────────────────────
  app.get('/api/admin/referral-stats', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    try {
      // Overall counts by validation status
      const statusCounts = (await queryAll(
        db,
        `SELECT validation_status, COUNT(*) AS cnt
         FROM invite_link_entries
         GROUP BY validation_status`,
        []
      )) as any[];

      // Tier reward grants summary
      const tierStats = (await queryAll(
        db,
        `SELECT reward_type, COUNT(*) AS cnt, SUM(premium_days_granted) AS total_days,
                MIN(valid_invites_count) AS min_invites
         FROM referral_rewards
         GROUP BY reward_type
         ORDER BY min_invites ASC`,
        []
      )) as any[];

      // Top 20 inviters by validated count
      const topInviters = (await queryAll(
        db,
        `SELECT il.inviter_user_id,
                u.name AS inviter_name,
                u.avatar AS inviter_avatar,
                COUNT(*) AS validated_count
         FROM invite_link_entries ile
         JOIN invite_links il ON il.id = ile.invite_link_id
         JOIN users u ON u.id = il.inviter_user_id
         WHERE ile.validation_status = 'validated'
         GROUP BY il.inviter_user_id, u.name, u.avatar
         ORDER BY validated_count DESC
         LIMIT 20`,
        []
      )) as any[];

      // Recent 30 reward grants
      const recentRewards = (await queryAll(
        db,
        `SELECT rr.*, u.name AS inviter_name, u.avatar AS inviter_avatar
         FROM referral_rewards rr
         JOIN users u ON u.id = rr.inviter_user_id
         ORDER BY rr.granted_at DESC
         LIMIT 30`,
        []
      )) as any[];

      // Total ambassador badges by type
      const badgeCounts = (await queryAll(
        db,
        `SELECT badge_type, COUNT(*) AS cnt
         FROM user_badges
         WHERE badge_type IN ('ambassador','ambassador_gold','ambassador_elite')
         GROUP BY badge_type`,
        []
      )) as any[];

      res.json({
        statusCounts: statusCounts.reduce((acc: Record<string, number>, r: any) => {
          acc[String(r.validation_status)] = Number(r.cnt);
          return acc;
        }, {}),
        tierStats: tierStats.map((r: any) => ({
          rewardType: String(r.reward_type),
          count: Number(r.cnt),
          totalDays: Number(r.total_days ?? 0),
        })),
        topInviters: topInviters.map((r: any) => ({
          userId: String(r.inviter_user_id),
          name: String(r.inviter_name),
          avatar: r.inviter_avatar ? String(r.inviter_avatar) : null,
          validatedCount: Number(r.validated_count),
        })),
        recentRewards: recentRewards.map((r: any) => ({
          id: String(r.id),
          inviterUserId: String(r.inviter_user_id),
          inviterName: String(r.inviter_name),
          inviterAvatar: r.inviter_avatar ? String(r.inviter_avatar) : null,
          rewardType: String(r.reward_type),
          validInvitesCount: Number(r.valid_invites_count),
          premiumDaysGranted: Number(r.premium_days_granted),
          grantedAt: String(r.granted_at),
        })),
        badgeCounts: badgeCounts.reduce((acc: Record<string, number>, r: any) => {
          acc[String(r.badge_type)] = Number(r.cnt);
          return acc;
        }, {}),
      });
    } catch (err) {
      console.error('[admin/referral-stats]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ─── Reengagement: list inactive users ─────────────────────────────────────
  // ─── Reengagement: return-rate metrics ────────────────────────────────────
  app.get('/api/admin/reengagement/metrics', requireAuth(env, db), requireAdmin(), async (_req, res) => {
    try {
      // Total unique users who received at least one successful email
      const totalsRow = (await db.queryOne(
        `SELECT COUNT(DISTINCT user_id) AS total_emailed,
                COUNT(*) AS total_sends,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) AS successful_sends,
                COUNT(CASE WHEN status = 'error' THEN 1 END) AS failed_sends
         FROM reengagement_emails`,
        []
      )) as any;

      // Usuários que voltaram após o e-mail: tem uma visita após o último envio.
      // Uma única query (EXISTS) em vez de N+1 sobre site_visits.
      const returnedRow = (await db.queryOne(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT re.user_id, MAX(re.sent_at) AS last_sent_at
           FROM reengagement_emails re
           WHERE re.status = 'sent'
           GROUP BY re.user_id
         ) ls
         WHERE EXISTS (
           SELECT 1 FROM site_visits sv
           WHERE sv.user_id = ls.user_id AND sv.created_at > ls.last_sent_at
         )`,
        []
      )) as any;
      const returnedCount = Number(returnedRow?.cnt ?? 0);

      const totalEmailed = Number(totalsRow?.total_emailed ?? 0);
      const returnRate = totalEmailed > 0 ? Math.round((returnedCount / totalEmailed) * 100) : 0;

      // Last 10 batches (group by minute to approximate batch)
      const recentBatches = (await db.queryAll(
        `SELECT SUBSTR(sent_at, 1, 16) AS batch_minute,
                COUNT(*) AS total,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) AS sent,
                COUNT(CASE WHEN status = 'error' THEN 1 END) AS errors
         FROM reengagement_emails
         GROUP BY SUBSTR(sent_at, 1, 16)
         ORDER BY batch_minute DESC
         LIMIT 10`,
        []
      )) as any[];

      // Per-period breakdown
      const now = new Date();
      const iso7  = new Date(now.getTime() - 7  * 86400000).toISOString();
      const iso30 = new Date(now.getTime() - 30 * 86400000).toISOString();
      const iso90 = new Date(now.getTime() - 90 * 86400000).toISOString();

      const periodRow = (await db.queryOne(
        `SELECT
           COUNT(CASE WHEN sent_at >= ? AND status = 'sent'  THEN 1 END) AS sent7d,
           COUNT(CASE WHEN sent_at >= ? AND status = 'error' THEN 1 END) AS err7d,
           COUNT(CASE WHEN sent_at >= ? AND status = 'sent'  THEN 1 END) AS sent30d,
           COUNT(CASE WHEN sent_at >= ? AND status = 'error' THEN 1 END) AS err30d,
           COUNT(CASE WHEN sent_at >= ? AND status = 'sent'  THEN 1 END) AS sent90d,
           COUNT(CASE WHEN sent_at >= ? AND status = 'error' THEN 1 END) AS err90d
         FROM reengagement_emails`,
        [iso7, iso7, iso30, iso30, iso90, iso90]
      )) as any;

      // Daily history — last 30 days grouped by date
      const byDay = (await db.queryAll(
        `SELECT SUBSTR(sent_at, 1, 10) AS date,
                COUNT(CASE WHEN status = 'sent'  THEN 1 END) AS sent,
                COUNT(CASE WHEN status = 'error' THEN 1 END) AS errors
         FROM reengagement_emails
         WHERE sent_at >= ?
         GROUP BY SUBSTR(sent_at, 1, 10)
         ORDER BY date ASC`,
        [iso30]
      )) as any[];

      res.json({
        totalEmailed,
        totalSends: Number(totalsRow?.total_sends ?? 0),
        successfulSends: Number(totalsRow?.successful_sends ?? 0),
        failedSends: Number(totalsRow?.failed_sends ?? 0),
        returnedCount,
        returnRate,
        recentBatches: recentBatches.map((r: any) => ({
          batchAt: String(r.batch_minute) + ':00',
          total: Number(r.total),
          sent: Number(r.sent),
          errors: Number(r.errors),
        })),
        byPeriod: {
          last7d:  { sent: Number(periodRow?.sent7d  ?? 0), errors: Number(periodRow?.err7d  ?? 0) },
          last30d: { sent: Number(periodRow?.sent30d ?? 0), errors: Number(periodRow?.err30d ?? 0) },
          last90d: { sent: Number(periodRow?.sent90d ?? 0), errors: Number(periodRow?.err90d ?? 0) },
        },
        byDay: byDay.map((r: any) => ({
          date: String(r.date),
          sent: Number(r.sent),
          errors: Number(r.errors),
        })),
      });
    } catch (err) {
      console.error('[admin/reengagement/metrics]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.get('/api/admin/reengagement/users', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const dateFrom    = typeof req.query.dateFrom   === 'string' ? req.query.dateFrom.trim()   : '';
      const dateTo      = typeof req.query.dateTo     === 'string' ? req.query.dateTo.trim()     : '';
      const search      = typeof req.query.search     === 'string' ? req.query.search.trim()     : '';
      const withPhoto   = req.query.withPhoto  === '1' || req.query.withPhoto  === 'true';
      const emailSent   = req.query.emailSent  === '1' || req.query.emailSent  === 'true';
      const page        = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit    = 50;
      const offset   = (page - 1) * limit;

      // PostgreSQL: last_seen_at is TIMESTAMPTZ but created_at/sv.created_at are TEXT (ISO).
      // Convert last_seen_at → TEXT so all comparisons stay in TEXT domain (no risky casts).
      const sinceExpr = db.mode === 'pg'
        ? `COALESCE(TO_CHAR(u.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), u.created_at)`
        : `COALESCE(u.last_seen_at, u.created_at)`;

      // Build WHERE clauses
      const conditions: string[] = ["u.is_banned = 0", "u.is_deactivated = 0", "u.email IS NOT NULL AND u.email != ''", (db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)')];
      const params: unknown[] = [];

      if (withPhoto) {
        conditions.push("u.avatar IS NOT NULL AND u.avatar != ''");
      }
      if (emailSent) {
        conditions.push("EXISTS (SELECT 1 FROM reengagement_emails re WHERE re.user_id = u.id AND re.status = 'sent')");
      }
      if (search) {
        conditions.push("(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)");
        const like = `%${search.toLowerCase()}%`;
        params.push(like, like);
      }
      if (dateFrom) {
        conditions.push(db.mode === 'pg'
          ? "(u.last_seen_at IS NULL OR u.last_seen_at >= ?::TIMESTAMPTZ)"
          : "(u.last_seen_at IS NULL OR u.last_seen_at >= ?)");
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(db.mode === 'pg'
          ? "(u.last_seen_at IS NULL OR u.last_seen_at <= ?::TIMESTAMPTZ)"
          : "(u.last_seen_at IS NULL OR u.last_seen_at <= ?)");
        params.push(dateTo + 'T23:59:59');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const countRow = (await db.queryOne(
        `SELECT COUNT(*) AS cnt FROM users u ${where}`,
        params
      )) as any;
      const total = Number(countRow?.cnt ?? 0);

      // 1) Página base (rápida, sem subqueries por linha)
      const rows = (await db.queryAll(
        `SELECT u.id, u.name, u.email, u.avatar, u.created_at, u.last_seen_at
         FROM users u
         ${where}
         ORDER BY CASE WHEN u.last_seen_at IS NULL THEN 0 ELSE 1 END ASC, u.last_seen_at ASC, u.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      )) as any[];

      // 2) Estatísticas em lote sobre os IDs da página (evita N+1 / timeout)
      const ids = rows.map((r: any) => String(r.id));
      const visitsMap = new Map<string, number>();
      const likesMap = new Map<string, number>();
      const unreadMap = new Map<string, number>();
      const lastEmailMap = new Map<string, { sentAt: string | null; status: string | null }>();
      const emailCountMap = new Map<string, number>();

      if (ids.length > 0) {
        const ph = ids.map(() => '?').join(',');

        const [visitRows, likeRows, msgRows, emailRows] = await Promise.all([
          db.queryAll(
            `SELECT sv.user_id AS uid, COUNT(*) AS c
             FROM site_visits sv JOIN users u ON u.id = sv.user_id
             WHERE sv.user_id IN (${ph}) AND sv.created_at > ${sinceExpr}
             GROUP BY sv.user_id`, ids
          ) as Promise<any[]>,
          db.queryAll(
            `SELECT l.target_id AS uid, COUNT(*) AS c
             FROM likes l JOIN users u ON u.id = l.target_id
             WHERE l.target_type = 'user' AND l.target_id IN (${ph}) AND l.created_at > ${sinceExpr}
             GROUP BY l.target_id`, ids
          ) as Promise<any[]>,
          db.queryAll(
            `SELECT u.id AS uid, COUNT(*) AS c
             FROM messages m
             JOIN conversations c2 ON c2.id = m.conversation_id
             JOIN users u ON (u.id = c2.user_a_id OR u.id = c2.user_b_id)
             WHERE u.id IN (${ph}) AND m.sender_id != u.id AND m.is_read = 0
             GROUP BY u.id`, ids
          ) as Promise<any[]>,
          db.queryAll(
            `SELECT user_id AS uid, sent_at, status
             FROM reengagement_emails
             WHERE user_id IN (${ph})
             ORDER BY sent_at DESC`, ids
          ) as Promise<any[]>,
        ]);

        for (const r of visitRows) visitsMap.set(String(r.uid), Number(r.c || 0));
        for (const r of likeRows) likesMap.set(String(r.uid), Number(r.c || 0));
        for (const r of msgRows) unreadMap.set(String(r.uid), Number(r.c || 0));
        for (const r of emailRows) {
          const uid = String(r.uid);
          if (!lastEmailMap.has(uid)) lastEmailMap.set(uid, { sentAt: r.sent_at ?? null, status: r.status ?? null });
          if (String(r.status) === 'sent') emailCountMap.set(uid, (emailCountMap.get(uid) ?? 0) + 1);
        }
      }

      res.json({
        total,
        page,
        pages: Math.ceil(total / limit),
        users: rows.map((r: any) => {
          const uid = String(r.id);
          const lastEmail = lastEmailMap.get(uid);
          return {
            id: uid,
            name: String(r.name || ''),
            email: String(r.email || ''),
            avatar: r.avatar ?? null,
            createdAt: r.created_at ?? null,
            lastSeenAt: r.last_seen_at ?? null,
            lastEmailSentAt: lastEmail?.sentAt ?? null,
            lastEmailStatus: lastEmail?.status ?? null,
            emailSendCount: emailCountMap.get(uid) ?? 0,
            stats: {
              visits: visitsMap.get(uid) ?? 0,
              likes: likesMap.get(uid) ?? 0,
              messages: unreadMap.get(uid) ?? 0,
              matches: 0,
            },
          };
        }),
      });
    } catch (err: any) {
      console.error('[admin/reengagement/users]', err);
      res.status(500).json({ error: 'internal', detail: String(err?.message ?? err) });
    }
  });

  // ─── Reengagement: send email batch ────────────────────────────────────────
  app.post('/api/admin/reengagement/send', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const { userIds } = req.body as { userIds?: unknown };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        res.status(400).json({ error: 'invalid_input', message: 'userIds must be a non-empty array' });
        return;
      }
      if (userIds.length > 200) {
        res.status(400).json({ error: 'too_many', message: 'Maximum 200 users per batch' });
        return;
      }

      const placeholders = userIds.map(() => '?').join(',');
      // PostgreSQL: last_seen_at is TIMESTAMPTZ but sv/l created_at are TEXT (ISO).
      const sinceExpr = db.mode === 'pg'
        ? `TO_CHAR(COALESCE(u.last_seen_at, u.created_at::TIMESTAMPTZ) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
        : `COALESCE(u.last_seen_at, u.created_at)`;
      const users = (await db.queryAll(
        `SELECT u.id, u.name, u.email, u.last_seen_at,
                (SELECT COUNT(*) FROM site_visits sv WHERE sv.user_id = u.id AND sv.created_at > ${sinceExpr}) AS visits_since,
                (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'user' AND l.target_id = u.id AND l.created_at > ${sinceExpr}) AS likes_since,
                (SELECT COUNT(*) FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                  WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)
                    AND m.sender_id != u.id
                    AND m.is_read = 0) AS unread_messages
         FROM users u WHERE u.id IN (${placeholders}) AND u.email IS NOT NULL AND u.email != ''
                AND u.is_banned = 0 AND (u.is_deactivated = 0 OR u.is_deactivated IS NULL)
                AND ${db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)'}`,
        userIds
      )) as any[];

      const results: { userId: string; email: string; status: 'sent' | 'skipped' | 'error'; error?: string }[] = [];
      const nowBatch = nowIso();

      for (const user of users) {
        let status: 'sent' | 'skipped' | 'error' = 'error';
        let errorMsg: string | null = null;

        // 1) Try to send — failure here must NOT stop the loop
        try {
          const result = await sendReengagementEmail(
            {
              apiKey: env.RESEND_API_KEY,
              fromEmail: env.RESEND_FROM_EMAIL,
              appName: 'NoSigilo',
              siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net',
            },
            {
              to: String(user.email),
              userName: String(user.name || 'usuário'),
              stats: {
                visits: Number(user.visits_since ?? 0),
                likes: Number(user.likes_since ?? 0),
                messages: Number(user.unread_messages ?? 0),
                matches: 0,
              },
            }
          );
          status = result.skipped ? 'skipped' : 'sent';
        } catch (err: any) {
          status = 'error';
          errorMsg = String(err?.message ?? err);
        }

        results.push({ userId: String(user.id), email: String(user.email), status, ...(errorMsg ? { error: errorMsg } : {}) });

        // 2) Record in DB — failure here must also NOT stop the loop
        if (status !== 'skipped') {
          try {
            await db.run(
              `INSERT INTO reengagement_emails (id, user_id, sent_at, status, error_message) VALUES (?, ?, ?, ?, ?)`,
              [randomUUID(), String(user.id), nowBatch, status, errorMsg]
            );
          } catch (dbErr) {
            console.error('[reengagement/send] failed to record send for', user.id, dbErr);
          }
        }

        // Small delay to avoid rate-limiting (Resend allows ~10 req/s)
        await new Promise((r) => setTimeout(r, 120));
      }
      try { await persist(); } catch { /* non-fatal */ }

      const sent = results.filter((r) => r.status === 'sent').length;
      const errors = results.filter((r) => r.status === 'error').length;
      res.json({ sent, errors, skipped: results.filter((r) => r.status === 'skipped').length, results });
    } catch (err) {
      console.error('[admin/reengagement/send]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ─── Descadastro de e-mail via link assinado no rodapé (público, 1 clique) ──
  app.get('/api/email/unsubscribe', async (req, res) => {
    const page = (title: string, msg: string, ok: boolean) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
      <body style="font-family:Arial,sans-serif;background:#0c0c0f;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;">
        <div style="max-width:420px;text-align:center;padding:32px;border:1px solid #2a2a30;border-radius:18px;background:#15151a;">
          <div style="font-size:40px;margin-bottom:8px;">${ok ? '✅' : '⚠️'}</div>
          <h1 style="font-size:20px;margin:0 0 10px;">${title}</h1>
          <p style="font-size:14px;color:#b8b8c0;line-height:1.6;margin:0;">${msg}</p>
        </div>
      </body></html>`;
    const token = String(req.query.token || '');
    let email = '';
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;
      if (payload?.purpose !== 'unsubscribe' || !payload?.email) throw new Error('bad');
      email = String(payload.email);
    } catch {
      res.status(400).send(page('Link inválido', 'Este link de descadastro é inválido ou expirou.', false));
      return;
    }
    try {
      await run(db, `UPDATE users SET notify_email = ${db.mode === 'pg' ? 'FALSE' : '0'} WHERE LOWER(email) = LOWER(?)`, [email]);
      await persist();
    } catch (err) {
      console.error('[email/unsubscribe]', err);
    }
    res.send(page('Descadastrado', 'Pronto! Você não receberá mais e-mails do NoSigilo. Pode reativar quando quiser em Configurações → Notificações externas.', true));
  });

  // ─── Win-back: resgatar 30 dias grátis via link assinado (público) ──────────
  // O usuário clica no botão do e-mail; concedemos 30 dias e redirecionamos
  // para o login. Não exige sessão — o token assinado identifica o usuário.
  app.get('/api/winback/claim', async (req, res) => {
    const frontend = (env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '');
    const token = String(req.query.token || '');
    if (!token) { res.redirect(`${frontend}/login?winback=invalid`); return; }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      if (decoded?.purpose !== 'winback' || !decoded?.sub) {
        res.redirect(`${frontend}/login?winback=invalid`);
        return;
      }
      const userId = String(decoded.sub);
      const row = (await queryOne(db, 'SELECT id, is_banned, is_deactivated FROM users WHERE id = ? LIMIT 1', [userId])) as any;
      if (!row || row.is_banned || row.is_deactivated) {
        res.redirect(`${frontend}/login?winback=invalid`);
        return;
      }
      await grantPremiumDays(db, userId, 30);
      await persist();
      console.log(`[winback/claim] granted 30 days to user=${userId}`);
      res.redirect(`${frontend}/login?winback=ok`);
    } catch {
      res.redirect(`${frontend}/login?winback=expired`);
    }
  });

  // ─── Win-back campaign: enviar para usuários que entraram 1x e não voltaram ──
  app.post('/api/admin/winback/send-all', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      // inactiveDays=0 desabilita o filtro de inatividade (todos os não-assinantes)
      const inactiveDaysRaw = Number(body.inactiveDays ?? 7);
      const inactiveDays = Math.max(0, Math.min(365, inactiveDaysRaw));
      const maxBatch = Math.max(1, Math.min(500, Number(body.limit ?? 200)));
      const resend = body.resend === true;
      const dryRun = body.dryRun === true;
      // nonSubscribersOnly=true (padrão): exclui quem tem is_premium=1 ou trial ativo
      const nonSubscribersOnly = body.nonSubscribersOnly !== false;

      const sinceExpr = db.mode === 'pg'
        ? `COALESCE(TO_CHAR(u.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), u.created_at)`
        : `COALESCE(u.last_seen_at, u.created_at)`;

      const conditions: string[] = [
        'u.is_banned = 0',
        '(u.is_deactivated = 0 OR u.is_deactivated IS NULL)',
        "u.email IS NOT NULL AND u.email != ''",
        // Respeita o opt-out de e-mail (quem desligou "Receber e-mails")
        db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)',
      ];
      const params: unknown[] = [];

      if (inactiveDays > 0) {
        const cutoffIso = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();
        conditions.push(`${sinceExpr} <= ?`);
        params.push(cutoffIso);
      }

      if (nonSubscribersOnly) {
        // is_premium é INTEGER (0/1) tanto no pg quanto no sqlite; trial_ends_at é TEXT (ISO).
        const nowIsoStr = new Date().toISOString();
        conditions.push(`(u.is_premium IS NULL OR u.is_premium = 0) AND (u.trial_ends_at IS NULL OR u.trial_ends_at < ?)`);
        params.push(nowIsoStr);
      }

      if (!resend) {
        conditions.push("NOT EXISTS (SELECT 1 FROM reengagement_emails re WHERE re.user_id = u.id AND re.campaign = 'winback' AND re.status = 'sent')");
      }
      const where = `WHERE ${conditions.join(' AND ')}`;

      const users = (await db.queryAll(
        `SELECT u.id, u.name, u.email,
                (SELECT COUNT(*) FROM site_visits sv WHERE sv.user_id = u.id AND sv.created_at > ${sinceExpr}) AS visits_since,
                (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'user' AND l.target_id = u.id AND l.created_at > ${sinceExpr}) AS likes_since,
                (SELECT COUNT(*) FROM messages m
                  JOIN conversations c ON c.id = m.conversation_id
                  WHERE (c.user_a_id = u.id OR c.user_b_id = u.id)
                    AND m.sender_id != u.id AND m.is_read = 0) AS unread_messages
         FROM users u ${where}
         ORDER BY ${sinceExpr} ASC
         LIMIT ?`,
        [...params, maxBatch]
      )) as any[];

      if (dryRun) {
        res.json({ dryRun: true, total: users.length, eligible: users.length, sample: users.slice(0, 20).map((u: any) => ({ id: String(u.id), email: String(u.email) })) });
        return;
      }

      const frontend = (env.FRONTEND_ORIGIN || 'https://nosigilo.net').replace(/\/$/, '');
      const results: { userId: string; email: string; status: 'sent' | 'skipped' | 'error'; error?: string }[] = [];
      const nowBatch = nowIso();

      for (const user of users) {
        let status: 'sent' | 'skipped' | 'error' = 'error';
        let errorMsg: string | null = null;
        try {
          const claimToken = jwt.sign({ sub: String(user.id), purpose: 'winback' }, env.JWT_SECRET, { expiresIn: '45d' });
          const claimUrl = `${frontend}/api/winback/claim?token=${encodeURIComponent(claimToken)}`;
          const result = await sendWinbackEmail(
            { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: frontend },
            {
              to: String(user.email),
              userName: String(user.name || 'usuário'),
              claimUrl,
              priceLabel: '9,90',
              stats: {
                visits: Number(user.visits_since ?? 0),
                likes: Number(user.likes_since ?? 0),
                messages: Number(user.unread_messages ?? 0),
              },
            }
          );
          status = result.skipped ? 'skipped' : 'sent';
        } catch (err: any) {
          status = 'error';
          errorMsg = String(err?.message ?? err);
        }

        results.push({ userId: String(user.id), email: String(user.email), status, ...(errorMsg ? { error: errorMsg } : {}) });

        if (status !== 'skipped') {
          try {
            await db.run(
              `INSERT INTO reengagement_emails (id, user_id, sent_at, status, error_message, campaign) VALUES (?, ?, ?, ?, ?, ?)`,
              [randomUUID(), String(user.id), nowBatch, status, errorMsg, 'winback']
            );
          } catch (dbErr) {
            console.error('[winback/send-all] failed to record send for', user.id, dbErr);
          }
        }

        await new Promise((r) => setTimeout(r, 120));
      }
      try { await persist(); } catch { /* non-fatal */ }

      const sent = results.filter((r) => r.status === 'sent').length;
      const errors = results.filter((r) => r.status === 'error').length;
      res.json({ campaign: 'winback', total: users.length, eligible: users.length, sent, errors, skipped: results.filter((r) => r.status === 'skipped').length, results });
    } catch (err) {
      console.error('[admin/winback/send-all]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ─── Reengagement: send-all (filtered batch) ─────────────────────────────
  app.post('/api/admin/reengagement/send-all', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const dateFrom  = typeof body.dateFrom  === 'string' ? body.dateFrom.trim()  : '';
      const dateTo    = typeof body.dateTo    === 'string' ? body.dateTo.trim()    : '';
      const search    = typeof body.search    === 'string' ? body.search.trim()    : '';
      const withPhoto = body.withPhoto === true || body.withPhoto === 1;
      const emailSent = body.emailSent === true || body.emailSent === 1;

      const conditions: string[] = ["u.is_banned = 0", "u.is_deactivated = 0", "u.email IS NOT NULL AND u.email != ''", (db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)')];
      const params: unknown[] = [];

      if (withPhoto) conditions.push("u.avatar IS NOT NULL AND u.avatar != ''");
      if (emailSent) conditions.push("EXISTS (SELECT 1 FROM reengagement_emails re WHERE re.user_id = u.id AND re.status = 'sent')");
      if (search) {
        conditions.push("(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)");
        const like = `%${search.toLowerCase()}%`;
        params.push(like, like);
      }
      if (dateFrom) {
        conditions.push(db.mode === 'pg'
          ? "(u.last_seen_at IS NULL OR u.last_seen_at >= ?::TIMESTAMPTZ)"
          : "(u.last_seen_at IS NULL OR u.last_seen_at >= ?)");
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(db.mode === 'pg'
          ? "(u.last_seen_at IS NULL OR u.last_seen_at <= ?::TIMESTAMPTZ)"
          : "(u.last_seen_at IS NULL OR u.last_seen_at <= ?)");
        params.push(dateTo + 'T23:59:59');
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // Lista base (rápida, sem subqueries) — as estatísticas são calculadas no
      // background, por usuário, usando os índices.
      const users = (await db.queryAll(
        `SELECT u.id, u.name, u.email, u.last_seen_at, u.created_at
         FROM users u ${where}
         ORDER BY u.last_seen_at ASC NULLS FIRST`,
        params
      )) as any[];

      // Responde IMEDIATAMENTE: enviar 2572 e-mails leva minutos e estourava o
      // timeout do cliente (parecia falha, mas continuava enviando). Agora o
      // disparo roda em segundo plano e o admin acompanha pelas Métricas.
      res.json({ started: true, total: users.length });

      void (async () => {
        const nowBatch = nowIso();
        let sent = 0, errors = 0, skipped = 0;
        for (const user of users) {
          const uid = String(user.id);
          const sinceVal = user.last_seen_at
            ? new Date(user.last_seen_at).toISOString()
            : String(user.created_at || '');
          let visits = 0, likes = 0, unread = 0;
          try {
            const [sv, lk, msg] = await Promise.all([
              db.queryOne(`SELECT COUNT(*) AS c FROM site_visits WHERE user_id = ? AND created_at > ?`, [uid, sinceVal]) as Promise<any>,
              db.queryOne(`SELECT COUNT(*) AS c FROM likes WHERE target_type = 'user' AND target_id = ? AND created_at > ?`, [uid, sinceVal]) as Promise<any>,
              db.queryOne(`SELECT COUNT(*) AS c FROM messages m JOIN conversations c2 ON c2.id = m.conversation_id WHERE (c2.user_a_id = ? OR c2.user_b_id = ?) AND m.sender_id != ? AND m.is_read = 0`, [uid, uid, uid]) as Promise<any>,
            ]);
            visits = Number(sv?.c ?? 0);
            likes = Number(lk?.c ?? 0);
            unread = Number(msg?.c ?? 0);
          } catch { /* segue sem stats */ }

          let status: 'sent' | 'error' = 'error';
          let errorMsg: string | null = null;
          try {
            const result = await sendReengagementEmail(
              { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
              {
                to: String(user.email),
                userName: String(user.name || 'usuário'),
                stats: { visits, likes, messages: unread, matches: 0 },
              }
            );
            if ((result as any)?.skipped) { skipped++; continue; }
            status = 'sent';
            sent++;
          } catch (e: any) {
            errorMsg = String(e?.message ?? e);
            errors++;
          }
          try {
            await db.run(
              `INSERT INTO reengagement_emails (id, user_id, sent_at, status, error_message) VALUES (?, ?, ?, ?, ?)`,
              [randomUUID(), uid, nowBatch, status, errorMsg]
            );
          } catch { /* non-fatal */ }
          await new Promise((r) => setTimeout(r, 120));
        }
        try { await persist(); } catch { /* non-fatal */ }
        console.log(`[admin/reengagement/send-all] done: ${sent} sent, ${errors} errors, ${skipped} skipped of ${users.length}`);
      })().catch((e) => console.error('[admin/reengagement/send-all] background', e));
    } catch (err) {
      console.error('[admin/reengagement/send-all]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ─── Send Promoter Campaign Email (filtered or by selected IDs) ─────────────
  app.post('/api/admin/reengagement/send-promoter-campaign', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const userIds   = Array.isArray(body.userIds) ? (body.userIds as unknown[]).map(String) : [];
      const dateFrom  = typeof body.dateFrom  === 'string' ? body.dateFrom.trim()  : '';
      const dateTo    = typeof body.dateTo    === 'string' ? body.dateTo.trim()    : '';
      const search    = typeof body.search    === 'string' ? body.search.trim()    : '';
      const withPhoto = body.withPhoto === true || body.withPhoto === 1;
      const emailSent = body.emailSent === true || body.emailSent === 1;

      let users: any[];

      if (userIds.length > 0) {
        // Send only to specifically selected users
        const placeholders = userIds.map(() => '?').join(', ');
        users = (await db.queryAll(
          `SELECT id, name, email FROM users
           WHERE id IN (${placeholders})
             AND email IS NOT NULL AND email != ''
             AND is_banned = 0 AND is_deactivated = 0
             AND ${db.mode === 'pg' ? 'notify_email IS NOT FALSE' : '(notify_email IS NULL OR notify_email != 0)'}
           ORDER BY created_at ASC`,
          userIds
        )) as any[];
      } else {
        // Send to all users matching current filters (same logic as send-all)
        const conditions: string[] = ["u.is_banned = 0", "u.is_deactivated = 0", "u.email IS NOT NULL AND u.email != ''", (db.mode === 'pg' ? 'u.notify_email IS NOT FALSE' : '(u.notify_email IS NULL OR u.notify_email != 0)')];
        const params: unknown[] = [];
        if (withPhoto) conditions.push("u.avatar IS NOT NULL AND u.avatar != ''");
        if (emailSent) conditions.push("EXISTS (SELECT 1 FROM reengagement_emails re WHERE re.user_id = u.id AND re.status = 'sent')");
        if (search) {
          conditions.push("(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)");
          const like = `%${search.toLowerCase()}%`;
          params.push(like, like);
        }
        if (dateFrom) {
          conditions.push(db.mode === 'pg'
            ? "(u.last_seen_at IS NULL OR u.last_seen_at >= ?::TIMESTAMPTZ)"
            : "(u.last_seen_at IS NULL OR u.last_seen_at >= ?)");
          params.push(dateFrom);
        }
        if (dateTo) {
          conditions.push(db.mode === 'pg'
            ? "(u.last_seen_at IS NULL OR u.last_seen_at <= ?::TIMESTAMPTZ)"
            : "(u.last_seen_at IS NULL OR u.last_seen_at <= ?)");
          params.push(dateTo + 'T23:59:59');
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        users = (await db.queryAll(
          `SELECT u.id, u.name, u.email FROM users u ${where} ORDER BY u.created_at ASC`,
          params
        )) as any[];
      }

      // Loop de envio (compartilhado). Para "todos" (sem userIds) roda em segundo
      // plano para não estourar o timeout do cliente; para selecionados (poucos)
      // roda síncrono e devolve as contagens.
      const processSend = async () => {
        let sent = 0; let errors = 0; let skipped = 0;
        for (const user of users) {
          let status = 'error'; let errorMsg: string | null = null;
          try {
            const result = await sendPromoterCampaignEmail(
              { apiKey: env.RESEND_API_KEY, fromEmail: env.RESEND_FROM_EMAIL, appName: 'NoSigilo', siteUrl: env.FRONTEND_ORIGIN || 'https://nosigilo.net' },
              { to: String(user.email), userName: String(user.name || 'você') }
            );
            if ((result as any)?.skipped) { skipped++; continue; }
            status = 'sent'; sent++;
          } catch (e: any) {
            errorMsg = String(e?.message ?? e); errors++;
          }
          try {
            await db.run(
              `INSERT INTO reengagement_emails (id, user_id, sent_at, status, error_message) VALUES (?, ?, ?, ?, ?)`,
              [randomUUID(), String(user.id), nowIso(), status, errorMsg]
            );
          } catch { /* non-fatal */ }
          await new Promise((r) => setTimeout(r, 120));
        }
        try { await persist(); } catch { /* non-fatal */ }
        return { sent, errors, skipped };
      };

      if (userIds.length === 0) {
        // "Campanha todos": responde já e processa em background.
        res.json({ started: true, total: users.length });
        void processSend()
          .then((r) => console.log(`[admin/reengagement/send-promoter-campaign] done: ${r.sent} sent, ${r.errors} errors, ${r.skipped} skipped of ${users.length}`))
          .catch((e) => console.error('[admin/reengagement/send-promoter-campaign] background', e));
      } else {
        const r = await processSend();
        res.json({ ...r, total: users.length });
      }
    } catch (err) {
      console.error('[admin/reengagement/send-promoter-campaign]', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // ─── Admin Metrics Dashboard ─────────────────────────────────────────────
  app.get('/api/admin/metrics', requireAuth(env, db), requireAdmin(), async (req, res) => {
    try {
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

      const filterCity  = typeof req.query.city  === 'string' ? req.query.city.trim()  : '';
      const filterState = typeof req.query.state === 'string' ? req.query.state.trim() : '';
      const filterGender = typeof req.query.gender === 'string' ? req.query.gender.trim() : '';

      const baseWhere = [
        filterCity   ? `AND LOWER(u.city)  = LOWER('${filterCity.replace(/'/g, "''")}')` : '',
        filterState  ? `AND LOWER(u.state) = LOWER('${filterState.replace(/'/g, "''")}')` : '',
        filterGender ? `AND u.gender = '${filterGender.replace(/'/g, "''")}'` : '',
      ].join(' ');

      const [
        totalUsers,
        registrationsToday,
        registrations7,
        registrations30,
        regByDay30,
        regByGender,
        regByCity,
        regByState,
        regByOrigin,
        activeToday,
        active7,
        active30,
        neverReturned,
        inactive3,
        inactive7,
        inactive15,
        inactive30,
        usersWithPhoto,
        usersWithVideo,
        usersLikedSomeone,
        usersReceivedLike,
        usersSentMessage,
        usersVisitedProfile,
        totalPaying,
        payingMen,
        trialCount,
        trialConverted,
        active2PlusWeek,
      ] = await Promise.all([
        // ── Total users
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE 1=1 ${baseWhere}`, []),
        // ── Today registrations
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE DATE(u.created_at) = ? ${baseWhere}`, [todayIso]),
        // ── Last 7 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.created_at >= ? ${baseWhere}`, [ago(7)]),
        // ── Last 30 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.created_at >= ? ${baseWhere}`, [ago(30)]),
        // ── Registrations per day (last 30 days)
        queryAll(db, `SELECT DATE(u.created_at) as day, COUNT(*) as c FROM users u WHERE u.created_at >= ? ${baseWhere} GROUP BY day ORDER BY day`, [ago(30)]),
        // ── By gender
        queryAll(db, `SELECT u.gender, COUNT(*) as c FROM users u WHERE 1=1 ${baseWhere} GROUP BY u.gender ORDER BY c DESC LIMIT 20`, []),
        // ── By city (completo — agrupa por cidade+UF para não juntar homônimas de UFs diferentes)
        queryAll(db, `SELECT TRIM(u.city) as city, UPPER(TRIM(COALESCE(u.state, ''))) as uf, COUNT(*) as c FROM users u WHERE u.city IS NOT NULL AND TRIM(u.city) != '' ${baseWhere} GROUP BY TRIM(u.city), UPPER(TRIM(COALESCE(u.state, ''))) ORDER BY c DESC LIMIT 2000`, []),
        // ── By state (completo — 27 UFs)
        queryAll(db, `SELECT UPPER(TRIM(u.state)) as state, COUNT(*) as c FROM users u WHERE u.state IS NOT NULL AND TRIM(u.state) != '' ${baseWhere} GROUP BY UPPER(TRIM(u.state)) ORDER BY c DESC LIMIT 60`, []),
        // ── By origin (utm_source / referrer)
        queryAll(db, `SELECT origin_type, COUNT(*) as c FROM site_visits WHERE origin_type IS NOT NULL GROUP BY origin_type ORDER BY c DESC LIMIT 20`, []),
        // ── Active today (last_seen_at today)
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE DATE(u.last_seen_at) = ? ${baseWhere}`, [todayIso]),
        // ── Active last 7 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at >= ? ${baseWhere}`, [ago(7)]),
        // ── Active last 30 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at >= ? ${baseWhere}`, [ago(30)]),
        // ── Never returned (only one visit ever = created_at same day as last_seen)
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE DATE(u.created_at) = DATE(u.last_seen_at) AND u.created_at < ? ${baseWhere}`, [ago(1)]),
        // ── Inactive 3 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at < ? AND u.last_seen_at >= ? ${baseWhere}`, [ago(3), ago(90)]),
        // ── Inactive 7 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at < ? AND u.last_seen_at >= ? ${baseWhere}`, [ago(7), ago(90)]),
        // ── Inactive 15 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at < ? AND u.last_seen_at >= ? ${baseWhere}`, [ago(15), ago(90)]),
        // ── Inactive 30 days
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at < ? AND u.last_seen_at >= ? ${baseWhere}`, [ago(30), ago(180)]),
        // ── Users with public photo
        queryOne(db, `SELECT COUNT(DISTINCT m.user_id) as c FROM media m JOIN users u ON u.id = m.user_id WHERE m.mime_type LIKE 'image/%' AND m.is_private = 0 ${baseWhere}`, []),
        // ── Users with video
        queryOne(db, `SELECT COUNT(DISTINCT m.user_id) as c FROM media m JOIN users u ON u.id = m.user_id WHERE m.mime_type LIKE 'video/%' ${baseWhere}`, []),
        // ── Users who liked someone
        queryOne(db, `SELECT COUNT(DISTINCT l.user_id) as c FROM likes l JOIN users u ON u.id = l.user_id WHERE l.target_type = 'user' ${baseWhere}`, []),
        // ── Users who received a like
        queryOne(db, `SELECT COUNT(DISTINCT l.target_id) as c FROM likes l JOIN users u ON u.id = l.target_id WHERE l.target_type = 'user' ${baseWhere}`, []),
        // ── Users who sent a message
        queryOne(db, `SELECT COUNT(DISTINCT m.sender_id) as c FROM messages m JOIN users u ON u.id = m.sender_id WHERE 1=1 ${baseWhere.replace(/u\./g, 'u.')}`, []),
        // ── Users who visited a profile
        queryOne(db, `SELECT COUNT(DISTINCT pv.visitor_user_id) as c FROM profile_visits pv JOIN users u ON u.id = pv.visitor_user_id WHERE 1=1 ${baseWhere}`, []),
        // ── Total paying (is_premium)
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.is_premium = 1 ${baseWhere}`, []),
        // ── Paying men
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.is_premium = 1 AND (u.gender = 'Homem' OR u.gender = 'homem') ${baseWhere}`, []),
        // ── Users who had a trial (trial_ends_at set and > created_at)
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.trial_ends_at > u.created_at ${baseWhere}`, []),
        // ── Trial users who converted to paid
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.trial_ends_at > u.created_at AND u.is_premium = 1 ${baseWhere}`, []),
        // ── Active 2+ times this week (approximation via last_seen >= 7d ago, excluding today-only)
        queryOne(db, `SELECT COUNT(*) as c FROM users u WHERE u.last_seen_at >= ? AND DATE(u.last_seen_at) != DATE(u.created_at) ${baseWhere}`, [ago(7)]),
      ]);

      const n = (v: any) => Number((v as any)?.c ?? 0);

      res.json({
        filters: { city: filterCity, state: filterState, gender: filterGender },
        acquisition: {
          total: n(totalUsers),
          today: n(registrationsToday),
          last7days: n(registrations7),
          last30days: n(registrations30),
          byDay: (regByDay30 as any[]).map((r) => ({ date: String(r.day), count: Number(r.c) })),
          byGender: (regByGender as any[]).map((r) => ({ gender: r.gender || 'Não informado', count: Number(r.c) })),
          byCity: (regByCity as any[]).map((r) => ({ city: r.city, uf: r.uf || '', count: Number(r.c) })),
          byState: (regByState as any[]).map((r) => ({ state: r.state, count: Number(r.c) })),
          byOrigin: (regByOrigin as any[]).map((r) => ({ origin: r.origin_type, count: Number(r.c) })),
        },
        activation: {
          addedPhoto: n(usersWithPhoto),
          addedVideo: n(usersWithVideo),
          likedProfile: n(usersLikedSomeone),
          receivedLike: n(usersReceivedLike),
          sentFirstMessage: n(usersSentMessage),
          visitedProfile: n(usersVisitedProfile),
          total: n(totalUsers),
        },
        retention: {
          activeToday: n(activeToday),
          active7days: n(active7),
          active30days: n(active30),
          active2plusWeek: n(active2PlusWeek),
          neverReturned: n(neverReturned),
          inactiveSince3days: n(inactive3),
          inactiveSince7days: n(inactive7),
          inactiveSince15days: n(inactive15),
          inactiveSince30days: n(inactive30),
        },
        revenue: {
          totalPaying: n(totalPaying),
          payingMen: n(payingMen),
          trialCount: n(trialCount),
          trialConverted: n(trialConverted),
          trialConversionRate: n(trialCount) > 0 ? Math.round((n(trialConverted) / n(trialCount)) * 100) : 0,
        },
      });
    } catch (err) {
      console.error('[admin/metrics]', err);
      res.status(500).json({ error: 'internal' });
    }
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

  // ─── Background job: expire pending invite entries past their validation deadline ──
  const sweepExpiredInvites = async () => {
    try {
      // Find all pending entries whose deadline has passed
      const expired = (await queryAll(
        db,
        `SELECT ile.id AS entry_id, il.inviter_user_id
         FROM invite_link_entries ile
         JOIN invite_links il ON il.id = ile.invite_link_id
         WHERE ile.validation_status = 'pending'
           AND ile.validation_deadline IS NOT NULL
           AND ile.validation_deadline < ?`,
        [nowIso()]
      )) as any[];

      if (expired.length === 0) return;

      const io = app.get('io') as SocketIOServer | undefined;
      const inviterIds = new Set<string>();

      for (const row of expired) {
        await run(
          db,
          `UPDATE invite_link_entries SET validation_status = 'expired', failed_reason = 'deadline_passed' WHERE id = ?`,
          [String(row.entry_id)]
        );
        inviterIds.add(String(row.inviter_user_id));
      }
      await persist();

      // Re-check rewards for affected inviters (some may have already met threshold before expiry)
      for (const inviterId of inviterIds) {
        await checkAndGrantReferralRewards(db, io, inviterId, env);
      }

      if (expired.length > 0) {
        console.log(`[sweep] Marked ${expired.length} invite entr${expired.length === 1 ? 'y' : 'ies'} as expired`);
      }
    } catch (err) {
      console.error('[sweep] sweepExpiredInvites error:', err);
    }
  };

  // Run sweep on startup (catches any stragglers from downtime), then hourly
  void sweepExpiredInvites();
  setInterval(() => void sweepExpiredInvites(), 60 * 60 * 1000);

  return app;
}
