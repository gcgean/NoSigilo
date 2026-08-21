-- Registro do motivo da exclusão de conta, com snapshot de gênero/região no
-- momento em que a pessoa saiu. Tabela própria (e não colunas em users) porque
-- a exclusão anonimiza o perfil: guardar o snapshot aqui preserva o dado
-- analítico mesmo que o cadastro seja alterado depois.
-- Sem FK para users: é tabela de analytics — o registro deve sobreviver a
-- qualquer limpeza futura da tabela de usuários.
CREATE TABLE IF NOT EXISTS account_deletions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  reason_code TEXT,
  reason_text TEXT,
  gender TEXT,
  city TEXT,
  state TEXT,
  was_premium INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_deletions_created_at ON account_deletions(created_at);
CREATE INDEX IF NOT EXISTS idx_account_deletions_reason ON account_deletions(reason_code);
