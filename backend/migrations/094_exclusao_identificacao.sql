-- 094: quem excluiu a conta (nome e e-mail mascarado) junto do motivo.
ALTER TABLE account_deletions ADD COLUMN nome TEXT;
ALTER TABLE account_deletions ADD COLUMN email_mascarado TEXT;
