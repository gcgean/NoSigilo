-- Convites passam a ser multi-uso (vários cadastros por link, como a UI promete).
-- Antes, o primeiro cadastro virava o status para 'approved' e travava o link.
-- Reativa os links já travados: 'approved' volta a ser 'created' (ativo).
-- Links revogados permanecem revogados.
UPDATE invite_links SET status = 'created' WHERE status = 'approved';
