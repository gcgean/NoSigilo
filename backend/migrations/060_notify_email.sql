-- 060: preferência de e-mail (resumos/notificações externas), ligada por padrão.
-- O DEFAULT já aplica TRUE a todos os usuários já cadastrados.
ALTER TABLE users ADD COLUMN notify_email INTEGER NOT NULL DEFAULT 1;
