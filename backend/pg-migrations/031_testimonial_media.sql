CREATE TABLE IF NOT EXISTS testimonial_media (
  testimonial_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (testimonial_id, media_id),
  FOREIGN KEY(testimonial_id) REFERENCES testimonials(id) ON DELETE CASCADE,
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_testimonial_media_tid ON testimonial_media(testimonial_id);
