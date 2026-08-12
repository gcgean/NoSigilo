-- Contador de visualizações de posts (feed e vídeos usam a mesma tabela).
-- Dedup por usuário: cada viewer soma no máx. 1 view por post.
CREATE TABLE IF NOT EXISTS post_views (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(post_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
