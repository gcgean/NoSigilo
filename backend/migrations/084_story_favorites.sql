-- 084: stories para favoritos ("melhores amigos" do Instagram).
-- Espelho do arquivo em pg-migrations/ — ver la o porque de cada decisao.
--
-- Diferenca de dialeto: o SQLite nao aceita IF NOT EXISTS no ADD COLUMN. Como
-- o runner grava cada arquivo em _migrations e nunca reaplica, rodar uma vez
-- so ja e garantido.

CREATE TABLE IF NOT EXISTS story_favorites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, favorite_id)
);

CREATE INDEX IF NOT EXISTS idx_story_favorites_owner ON story_favorites (owner_id, favorite_id);

ALTER TABLE stories ADD COLUMN audience TEXT;
