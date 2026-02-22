ALTER TABLE notifications ADD COLUMN data_json TEXT;

CREATE TABLE IF NOT EXISTS private_photo_access_requests (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  requester_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(owner_user_id, requester_user_id)
);

CREATE INDEX IF NOT EXISTS idx_private_photo_access_owner_status ON private_photo_access_requests(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_private_photo_access_requester_status ON private_photo_access_requests(requester_user_id, status);

