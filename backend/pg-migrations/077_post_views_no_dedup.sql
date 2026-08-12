-- Remove a deduplicação de post_views: cada visualização agora soma, mesmo
-- que seja o mesmo usuário vendo o post de novo. Recria a tabela sem o UNIQUE
-- (poucas linhas existentes até aqui — é só um contador de exibição).
DROP TABLE IF EXISTS post_views;
CREATE TABLE IF NOT EXISTS post_views (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
