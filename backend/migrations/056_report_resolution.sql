-- Ação tomada ao resolver uma denúncia (ban, warn, remove_content, dismiss).
ALTER TABLE reports ADD COLUMN resolution_action TEXT;
