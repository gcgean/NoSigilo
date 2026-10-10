-- 111: até onde cada membro leu o grupo (para "mensagens novas" na aba Grupos).
ALTER TABLE event_group_members ADD COLUMN last_read_at TEXT;
-- Quem já está nos grupos começa com tudo lido (senão o histórico inteiro
-- apareceria como "novo" no dia do deploy).
UPDATE event_group_members SET last_read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE last_read_at IS NULL;
