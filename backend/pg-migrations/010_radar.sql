CREATE TABLE IF NOT EXISTS radar_broadcasts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  city_lat DOUBLE PRECISION,
  city_lon DOUBLE PRECISION,
  message TEXT NOT NULL,
  target_genders_json TEXT NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 25,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  only_online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deactivated_at TEXT
);

CREATE TABLE IF NOT EXISTS radar_broadcast_views (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL REFERENCES radar_broadcasts(id) ON DELETE CASCADE,
  viewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TEXT NOT NULL,
  viewed_at TEXT,
  contacted_at TEXT,
  UNIQUE (broadcast_id, viewer_user_id)
);
