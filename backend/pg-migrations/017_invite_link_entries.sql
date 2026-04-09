CREATE TABLE IF NOT EXISTS invite_link_entries (
  id TEXT PRIMARY KEY,
  invite_link_id TEXT NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_email TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invite_link_entries_link_created
  ON invite_link_entries(invite_link_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invite_link_entries_invitee
  ON invite_link_entries(invitee_user_id);
