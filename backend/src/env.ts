import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT || 4001),
  FRONTEND_ORIGIN: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  DATABASE_FILE: process.env.DATABASE_FILE || './data/nosigilo.sqlite',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'change-me',
  SEED_DEMO: (process.env.SEED_DEMO || 'true') === 'true',
  TRIAL_DAYS: Number(process.env.TRIAL_DAYS || 30),
};
