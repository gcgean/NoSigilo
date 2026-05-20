-- 044: fetiches / kinks JSON field
ALTER TABLE users ADD COLUMN IF NOT EXISTS fetiches_json TEXT;
