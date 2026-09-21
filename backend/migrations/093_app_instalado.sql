-- 093: saber quem usa pelo app instalado e quem usa pelo navegador.
ALTER TABLE site_visits ADD COLUMN display_mode TEXT;
ALTER TABLE users ADD COLUMN app_instalado_em TEXT;
ALTER TABLE users ADD COLUMN app_recompensa_em TEXT;
