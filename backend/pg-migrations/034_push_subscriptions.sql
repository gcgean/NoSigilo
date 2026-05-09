CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  subscription_json TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);
