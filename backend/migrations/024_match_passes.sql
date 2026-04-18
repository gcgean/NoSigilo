CREATE TABLE IF NOT EXISTS match_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  passed_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(passed_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_passes_user_target
  ON match_passes(user_id, passed_user_id);

CREATE INDEX IF NOT EXISTS idx_match_passes_user
  ON match_passes(user_id);
