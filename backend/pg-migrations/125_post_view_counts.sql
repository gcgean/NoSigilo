-- 125: Contador de visualizações por post. O feed contava post_views
-- (3,5 milhões de linhas) a cada página: ~200 mil COUNT(*) por semana, com
-- picos de até 29 s. Tabela à parte, e não coluna em posts, para que cada
-- visualização não reescreva a linha do post que o feed inteiro lê.
CREATE TABLE IF NOT EXISTS post_view_counts (
  post_id TEXT PRIMARY KEY,
  c INTEGER NOT NULL DEFAULT 0
);
INSERT INTO post_view_counts (post_id, c)
SELECT post_id, COUNT(*) FROM post_views GROUP BY post_id;
