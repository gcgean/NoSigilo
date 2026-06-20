-- 058: stories de texto com fundo colorido.
-- text/background ficam NULL para stories de mídia. Stories de texto usam
-- media_id = '' (sentinela), então os SELECTs passam a usar LEFT JOIN media.
ALTER TABLE stories ADD COLUMN text TEXT;
ALTER TABLE stories ADD COLUMN background TEXT;
