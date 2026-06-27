CREATE TABLE IF NOT EXISTS revenue_snapshots (
  month TEXT PRIMARY KEY,
  mrr_cents INTEGER NOT NULL,
  paying_users INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);
