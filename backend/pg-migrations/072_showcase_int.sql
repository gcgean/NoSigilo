-- A 071 criou is_showcase como BOOLEAN no Postgres, mas o código todo trata como
-- inteiro 0/1 (= 0, = 1, COALESCE(...,0)). Converte para INTEGER para bater com o
-- SQLite e evitar erro de tipo (boolean vs integer) nas queries de vitrine/Match/Busca.
-- Preserva o valor atual (perfis já marcados continuam marcados).
ALTER TABLE users ALTER COLUMN is_showcase DROP DEFAULT;
ALTER TABLE users ALTER COLUMN is_showcase TYPE INTEGER USING (CASE WHEN is_showcase THEN 1 ELSE 0 END);
ALTER TABLE users ALTER COLUMN is_showcase SET DEFAULT 0;
