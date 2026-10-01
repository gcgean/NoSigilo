-- 102: video processado em segundo plano.
-- media.processando = 1 enquanto o video e comprimido (marca d'agua); o post
-- que usa essa midia fica com posts.processando = 1 e so aparece para os outros
-- quando terminar (o autor e notificado).
ALTER TABLE media ADD COLUMN processando INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN processando INTEGER NOT NULL DEFAULT 0;
