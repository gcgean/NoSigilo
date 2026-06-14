-- Respostas a stories viram mensagem no chat (estilo Instagram).
-- story_id referencia o story respondido, para renderizar a prévia na conversa.
ALTER TABLE messages ADD COLUMN story_id TEXT;
