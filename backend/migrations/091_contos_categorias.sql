-- 091: contos eróticos com categoria, revisão do admin e controle de lidos.
--
-- categoria        slug de CATEGORIAS_CONTOS (backend/src/contos.ts); NULL nos
--                  contos antigos, até o admin classificar
-- status           'publicado' ou 'em_revisao' (escondido de todos, menos do
--                  autor e do admin, até o admin decidir)
-- revisao_motivo   por que foi para a revisão (ex.: "idade abaixo de 18 anos")

ALTER TABLE experiences ADD COLUMN categoria TEXT;
ALTER TABLE experiences ADD COLUMN status TEXT NOT NULL DEFAULT 'publicado';
ALTER TABLE experiences ADD COLUMN revisao_motivo TEXT;
CREATE INDEX IF NOT EXISTS idx_experiences_categoria ON experiences (categoria);
CREATE INDEX IF NOT EXISTS idx_experiences_status ON experiences (status);

-- Quem já leu qual conto (abriu "Ler conto completo"). Fica no servidor para
-- valer em qualquer aparelho.
CREATE TABLE IF NOT EXISTS experience_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experience_id TEXT NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, experience_id)
);
CREATE INDEX IF NOT EXISTS idx_experience_reads_exp ON experience_reads (experience_id);
