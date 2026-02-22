-- SQLite doesn't support DROP NOT NULL easily. 
-- We'll recreate the table if needed, but for now let's try to just update the schema if possible.
-- Since this is a development project, we can recreate the table.

CREATE TABLE messages_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT, -- Made nullable
  media_id TEXT,
  is_view_once INTEGER DEFAULT 0,
  is_delivered INTEGER DEFAULT 1,
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO messages_new (id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, is_read, created_at)
SELECT id, conversation_id, sender_id, content, media_id, is_view_once, is_delivered, is_read, created_at FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;
