CREATE TABLE IF NOT EXISTS experience_media (
  experience_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (experience_id, media_id),
  FOREIGN KEY(experience_id) REFERENCES experiences(id) ON DELETE CASCADE,
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experience_media_eid ON experience_media(experience_id);
