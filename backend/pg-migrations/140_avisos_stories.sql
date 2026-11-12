-- Avisos de stories (11/11/2026): "tem stories novos na sua região" (21h) e o
-- incentivo para mulheres postarem ("seu story teve N visualizações").
-- Um registro por aviso enviado, para respeitar os limites por dia/semana.
CREATE TABLE IF NOT EXISTS avisos_stories (
  user_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  enviado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avisos_stories_user ON avisos_stories (user_id, tipo, enviado_em);
