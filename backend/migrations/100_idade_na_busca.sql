-- 100: faixa de idade salva nas preferências de busca.
-- age_max 70 ou NULL = sem limite de cima. age_both = casal só aparece se os
-- dois estiverem na faixa (padrão: basta um).
ALTER TABLE user_search_preferences ADD COLUMN age_min INTEGER;
ALTER TABLE user_search_preferences ADD COLUMN age_max INTEGER;
ALTER TABLE user_search_preferences ADD COLUMN age_both INTEGER NOT NULL DEFAULT 0;
