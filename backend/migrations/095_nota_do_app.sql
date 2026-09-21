-- 095: nota de 0 a 10 do app (NPS) com sugestao livre.
--
-- Uma linha por resposta (o historico importa: queremos ver a nota subir ou
-- cair ao longo do tempo). A pergunta so volta a aparecer a cada 90 dias.
CREATE TABLE IF NOT EXISTS app_ratings (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  nota       INTEGER NOT NULL,
  sugestao   TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_ratings_user ON app_ratings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_ratings_created ON app_ratings (created_at DESC);
