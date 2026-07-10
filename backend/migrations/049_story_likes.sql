-- 049: story likes (contraparte SQLite da pg-migrations/049_story_likes.sql, que
-- faltava — sem ela a 054_story_reactions falha com "no such table: story_likes"
-- em qualquer init do zero no SQLite, quebrando testes e ambientes dev novos).
CREATE TABLE IF NOT EXISTS story_likes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  liker_id TEXT NOT NULL,
  liked_at TEXT NOT NULL,
  UNIQUE(story_id, liker_id)
);
