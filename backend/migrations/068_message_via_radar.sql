-- Marca mensagens originadas de um broadcast de Radar de Disponibilidade, para o
-- chat exibir "veio via radar" e oferecer ao destinatário ativar o próprio radar.
ALTER TABLE messages ADD COLUMN via_radar INTEGER DEFAULT 0;
