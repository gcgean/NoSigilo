-- 127: "Não ver mais stories de Fulano". Quem ocultou deixa de ver os stories
-- daquele perfil (barra do feed, aba Stories, não vistos); o perfil não fica
-- sabendo e nada mais muda (perfil, conversa, seguir). Desfaz em Configurações.
CREATE TABLE IF NOT EXISTS story_ocultos (
  owner_id TEXT NOT NULL,
  hidden_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, hidden_user_id)
);
CREATE INDEX IF NOT EXISTS idx_story_ocultos_hidden ON story_ocultos(hidden_user_id);
