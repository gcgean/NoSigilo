-- Registro de cada geração de PIX/checkout, para medir abandono (gerou o PIX mas
-- não pagou). O checkout até então não gravava nada — só devolvia o código ao
-- navegador —, então esta métrica passa a valer a partir do deploy desta tabela.
-- A conversão NÃO é gravada aqui: é derivada no momento da consulta pelo estado
-- atual do usuário (is_premium / hub_access_status), evitando depender do webhook.
CREATE TABLE IF NOT EXISTS checkout_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  plan_id TEXT,
  billing_type TEXT,
  order_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkout_gen_created ON checkout_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_gen_user ON checkout_generations(user_id);
