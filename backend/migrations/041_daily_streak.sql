-- Daily login streak tracking
ALTER TABLE users ADD COLUMN login_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN login_streak_updated_date TEXT;
ALTER TABLE users ADD COLUMN login_streak_max INTEGER DEFAULT 0;
