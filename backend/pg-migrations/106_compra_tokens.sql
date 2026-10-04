-- 106: compra de tokens.
-- users.tokens_comprados: quanto do saldo (token_points) veio de compra. Essa parte
-- NAO vira dia de Premium (so a parte ganha converte) e e gasta primeiro.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_comprados INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS compras_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  pacote      TEXT NOT NULL,
  tokens      INTEGER NOT NULL,
  valor_cents INTEGER NOT NULL,
  metodo      TEXT NOT NULL,
  order_id    TEXT,
  status      TEXT NOT NULL DEFAULT 'pendente',
  criado_em   TEXT NOT NULL,
  pago_em     TEXT
);
CREATE INDEX IF NOT EXISTS idx_compras_tokens_order ON compras_tokens (order_id);
CREATE INDEX IF NOT EXISTS idx_compras_tokens_user ON compras_tokens (user_id, criado_em);
