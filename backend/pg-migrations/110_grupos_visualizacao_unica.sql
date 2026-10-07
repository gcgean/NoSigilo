-- 110: grupos — foto de visualização única (cada membro abre uma vez) e
-- silenciar as notificações do grupo (por membro).
ALTER TABLE event_group_messages ADD COLUMN is_view_once INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_group_members ADD COLUMN notificacoes_silenciadas INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS event_group_message_views (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
