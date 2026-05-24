-- 049: story likes
CREATE TABLE IF NOT EXISTS story_likes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  liker_id TEXT NOT NULL,
  liked_at TEXT NOT NULL,
  UNIQUE(story_id, liker_id)
);
