ALTER TABLE reengagement_emails ADD COLUMN campaign TEXT NOT NULL DEFAULT 'reengagement';

CREATE INDEX IF NOT EXISTS idx_reengagement_emails_campaign ON reengagement_emails(campaign);
