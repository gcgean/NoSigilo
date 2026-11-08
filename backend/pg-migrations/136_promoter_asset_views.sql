CREATE TABLE IF NOT EXISTS promoter_asset_views (
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, asset_id)
);
