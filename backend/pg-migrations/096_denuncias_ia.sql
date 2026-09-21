-- 096: triagem das denuncias pela IA (recomendacao, nao punicao).
--
-- A decisao final continua sendo do admin: aqui ficam a acao sugerida, a
-- gravidade de 1 a 5 e a justificativa que a IA escreveu.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ia_acao TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ia_gravidade INTEGER;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ia_justificativa TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ia_analisado_em TEXT;

CREATE INDEX IF NOT EXISTS idx_reports_ia_gravidade ON reports (ia_gravidade DESC);
