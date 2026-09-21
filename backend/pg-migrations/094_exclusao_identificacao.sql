-- 094: quem excluiu a conta, para o admin reconhecer a linha na lista.
--
-- O perfil é anonimizado na exclusão (esse é o combinado com o usuário), mas o
-- admin precisa saber de quem era a conta ao revisar a saída. Nome completo e
-- e-mail MASCARADO ("jos***@gmail.com") — o endereço inteiro não é guardado.
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE account_deletions ADD COLUMN IF NOT EXISTS email_mascarado TEXT;
