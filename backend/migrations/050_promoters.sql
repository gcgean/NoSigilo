-- Promoter profiles
CREATE TABLE IF NOT EXISTS promoters (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active, suspended
  accepted_terms_at TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Commission entries (one per subscription payment)
CREATE TABLE IF NOT EXISTS promoter_commissions (
  id TEXT PRIMARY KEY,
  promoter_user_id TEXT NOT NULL,
  subscriber_user_id TEXT NOT NULL,
  subscription_amount INTEGER NOT NULL DEFAULT 990,   -- in cents (990 = R$9.90)
  commission_amount INTEGER NOT NULL DEFAULT 198,     -- in cents (198 = R$1.98, 20%)
  status TEXT NOT NULL DEFAULT 'pending',             -- pending, approved, paid, cancelled
  period TEXT,                                        -- e.g. '2025-06' for monthly batch
  event_type TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_promoter_commissions_promoter ON promoter_commissions (promoter_user_id);
CREATE INDEX IF NOT EXISTS idx_promoter_commissions_subscriber ON promoter_commissions (subscriber_user_id);
