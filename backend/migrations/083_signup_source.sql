-- De qual pagina veio o cadastro.
--
-- As paginas regionais de SEO (/swing/<estado>/ e /swing/<estado>/<cidade>/)
-- levam ao cadastro com ?origem=..., e o valor normalizado fica aqui. Serve
-- para responder a pergunta que justifica o trabalho todo de SEO: essas
-- paginas trazem gente que se cadastra, ou so trazem visita?
--
-- NULL significa cadastro pelo caminho principal do site — quem chegou pela
-- home, por link direto ou por convite. Nao e ausencia de dado: e a origem
-- mais comum, e distingui-la das regionais e justamente o ponto.
--
-- O formato e o caminho da pagina, com barras nas pontas:
--   /swing/ceara/fortaleza/   pagina de cidade
--   /swing/ceara/             pagina de estado
--   /swing/                   hub de estados
-- O backend valida contra esse formato antes de gravar e descarta o resto,
-- para a coluna nao virar deposito de lixo de campanha.
ALTER TABLE users ADD COLUMN signup_source TEXT;

-- O relatorio do admin agrupa por essa coluna e filtra "veio de pagina
-- regional" com signup_source IS NOT NULL. Indice parcial porque a esmagadora
-- maioria das linhas e NULL e nao precisa entrar no indice.
CREATE INDEX IF NOT EXISTS idx_users_signup_source ON users(signup_source);
