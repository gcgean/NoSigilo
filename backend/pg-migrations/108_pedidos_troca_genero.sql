-- 108: troca do tipo de perfil (gênero) por pedido com justificativa, analisado
-- pelo admin (antes o tipo era imutável depois do cadastro).
CREATE TABLE IF NOT EXISTS gender_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_gender TEXT,
  requested_gender TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_gender_change_requests_status ON gender_change_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_gender_change_requests_user ON gender_change_requests(user_id);
