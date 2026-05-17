-- Google OAuth: add google_id column and make password_hash nullable
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id) WHERE google_id IS NOT NULL;
