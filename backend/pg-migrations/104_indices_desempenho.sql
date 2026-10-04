-- 104: indices de desempenho (criados em producao em 04/10/2026 com CONCURRENTLY).
-- Abrir perfil por nome (WHERE id = ? OR LOWER(name) = ?) varria os 13 mil usuarios;
-- a foto principal (is_main) e consultada por perfil em busca, feed e perfil.
CREATE INDEX IF NOT EXISTS idx_users_lower_name ON users (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_media_user_main ON media (user_id, is_main, is_private, created_at DESC);
