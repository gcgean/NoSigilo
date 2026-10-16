-- 121: novos usos de tokens (super curtida, disponível hoje, story e evento em destaque, presentes no chat).
ALTER TABLE likes ADD COLUMN super_at TEXT;
ALTER TABLE users ADD COLUMN disponivel_ate TEXT;
ALTER TABLE stories ADD COLUMN destaque_ate TEXT;
ALTER TABLE events ADD COLUMN destaque_ate TEXT;
ALTER TABLE messages ADD COLUMN presente TEXT;
