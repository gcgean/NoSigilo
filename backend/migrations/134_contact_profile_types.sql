ALTER TABLE users ADD COLUMN contact_profile_types_json TEXT;
UPDATE users SET contact_profile_types_json = looking_for_json WHERE block_outside_prefs = 1;
UPDATE users SET block_outside_prefs = 0 WHERE block_outside_prefs = 1 AND (contact_profile_types_json IS NULL OR contact_profile_types_json = '[]');
