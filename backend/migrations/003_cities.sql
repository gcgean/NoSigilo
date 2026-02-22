CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  state TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cities_name_norm ON cities(name_norm);
CREATE INDEX IF NOT EXISTS idx_cities_state ON cities(state);

