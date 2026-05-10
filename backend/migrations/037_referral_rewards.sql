-- Referral reward system: "Invite 3 or Pay" premium unlock

-- Track IP at registration time (hashed) for anti-fraud
ALTER TABLE users ADD COLUMN registration_ip_hash TEXT;

-- Expand invite_link_entries with validation state
ALTER TABLE invite_link_entries ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'pending';
-- pending | validated | failed | expired
ALTER TABLE invite_link_entries ADD COLUMN invitee_ip_hash TEXT;
ALTER TABLE invite_link_entries ADD COLUMN validated_at TEXT;
ALTER TABLE invite_link_entries ADD COLUMN failed_reason TEXT;
-- Bitmask of completed actions: bit0=profile≥50%, bit1=sent_message, bit2=liked_profile
ALTER TABLE invite_link_entries ADD COLUMN actions_bitmask INTEGER NOT NULL DEFAULT 0;
-- Deadline (7 days from invitee signup) to complete minimum actions
ALTER TABLE invite_link_entries ADD COLUMN validation_deadline TEXT;

CREATE INDEX IF NOT EXISTS idx_invite_entries_validation ON invite_link_entries(validation_status);
CREATE INDEX IF NOT EXISTS idx_invite_entries_deadline ON invite_link_entries(validation_deadline);

-- Referral reward grants (one row per tier reached per inviter)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  reward_type TEXT NOT NULL,
  -- 'ambassador' (3 invites) | 'ambassador_gold' (10) | 'ambassador_elite' (30)
  valid_invites_count INTEGER NOT NULL DEFAULT 0,
  premium_days_granted INTEGER NOT NULL DEFAULT 0,
  granted_at TEXT NOT NULL,
  FOREIGN KEY(inviter_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_rewards_unique ON referral_rewards(inviter_user_id, reward_type);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_inviter ON referral_rewards(inviter_user_id);
