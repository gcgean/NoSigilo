-- Mudança de nome do perfil passa a exigir solicitação ao suporte + aprovação do admin.
CREATE TABLE IF NOT EXISTS name_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_name TEXT,
  requested_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_name_change_requests_status ON name_change_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_name_change_requests_user ON name_change_requests(user_id);
