-- 132: registro de quando um admin abriu a conversa entre quem denunciou e o
-- denunciado (moderação). Só existe a partir de uma denúncia; fica o rastro de
-- quem leu, qual conversa e quando.
CREATE TABLE IF NOT EXISTS admin_leituras_conversa (
  id              TEXT PRIMARY KEY,
  admin_id        TEXT NOT NULL,
  report_id       TEXT NOT NULL,
  conversation_id TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_leituras_conversa_report ON admin_leituras_conversa (report_id);
