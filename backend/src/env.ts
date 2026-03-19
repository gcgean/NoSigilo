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
};
