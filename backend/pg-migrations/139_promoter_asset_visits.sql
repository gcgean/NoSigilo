CREATE TABLE IF NOT EXISTS promoter_asset_visits (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visit_day TEXT NOT NULL,
  PRIMARY KEY (user_id, visit_day)
);
CREATE INDEX IF NOT EXISTS idx_promoter_asset_visits_day ON promoter_asset_visits (visit_day);
