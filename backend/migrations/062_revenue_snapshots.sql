-- Snapshots mensais de MRR (receita recorrente). Como não há ledger de pagamentos,
-- registramos o MRR real mês a mês a partir de agora; meses anteriores ficam estimados.
CREATE TABLE IF NOT EXISTS revenue_snapshots (
  month TEXT PRIMARY KEY,
  mrr_cents INTEGER NOT NULL,
  paying_users INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);
