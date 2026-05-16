-- 041: meeting intentions, availability status, and meeting tagline
ALTER TABLE users ADD COLUMN IF NOT EXISTS intentions_json TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability_until TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS meeting_tagline TEXT DEFAULT NULL;
