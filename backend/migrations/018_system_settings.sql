CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO system_settings (key, value, updated_at)
VALUES ('subscriptions_enabled', '1', CURRENT_TIMESTAMP);
