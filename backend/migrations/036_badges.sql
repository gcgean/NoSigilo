CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  badge_type TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  UNIQUE(user_id, badge_type),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
