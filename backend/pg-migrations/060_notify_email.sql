-- 060: preferência de e-mail (resumos/notificações externas), ligada por padrão.
-- O DEFAULT já aplica TRUE a todos os usuários já cadastrados.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN NOT NULL DEFAULT TRUE;
