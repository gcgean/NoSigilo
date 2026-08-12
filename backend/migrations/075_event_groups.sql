-- Grupo-por-evento: RSVP real (event_attendees) + chat de grupo (event_groups/
-- event_group_members/event_group_messages). O grupo nasce na primeira confirmação
-- de presença e expira alguns dias após a data do evento (limpo pelo scheduler).
CREATE TABLE IF NOT EXISTS event_attendees (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(event_id, user_id),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_groups (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  UNIQUE(group_id, user_id),
  FOREIGN KEY(group_id) REFERENCES event_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_group_messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT,
  media_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(group_id) REFERENCES event_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_group ON event_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_user ON event_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_group_messages_group ON event_group_messages(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_event_groups_expires ON event_groups(expires_at);
