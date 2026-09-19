-- 089: verificação em duas etapas por e-mail (opcional, ligada pela pessoa).
--
-- Com ela ligada, entrar com senha num aparelho que ainda não é de confiança
-- pede um código de 6 dígitos enviado ao e-mail. Login pelo Google não passa
-- por aqui: o próprio Google já faz essa proteção.

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_email INTEGER NOT NULL DEFAULT 0;

-- Códigos de verificação. purpose = 'login' (aparelho novo) ou 'ativar'
-- (confirmar o e-mail antes de ligar). Só o hash do código fica guardado.
CREATE TABLE IF NOT EXISTS two_factor_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_two_factor_codes_user ON two_factor_codes (user_id, created_at);

-- Aparelhos de confiança. O aparelho guarda um token aleatório; aqui fica só o
-- hash SHA-256 dele, então um vazamento do banco não permite se passar pelo
-- aparelho.
CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trusted_devices_token ON trusted_devices (token_hash);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices (user_id);
