-- 043: user search preferences (default filter saved per user)
CREATE TABLE IF NOT EXISTS user_search_preferences (
  user_id              TEXT PRIMARY KEY,
  profile_types_json   TEXT DEFAULT NULL,  -- JSON array of gender strings
  max_distance         INTEGER DEFAULT NULL, -- km, NULL = any
  intentions_json      TEXT DEFAULT NULL,  -- JSON array of intention values
  availability_filter  TEXT DEFAULT NULL,  -- NULL = any | 'available' = filter for available
  updated_at           TEXT NOT NULL
);
