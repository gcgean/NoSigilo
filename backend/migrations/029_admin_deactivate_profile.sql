ALTER TABLE users ADD COLUMN deactivated_by_admin INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN deactivated_by TEXT;
