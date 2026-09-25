-- 099: mural do perfil.
--
-- Recado publico que alguem deixa no perfil de outra pessoa. Nasce PENDENTE e
-- so aparece depois que o dono aprova: e conteudo de terceiros no perfil de
-- alguem, e sem aprovacao vira canal de spam e assedio.
CREATE TABLE IF NOT EXISTS profile_mural (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovado | recusado
  created_at   TEXT NOT NULL,
  decidido_em  TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_mural_owner ON profile_mural (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_mural_author ON profile_mural (author_id, created_at DESC);
