-- Referral reward system: "Invite 3 or Pay" premium unlock

-- Track IP at registration time (hashed) for anti-fraud
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip_hash TEXT;

-- Expand invite_link_entries with validation state
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS invitee_ip_hash TEXT;
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS validated_at TEXT;
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS failed_reason TEXT;
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS actions_bitmask INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invite_link_entries ADD COLUMN IF NOT EXISTS validation_deadline TEXT;

CREATE INDEX IF NOT EXISTS idx_invite_entries_validation ON invite_link_entries(validation_status);
CREATE INDEX IF NOT EXISTS idx_invite_entries_deadline ON invite_link_entries(validation_deadline);

-- Referral reward grants (one row per tier reached per inviter)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  valid_invites_count INTEGER NOT NULL DEFAULT 0,
  premium_days_granted INTEGER NOT NULL DEFAULT 0,
  granted_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_unique ON referral_rewards(inviter_user_id, reward_type);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_inviter ON referral_rewards(inviter_user_id);
