-- 084: stories para favoritos ("melhores amigos" do Instagram).
--
-- Duas coisas, que so fazem sentido juntas:
--
--   1. story_favorites — a lista de favoritos de cada pessoa. E unidirecional
--      e privada: quem entra na sua lista nao e avisado, e nao ve quem mais
--      esta nela. Igual ao Instagram, e pelo mesmo motivo: a lista so serve
--      para decidir quem ve o que voce postar.
--
--   2. stories.audience — 'favorites' quando o story e restrito, NULL (ou
--      'all') quando e publico. NULL e o default de proposito: todo story que
--      ja existe no banco foi postado sem restricao, e ler NULL como publico
--      mantem o comportamento deles sem precisar de UPDATE nenhum.
--
-- A checagem de quem pode ver acontece na leitura do feed, contra a lista NO
-- MOMENTO da leitura — nao contra uma copia congelada na hora do post. Ou
-- seja: tirar alguem dos favoritos tira o acesso aos stories restritos que
-- ainda estao no ar. E o que a pessoa espera de um botao chamado "remover".

CREATE TABLE IF NOT EXISTS story_favorites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, favorite_id)
);

-- O feed pergunta sempre "fulano esta na lista de beltrano?", nesta ordem.
CREATE INDEX IF NOT EXISTS idx_story_favorites_owner ON story_favorites (owner_id, favorite_id);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS audience TEXT;
