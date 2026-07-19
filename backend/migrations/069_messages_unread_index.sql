-- Índice parcial para a contagem de não lidas em GET /api/conversations.
-- Aquela query roda uma subquery por conversa contando mensagens com
-- is_read = 0, e o índice existente (idx_messages_conv) só cobre
-- conversation_id — obrigando a varrer todas as mensagens da conversa para
-- contar as poucas não lidas. O índice parcial indexa apenas as linhas com
-- is_read = 0, que são uma fração mínima da tabela.
-- Índices não alteram resultado de query, apenas a velocidade — mudança segura.
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, sender_id) WHERE is_read = 0;
