-- Desempenho (20/11/2026): story_comments sem índice por story. (O ajuste de
-- autovacuum de post_views só existe na versão Postgres.)
CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments (story_id, commenter_id, created_at);
