CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  profile_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_testimonials_profile_status_created ON testimonials(profile_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_testimonials_author_created ON testimonials(author_user_id, created_at);

