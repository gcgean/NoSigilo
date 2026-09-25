-- 099: mural do perfil (recado publico, so aparece depois que o dono aprova).
CREATE TABLE IF NOT EXISTS profile_mural (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pendente',
  created_at   TEXT NOT NULL,
  decidido_em  TEXT
);
