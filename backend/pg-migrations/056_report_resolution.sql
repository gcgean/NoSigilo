-- Ação tomada ao resolver uma denúncia (ban, warn, remove_content, dismiss).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_action TEXT;
