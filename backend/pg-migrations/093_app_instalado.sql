-- 093: saber quem usa pelo app instalado e quem usa pelo navegador.
--
-- display_mode em cada visita responde "quantos usam cada um"; as colunas em
-- users respondem "quem usa o app volta mais e assina mais?" e evitam pagar a
-- recompensa de tokens duas vezes para a mesma pessoa.
ALTER TABLE site_visits ADD COLUMN IF NOT EXISTS display_mode TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_instalado_em TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS app_recompensa_em TEXT;

CREATE INDEX IF NOT EXISTS idx_site_visits_display_mode ON site_visits (display_mode);
