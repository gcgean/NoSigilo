-- Sistema de tokens: pontos por ação que viram dias grátis (100 pts = 1 dia).
ALTER TABLE users ADD COLUMN token_points INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN token_points_total INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN token_free_days INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS token_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  ref_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_token_tx_user ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_tx_user_action ON token_transactions(user_id, action_type, created_at);
