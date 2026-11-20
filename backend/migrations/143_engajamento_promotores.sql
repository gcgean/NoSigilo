-- Engajamento dos promotores (20/11/2026). Ver a versão Postgres.
UPDATE promoter_commissions SET status = 'approved' WHERE status = 'pending';
ALTER TABLE promoter_assets ADD COLUMN usar_em TEXT;
ALTER TABLE promoter_assets ADD COLUMN usar_ate TEXT;
ALTER TABLE promoter_assets ADD COLUMN avisado_em TEXT;
CREATE TABLE IF NOT EXISTS promoter_link_clicks (
  inviter_user_id TEXT NOT NULL,
  visitante TEXT NOT NULL,
  dia TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (inviter_user_id, visitante, dia)
);
CREATE INDEX IF NOT EXISTS idx_promoter_link_clicks_dia ON promoter_link_clicks (inviter_user_id, dia);
CREATE TABLE IF NOT EXISTS promoter_boas_vindas (
  user_id TEXT NOT NULL,
  etapa INTEGER NOT NULL,
  enviado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, etapa)
);
INSERT OR IGNORE INTO promoter_boas_vindas (user_id, etapa, enviado_em)
  SELECT p.user_id, e.etapa, 'antes-da-sequencia' FROM promoters p CROSS JOIN (SELECT 0 AS etapa UNION ALL SELECT 1 UNION ALL SELECT 2) e;
CREATE TABLE IF NOT EXISTS promoter_desafios (
  semana TEXT PRIMARY KEY,
  vencedor_user_id TEXT,
  cadastros INTEGER NOT NULL DEFAULT 0,
  fechado_em TEXT NOT NULL
);
UPDATE promoter_assets SET avisado_em = created_at WHERE avisado_em IS NULL;
ALTER TABLE promoter_support_messages ADD COLUMN automatica INTEGER NOT NULL DEFAULT 0;
