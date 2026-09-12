-- 085: fixar perfis nos stories ("acompanhar como fa").
-- Espelho do arquivo em pg-migrations/ — ver la o porque de cada decisao.
--
-- CUIDADO ao ler junto com a 084: sao listas em sentidos opostos, e misturar
-- as duas e o erro facil de cometer aqui.
--
--   story_favorites (084)  eu -> quem PODE VER o que eu posto.
--                          Decide quem enxerga meu story restrito.
--                          Na tela: "Favoritos", estrela verde.
--
--   story_pins      (085)  eu -> quem eu QUERO VER primeiro.
--                          Nao muda permissao nenhuma; so muda a ordem da
--                          MINHA fileira. A pessoa fixada nao fica sabendo.
--                          Na tela: "Fixados", alfinete.
--
-- Uma nao implica a outra: da para fixar quem nunca vai ver meus stories, e
-- da para ter alguem nos favoritos sem nunca fixar essa pessoa.

CREATE TABLE IF NOT EXISTS story_pins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, pinned_user_id)
);

-- O feed de stories pergunta "este autor esta fixado por mim?" uma vez por
-- fileira, nesta ordem de colunas.
CREATE INDEX IF NOT EXISTS idx_story_pins_user ON story_pins (user_id, pinned_user_id);
