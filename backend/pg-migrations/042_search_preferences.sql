-- 042: user search preferences (default filter saved per user)
CREATE TABLE IF NOT EXISTS user_search_preferences (
  user_id              TEXT PRIMARY KEY,
  profile_types_json   TEXT DEFAULT NULL,
  max_distance         INTEGER DEFAULT NULL,
  intentions_json      TEXT DEFAULT NULL,
  availability_filter  TEXT DEFAULT NULL,
  updated_at           TIMESTAMPTZ NOT NULL
);
