CREATE TABLE IF NOT EXISTS blocked_media_hashes (
  id TEXT PRIMARY KEY,
  phash TEXT NOT NULL,
  reason TEXT,
  source_media_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocked_media_hashes_phash ON blocked_media_hashes(phash);

ALTER TABLE media ADD COLUMN IF NOT EXISTS phash TEXT;
