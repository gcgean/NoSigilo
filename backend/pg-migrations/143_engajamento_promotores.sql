-- Engajamento dos promotores (20/11/2026).
-- Comissão passa a ser aprovada assim que o indicado paga: as pendentes viram aprovadas.
UPDATE promoter_commissions SET status = 'approved' WHERE status = 'pending';
-- Material com dia/hora certos para postar.
ALTER TABLE promoter_assets ADD COLUMN IF NOT EXISTS usar_em TEXT;
ALTER TABLE promoter_assets ADD COLUMN IF NOT EXISTS usar_ate TEXT;
ALTER TABLE promoter_assets ADD COLUMN IF NOT EXISTS avisado_em TEXT;
-- Visitas ao link de convite (uma por visitante por dia).
CREATE TABLE IF NOT EXISTS promoter_link_clicks (
  inviter_user_id TEXT NOT NULL,
  visitante TEXT NOT NULL,
  dia TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (inviter_user_id, visitante, dia)
);
CREATE INDEX IF NOT EXISTS idx_promoter_link_clicks_dia ON promoter_link_clicks (inviter_user_id, dia);
-- Boas-vindas da Lola (dias 1, 3 e 7).
CREATE TABLE IF NOT EXISTS promoter_boas_vindas (
  user_id TEXT NOT NULL,
  etapa INTEGER NOT NULL,
  enviado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, etapa)
);
-- Quem já era promotor antes desta mudança não recebe a sequência.
INSERT INTO promoter_boas_vindas (user_id, etapa, enviado_em)
  SELECT p.user_id, e.etapa, 'antes-da-sequencia' FROM promoters p CROSS JOIN (VALUES (0), (1), (2)) AS e(etapa)
  ON CONFLICT DO NOTHING;
-- Desafio semanal: vencedor de cada semana (chave = segunda-feira).
CREATE TABLE IF NOT EXISTS promoter_desafios (
  semana TEXT PRIMARY KEY,
  vencedor_user_id TEXT,
  cadastros INTEGER NOT NULL DEFAULT 0,
  fechado_em TEXT NOT NULL
);
-- Os materiais já publicados não geram aviso retroativo.
UPDATE promoter_assets SET avisado_em = created_at WHERE avisado_em IS NULL;
-- Mensagens automáticas (boas-vindas, material novo, desafio) não sobem a
-- conversa na lista do suporte do admin.
ALTER TABLE promoter_support_messages ADD COLUMN IF NOT EXISTS automatica INTEGER NOT NULL DEFAULT 0;
