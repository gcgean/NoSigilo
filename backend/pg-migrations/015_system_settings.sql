CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

INSERT INTO system_settings (key, value, updated_at)
VALUES ('subscriptions_enabled', '1', NOW()::text)
ON CONFLICT (key) DO NOTHING;
