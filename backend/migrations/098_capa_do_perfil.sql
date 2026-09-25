-- 098: capa do perfil (duas fotos publicas + opcao de borrar).
ALTER TABLE users ADD COLUMN capa_media_ids TEXT;
ALTER TABLE users ADD COLUMN capa_borrada INTEGER NOT NULL DEFAULT 0;
