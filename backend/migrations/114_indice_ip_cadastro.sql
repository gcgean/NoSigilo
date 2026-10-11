-- 114: relatório de visitantes do admin comparava cada visitante com todos os
-- usuários por registration_ip_hash sem índice (~2,5 min por abertura, e o banco
-- inteiro ficava lento). Criado em produção em 11/10/2026 com CONCURRENTLY.
CREATE INDEX IF NOT EXISTS idx_users_registration_ip_hash ON users (registration_ip_hash) WHERE registration_ip_hash IS NOT NULL;
