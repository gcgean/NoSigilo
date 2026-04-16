CREATE TABLE IF NOT EXISTS site_visits (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  page_path TEXT,
  page_title TEXT,
  referrer TEXT,
  referrer_domain TEXT,
  origin_type TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  country TEXT,
  timezone TEXT,
  language TEXT,
  device_type TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  user_agent TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_visits_created_at
  ON site_visits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_site_visits_origin_type
  ON site_visits(origin_type);

CREATE INDEX IF NOT EXISTS idx_site_visits_country
  ON site_visits(country);

CREATE INDEX IF NOT EXISTS idx_site_visits_page_path
  ON site_visits(page_path);
