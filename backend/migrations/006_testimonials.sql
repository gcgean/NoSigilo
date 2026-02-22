CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  profile_user_id TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(author_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_testimonials_profile_status_created ON testimonials(profile_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_testimonials_author_created ON testimonials(author_user_id, created_at);

