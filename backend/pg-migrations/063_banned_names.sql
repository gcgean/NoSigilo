-- Lista negra de nomes de perfil. Quando um perfil é banido, o nome dele entra
-- aqui e ninguém mais pode criar/usar esse nome na plataforma.
CREATE TABLE IF NOT EXISTS banned_names (
  name_lower TEXT PRIMARY KEY,
  original_name TEXT,
  banned_user_id TEXT,
  created_at TEXT NOT NULL
);
