-- 111: até onde cada membro leu o grupo (para "mensagens novas" na aba Grupos).
ALTER TABLE event_group_members ADD COLUMN last_read_at TEXT;
-- Quem já está nos grupos começa com tudo lido (senão o histórico inteiro
-- apareceria como "novo" no dia do deploy).
UPDATE event_group_members SET last_read_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE last_read_at IS NULL;
