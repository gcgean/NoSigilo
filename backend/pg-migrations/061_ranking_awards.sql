CREATE TABLE IF NOT EXISTS token_ranking_awards (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  position INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  premium_days INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_ranking_awards_month ON token_ranking_awards(month);

ALTER TABLE users ADD COLUMN IF NOT EXISTS top_month_position INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS top_month_month TEXT;
