CREATE TABLE IF NOT EXISTS reengagement_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_reengagement_emails_user_id ON reengagement_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_reengagement_emails_sent_at ON reengagement_emails(sent_at);
