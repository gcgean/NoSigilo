-- Contador de visualizações de posts (feed e vídeos usam a mesma tabela).
-- Dedup por usuário: cada viewer soma no máx. 1 view por post.
CREATE TABLE IF NOT EXISTS post_views (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(post_id, viewer_id),
  FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY(viewer_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_views_post ON post_views(post_id);
