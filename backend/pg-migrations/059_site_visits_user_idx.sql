-- 059: índice por usuário em site_visits.
-- As métricas/lista de reengajamento contam visitas por usuário (sv.user_id IN ...).
-- Sem este índice a tabela (grande, 1 linha por page view) era varrida inteira → timeout.
CREATE INDEX IF NOT EXISTS idx_site_visits_user_created ON site_visits(user_id, created_at);
