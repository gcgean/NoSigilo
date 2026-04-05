CREATE TABLE IF NOT EXISTS radar_broadcasts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  city_lat REAL,
  city_lon REAL,
  message TEXT NOT NULL,
  target_genders_json TEXT NOT NULL,
  radius_km INTEGER NOT NULL DEFAULT 25,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  only_online INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deactivated_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS radar_broadcast_views (
  id TEXT PRIMARY KEY,
  broadcast_id TEXT NOT NULL,
  viewer_user_id TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  viewed_at TEXT,
  contacted_at TEXT,
  UNIQUE (broadcast_id, viewer_user_id),
  FOREIGN KEY (broadcast_id) REFERENCES radar_broadcasts(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);
