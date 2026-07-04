-- Responder a uma mensagem já recebida no chat (estilo WhatsApp).
-- reply_to_message_id referencia a mensagem citada.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT;
