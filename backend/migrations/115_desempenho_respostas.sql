-- 115: tempo de resposta da API, um resumo a cada 5 minutos (guarda 30 dias).
-- Base do gráfico "Desempenho do servidor" no admin.
CREATE TABLE IF NOT EXISTS desempenho_respostas (
  id          TEXT PRIMARY KEY,
  inicio      TEXT NOT NULL,
  pedidos     INTEGER NOT NULL,
  media_ms    REAL NOT NULL,
  p95_ms      REAL NOT NULL,
  max_ms      REAL NOT NULL,
  erros       INTEGER NOT NULL DEFAULT 0,
  lentas_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_desempenho_respostas_inicio ON desempenho_respostas (inicio);
