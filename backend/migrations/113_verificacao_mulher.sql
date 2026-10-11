-- 113: verificação de perfil de mulher (selfie com código, aprovada pelo admin).
-- Verificada = acesso grátis vitalício + selo. Sem verificar = 30 dias grátis.
CREATE TABLE IF NOT EXISTS verificacoes_perfil (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  codigo TEXT NOT NULL,
  media_id TEXT,
  status TEXT NOT NULL DEFAULT 'aguardando_foto',
  motivo TEXT,
  created_at TEXT NOT NULL,
  enviado_em TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_verificacoes_perfil_status ON verificacoes_perfil(status, enviado_em);
CREATE INDEX IF NOT EXISTS idx_verificacoes_perfil_user ON verificacoes_perfil(user_id);
-- Mulheres de hoje (acesso vitalício dado em 11/10 sem verificação): 30 dias a
-- partir de agora para verificar. Embaixador oficial (também até 2099) fica fora.
UPDATE users SET trial_ends_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days')
 WHERE LOWER(TRIM(COALESCE(gender, ''))) = 'mulher'
   AND trial_ends_at LIKE '2099%'
   AND COALESCE(is_verified, 0) = 0
   AND embaixador_oficial_em IS NULL;
