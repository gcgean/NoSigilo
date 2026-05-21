-- Google OAuth: add google_id column (SQLite version)
-- Note: SQLite does not support ALTER COLUMN DROP NOT NULL,
-- so password_hash remains NOT NULL in SQLite mode (Google login uses empty string as hash).
ALTER TABLE users ADD COLUMN google_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL;
