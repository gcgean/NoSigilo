-- Marca exclusão real de conta (distinto de desativação por admin ou pausa
-- do próprio usuário, que reativa sozinha no próximo login).
ALTER TABLE users ADD COLUMN deleted_at TEXT;
