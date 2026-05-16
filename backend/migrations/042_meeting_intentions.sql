-- 042: meeting intentions, availability status, and meeting tagline
ALTER TABLE users ADD COLUMN intentions_json TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN availability_status TEXT DEFAULT NULL; -- 'now' | 'week' | null
ALTER TABLE users ADD COLUMN availability_until TEXT DEFAULT NULL;  -- ISO timestamp, auto-expires
ALTER TABLE users ADD COLUMN meeting_tagline TEXT DEFAULT NULL;     -- short pitch, max 100 chars
