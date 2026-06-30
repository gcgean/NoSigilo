-- Bloqueio por "impressão digital" perceptual (pHash) de mídia: impede que as
-- MESMAS fotos (ex.: de uso indevido de imagem / pornografia de vingança) sejam
-- reenviadas, mesmo por contas novas.
CREATE TABLE IF NOT EXISTS blocked_media_hashes (
  id TEXT PRIMARY KEY,
  phash TEXT NOT NULL,
  reason TEXT,
  source_media_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocked_media_hashes_phash ON blocked_media_hashes(phash);

-- Hash perceptual de cada mídia (calculado no upload), para bloqueio retroativo.
ALTER TABLE media ADD COLUMN phash TEXT;
