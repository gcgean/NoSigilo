-- Marca mensagens originadas de um broadcast de Radar de Disponibilidade.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS via_radar INTEGER DEFAULT 0;
