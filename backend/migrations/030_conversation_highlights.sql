ALTER TABLE conversations ADD COLUMN is_highlighted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN highlight_note TEXT;
ALTER TABLE conversations ADD COLUMN highlight_color TEXT;
