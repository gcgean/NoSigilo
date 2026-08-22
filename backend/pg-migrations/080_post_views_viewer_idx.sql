-- O feed passa a excluir do candidato os posts que o viewer já viu, via
-- NOT EXISTS em post_views. Sem um índice por viewer_id essa checagem varre a
-- tabela inteira (>100k linhas) a cada carregamento de feed.
CREATE INDEX IF NOT EXISTS idx_post_views_viewer_post ON post_views(viewer_id, post_id);
