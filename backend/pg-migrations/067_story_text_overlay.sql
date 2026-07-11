-- Texto sobre a mídia (estilo Instagram): guarda o estilo do overlay (posição+cor)
-- em JSON. O texto em si reusa a coluna `text` já existente.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS text_overlay TEXT;
