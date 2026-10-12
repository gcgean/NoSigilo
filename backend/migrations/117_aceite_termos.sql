-- 117: registro do aceite dos Termos e da Politica de Privacidade (LGPD, art. 8, par. 2:
-- quem trata os dados precisa provar o consentimento). Contas antigas ficam vazias.
ALTER TABLE users ADD COLUMN termos_aceitos_em TEXT;
ALTER TABLE users ADD COLUMN termos_versao TEXT;
