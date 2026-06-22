-- Reações "safadas" em mensagens do chat (estilo Instagram).
-- Permite reagir a qualquer mensagem (em especial respostas a stories) com as
-- mesmas reações do feed: heart, love, wow, devil, fire, splash.
ALTER TABLE messages ADD COLUMN reaction TEXT;
