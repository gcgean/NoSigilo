-- 090: Embaixador Oficial — título que o admin concede a promotores.
--
-- Diferente dos selos automáticos de convite (ambassador, ambassador_gold,
-- ambassador_elite em user_badges): este é dado à mão, pelo ranking de receita,
-- e pode ser revogado.
--
-- embaixador_oficial_em       quando foi condecorado (NULL = não é)
-- embaixador_oficial_nota     observação do admin
-- embaixador_oficial_oculto   a própria pessoa escondeu o selo público
--                             (discrição); os benefícios continuam
-- embaixador_trial_anterior   trial_ends_at de antes da condecoração: o
--                             Premium grátis estende o trial, e revogar
--                             devolve o valor original

ALTER TABLE users ADD COLUMN IF NOT EXISTS embaixador_oficial_em TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS embaixador_oficial_nota TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS embaixador_oficial_oculto INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS embaixador_trial_anterior TEXT;
