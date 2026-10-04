-- 103: historico dos recursos do servidor (amostra a cada 5 min, guarda 30 dias).
-- Base do diagnostico diario de upgrade: tempo acima do limite, picos e
-- ritmo de crescimento do disco.
CREATE TABLE IF NOT EXISTS recursos_amostras (
  id          TEXT PRIMARY KEY,
  medido_em   TEXT NOT NULL,
  cpu         REAL NOT NULL,
  memoria     REAL NOT NULL,
  disco       REAL NOT NULL,
  carga       REAL,
  videos_fila INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recursos_amostras_medido_em ON recursos_amostras (medido_em);
