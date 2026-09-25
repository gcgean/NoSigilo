-- 098: capa do perfil (duas fotos lado a lado, com o avatar no meio).
--
-- capa_media_ids: ate 2 ids de midia PUBLICA escolhidos pelo dono, em JSON.
-- Vazio = o sistema escolhe sozinho as duas fotos publicas mais curtidas.
-- capa_borrada: o dono pode pedir que a capa apareca borrada ate o toque,
-- para quem abre o app em lugar publico.
ALTER TABLE users ADD COLUMN IF NOT EXISTS capa_media_ids TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS capa_borrada INTEGER NOT NULL DEFAULT 0;
