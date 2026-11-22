-- Novelinhas (22/11/2026): episódios de histórias narradas. Quem não tem conta vê o
-- trecho (trailer); quem tem conta vê o episódio inteiro.
CREATE TABLE IF NOT EXISTS novelinhas (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  capa_media_id TEXT,
  video_media_id TEXT,
  trailer_media_id TEXT,
  duracao_seg INTEGER NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  publicado INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS novelinha_views (
  user_id TEXT NOT NULL,
  novelinha_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, novelinha_id)
);
