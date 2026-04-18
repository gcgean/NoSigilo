CREATE TABLE IF NOT EXISTS match_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  passed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_passes_user_target
  ON match_passes(user_id, passed_user_id);

CREATE INDEX IF NOT EXISTS idx_match_passes_user
  ON match_passes(user_id);
