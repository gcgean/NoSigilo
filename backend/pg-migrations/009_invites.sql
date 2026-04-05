ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_status TEXT NOT NULL DEFAULT 'approved';

CREATE TABLE IF NOT EXISTS invite_links (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE,
  invitee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  invitee_email TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  approved_at TEXT,
  used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_invite_links_inviter_status ON invite_links(inviter_user_id, status);
CREATE INDEX IF NOT EXISTS idx_invite_links_token ON invite_links(invite_token);
