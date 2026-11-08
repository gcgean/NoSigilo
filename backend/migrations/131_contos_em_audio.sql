-- 131: contos e experiências em áudio. Cada conto pode ter até 5 partes de
-- áudio (até 3 min cada). transcricao vem do serviço de voz-para-texto (quando
-- configurado) e serve para a moderação e para a busca. disfarcada = a pessoa
-- pediu para disfarçar a voz (o arquivo já sobe disfarçado).
CREATE TABLE IF NOT EXISTS experience_audios (
  id            TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  media_id      TEXT NOT NULL,
  ordem         INTEGER NOT NULL DEFAULT 0,
  duracao_seg   INTEGER NOT NULL DEFAULT 0,
  disfarcada    INTEGER NOT NULL DEFAULT 0,
  transcricao   TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_experience_audios_exp ON experience_audios (experience_id, ordem);
