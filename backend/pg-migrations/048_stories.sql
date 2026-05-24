-- 048: stories feature
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_views (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  viewer_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  UNIQUE(story_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS story_comments (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  commenter_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
