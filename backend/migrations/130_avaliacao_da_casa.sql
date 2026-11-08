-- 130: avaliação d'A Casa (nota de 1 a 5 + sugestão), pedida ao sair da sala a
-- quem nunca avaliou. Uma linha por pessoa (pede uma vez só); o admin vê a média
-- e as sugestões na aba A Casa.
CREATE TABLE IF NOT EXISTS casa_avaliacoes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  noite      TEXT,
  nota       INTEGER NOT NULL,
  sugestao   TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_casa_avaliacoes_user ON casa_avaliacoes (user_id);
CREATE INDEX IF NOT EXISTS idx_casa_avaliacoes_created ON casa_avaliacoes (created_at DESC);
