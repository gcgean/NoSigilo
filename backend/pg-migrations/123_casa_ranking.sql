-- 123: A Casa — ranking (pontos por desafio) e mídia privada de desafio sugerido.
CREATE TABLE IF NOT EXISTS casa_pontos (
  id TEXT PRIMARY KEY,
  noite TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pontos INTEGER NOT NULL,
  motivo TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_casa_pontos_noite ON casa_pontos (noite, user_id);
CREATE INDEX IF NOT EXISTS idx_casa_pontos_data ON casa_pontos (created_at);
ALTER TABLE casa_mensagens ADD COLUMN destino_id TEXT;
