-- 119: conta oficial do NoSigilo (manda dicas no Chat) e a fila das dicas.
ALTER TABLE users ADD COLUMN conta_oficial INTEGER DEFAULT 0;

-- Uma linha por pessoa: em que dica está e quando sai a próxima.
CREATE TABLE IF NOT EXISTS dicas_chat (
  user_id TEXT PRIMARY KEY,
  etapa INTEGER NOT NULL DEFAULT 0,
  proxima_em TEXT,
  veterano INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  concluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_dicas_chat_proxima ON dicas_chat (proxima_em) WHERE concluido_em IS NULL;
