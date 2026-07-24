-- Perfis de vitrine (seed/manada): conteúdo curado que mantém o feed/stories
-- vivos. São escondidos do Match/Radar/Busca e respondem DM com aviso honesto.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_showcase BOOLEAN NOT NULL DEFAULT FALSE;
