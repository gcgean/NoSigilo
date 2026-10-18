-- 122: A Casa (boate virtual) — histórico para o admin, reservas e visualização única de mídia.
CREATE TABLE IF NOT EXISTS casa_mensagens (
  id TEXT PRIMARY KEY,
  noite TEXT NOT NULL,
  sala TEXT NOT NULL,
  tipo TEXT NOT NULL,
  autor_id TEXT,
  texto TEXT,
  media_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_casa_mensagens_noite ON casa_mensagens (noite, created_at);
CREATE TABLE IF NOT EXISTS casa_midia_vistas (
  mensagem_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (mensagem_id, user_id)
);
CREATE TABLE IF NOT EXISTS casa_eventos (
  id TEXT PRIMARY KEY,
  noite TEXT NOT NULL,
  sala TEXT,
  tipo TEXT NOT NULL,
  user_id TEXT,
  outro_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_casa_eventos_noite ON casa_eventos (noite, created_at);
CREATE TABLE IF NOT EXISTS casa_reservas (
  user_id TEXT NOT NULL,
  noite TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, noite)
);
