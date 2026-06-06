-- Support chat between promoters and admin
CREATE TABLE IF NOT EXISTS promoter_support_messages (
  id TEXT PRIMARY KEY,
  promoter_user_id TEXT NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'promoter',
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promoter_support_promoter_id ON promoter_support_messages (promoter_user_id, created_at);

-- Extra fields for commission management
ALTER TABLE promoter_commissions ADD COLUMN due_date TEXT;
ALTER TABLE promoter_commissions ADD COLUMN admin_notes TEXT;
