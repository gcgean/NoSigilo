-- 109: moderação dos grupos de evento (como no Telegram).
-- Quem criou o evento é o dono (role 'organizer'); ele pode promover outros a
-- 'moderator'. Moderação: apagar mensagem, fixar, silenciar, remover e banir.
ALTER TABLE event_group_messages ADD COLUMN reply_to_id TEXT;
ALTER TABLE event_groups ADD COLUMN pinned_message_id TEXT;
ALTER TABLE event_group_members ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS event_group_bans (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  banned_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_group_bans_user ON event_group_bans(user_id);
