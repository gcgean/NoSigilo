-- 128: quanto tempo cada pessoa assistiu cada vídeo (área de Vídeos / Reels).
-- É o sinal principal do "Para você": ficar mais tempo, ver até o fim ou
-- rever = gostou. assistido_ms soma todas as vezes (rever passa da duração);
-- completou conta quantas vezes chegou ao fim; vezes = quantas sessões.
CREATE TABLE IF NOT EXISTS video_assistido (
  user_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  assistido_ms INTEGER NOT NULL DEFAULT 0,
  duracao_ms INTEGER NOT NULL DEFAULT 0,
  completou INTEGER NOT NULL DEFAULT 0,
  vezes INTEGER NOT NULL DEFAULT 0,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_video_assistido_post ON video_assistido(post_id);
