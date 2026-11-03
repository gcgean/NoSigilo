-- 126: "Chegaram na sua região" — boas-vindas a perfis novos e o aviso diário.
-- boas_vindas: quem deu boas-vindas a quem (1 por par; limita 5/dia por quem
-- manda e 10 por perfil novo). avisos_novos_regiao: cada aviso enviado, para o
-- teto de 1 por dia e 4 por semana. aviso_novos_regiao: a pessoa pode desligar.
CREATE TABLE IF NOT EXISTS boas_vindas (
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (from_user_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_boas_vindas_to ON boas_vindas(to_user_id);
CREATE INDEX IF NOT EXISTS idx_boas_vindas_from_created ON boas_vindas(from_user_id, created_at);
CREATE TABLE IF NOT EXISTS avisos_novos_regiao (
  user_id TEXT NOT NULL,
  enviado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avisos_novos_regiao ON avisos_novos_regiao(user_id, enviado_em);
ALTER TABLE users ADD COLUMN IF NOT EXISTS aviso_novos_regiao BOOLEAN NOT NULL DEFAULT TRUE;
