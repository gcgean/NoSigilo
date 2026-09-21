-- 096: triagem das denuncias pela IA (recomendacao, nao punicao).
ALTER TABLE reports ADD COLUMN ia_acao TEXT;
ALTER TABLE reports ADD COLUMN ia_gravidade INTEGER;
ALTER TABLE reports ADD COLUMN ia_justificativa TEXT;
ALTER TABLE reports ADD COLUMN ia_analisado_em TEXT;
