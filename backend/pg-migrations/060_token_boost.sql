-- Destaque de perfil comprado com tokens (ISO timestamp em texto, consistente
-- com as demais comparações de data via nowIso()).
ALTER TABLE users ADD COLUMN IF NOT EXISTS boost_until TEXT;
