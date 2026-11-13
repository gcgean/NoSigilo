-- Dono do post pode desligar os comentários da publicação (13/11/2026).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comentarios_desligados INTEGER NOT NULL DEFAULT 0;
