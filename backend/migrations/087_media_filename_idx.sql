-- 087: índices que faltavam em media e site_visits (CPU do Postgres em ~465%).
-- GET /uploads/:filename busca a mídia por nome de arquivo a CADA imagem/vídeo
-- servido. Sem índice, cada busca varria a tabela inteira: 11 mi de varreduras,
-- 92,9 bi de linhas lidas (pg_stat_user_tables).
CREATE INDEX IF NOT EXISTS idx_media_filename ON media(filename);
-- As métricas do admin (Visitas / conversão) filtram site_visits por período;
-- o índice existente começa por user_id e não serve para isso.
CREATE INDEX IF NOT EXISTS idx_site_visits_created ON site_visits(created_at);
