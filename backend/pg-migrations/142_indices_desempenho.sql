-- Desempenho (20/11/2026). story_comments não tinha índice nenhum além da PK:
-- a contagem de comentários de cada story em /api/stories/me e a busca do
-- comentário de cada viewer varriam a tabela inteira (1,5 milhão de varreduras).
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments (story_id, commenter_id, created_at);
-- post_views (5,8 milhões de linhas) só passava pelo autovacuum a cada ~6 dias
-- com o padrão de 20%; sem vacuum o índice viewer+post volta ao heap e o feed
-- fica mais lento. 2% = a cada ~115 mil linhas mortas.
ALTER TABLE post_views SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
