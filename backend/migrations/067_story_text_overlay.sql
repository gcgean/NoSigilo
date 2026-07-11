-- Texto sobre a mídia (estilo Instagram): guarda o estilo do overlay (posição+cor)
-- em JSON. O texto em si reusa a coluna `text` já existente (que antes só valia
-- para stories de texto puro; agora também pode acompanhar foto/vídeo).
ALTER TABLE stories ADD COLUMN text_overlay TEXT;
