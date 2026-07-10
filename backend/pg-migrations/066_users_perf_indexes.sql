-- Índices de performance na tabela users (antes só existia a PK em id, apesar de
-- users ser a tabela mais filtrada do app). Aceleram os caminhos quentes:
--   • last_seen_at  → reengajamento, usuários ativos/online, recência no feed
--   • created_at    → analytics de cadastro e ordenação por data
--   • (lat, lon)    → feed por proximidade (bounding box)
-- Índices não alteram resultado de query, apenas a velocidade — mudança segura.
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(lat, lon);
