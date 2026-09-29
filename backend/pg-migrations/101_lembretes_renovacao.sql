-- 101: lembretes de renovação e campanha de volta.
-- Uma linha por envio. A chave única (user_id, tipo, referencia) garante que o
-- mesmo lembrete não sai duas vezes para a mesma licença, mesmo se a rotina
-- rodar de novo ou o servidor reiniciar.
--   tipo: d3 (3 dias antes) | d0 (dia do vencimento) | volta1 | volta2
--   referencia: data de fim da licença (lembretes) ou nome da campanha (volta)
CREATE TABLE IF NOT EXISTS lembretes_renovacao (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  tipo         TEXT NOT NULL,
  referencia   TEXT NOT NULL,
  enviado_em   TEXT NOT NULL,
  status       TEXT NOT NULL,
  erro         TEXT,
  push_enviado INTEGER NOT NULL DEFAULT 0,
  aberto_em    TEXT,
  clicado_em   TEXT,
  renovou_em   TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lembretes_renovacao ON lembretes_renovacao (user_id, tipo, referencia);
CREATE INDEX IF NOT EXISTS idx_lembretes_renovacao_user ON lembretes_renovacao (user_id, enviado_em);
