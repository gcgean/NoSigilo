CREATE TABLE IF NOT EXISTS promoter_assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  media_id TEXT NOT NULL,
  destination TEXT NOT NULL DEFAULT 'community',
  created_at TEXT NOT NULL
);
