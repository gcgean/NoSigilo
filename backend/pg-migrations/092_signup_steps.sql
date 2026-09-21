-- 092: onde as pessoas param no cadastro.
--
-- Um evento por etapa alcancada (e por erro que bloqueou o avanco), sem nome,
-- e-mail ou qualquer dado digitado. O ip_hash e o mesmo hash de site_visits,
-- so para ligar visita -> cadastro na contagem.
CREATE TABLE IF NOT EXISTS signup_steps (
  id         TEXT PRIMARY KEY,
  ip_hash    TEXT,
  evento     TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signup_steps_created ON signup_steps (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_steps_evento ON signup_steps (evento);
