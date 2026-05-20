-- 046: block messages from profiles outside looking_for preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_outside_prefs INTEGER NOT NULL DEFAULT 0;
