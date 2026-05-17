import 'dotenv/config';

const jwtSecret = process.env.JWT_SECRET || 'change-me';
if (jwtSecret === 'change-me' || jwtSecret.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[SECURITY] JWT_SECRET is insecure. Set a strong random secret before going to production!');
    process.exit(1);
  } else {
    console.warn('[SECURITY WARNING] JWT_SECRET is using the default insecure value. Set JWT_SECRET in your .env file!');
  }
}

export const env = {
  PORT: Number(process.env.PORT || 4001),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  DATABASE_FILE: process.env.DATABASE_FILE || './data/nosigilo.sqlite',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: jwtSecret,
  SEED_DEMO: (process.env.SEED_DEMO || 'true') === 'true',
  TRIAL_DAYS: Number(process.env.TRIAL_DAYS || 30),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL || '',
  APP_NAME: process.env.APP_NAME || 'NoSigilo',
  HUB_BILLING_BASE_URL: process.env.HUB_BILLING_BASE_URL || '',
  HUB_BILLING_API_KEY: process.env.HUB_BILLING_API_KEY || '',
  HUB_BILLING_ADMIN_EMAIL: process.env.HUB_BILLING_ADMIN_EMAIL || '',
  HUB_BILLING_ADMIN_PASSWORD: process.env.HUB_BILLING_ADMIN_PASSWORD || '',
  HUB_BILLING_PRODUCT_ID: process.env.HUB_BILLING_PRODUCT_ID || '',
  HUB_BILLING_WEBHOOK_SECRET: process.env.HUB_BILLING_WEBHOOK_SECRET || '',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || '',
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || '',
};
