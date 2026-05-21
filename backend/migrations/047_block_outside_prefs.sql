-- Allow users to block messages from profiles outside their looking_for preferences
ALTER TABLE users ADD COLUMN block_outside_prefs INTEGER NOT NULL DEFAULT 0;
