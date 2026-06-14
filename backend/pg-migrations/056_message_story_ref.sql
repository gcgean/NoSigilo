-- Respostas a stories viram mensagem no chat (estilo Instagram).
-- story_id referencia o story respondido, para renderizar a prévia na conversa.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_id TEXT;
