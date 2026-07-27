-- Registra em qual página do app o usuário estava quando gerou o PIX, para
-- saber quais telas mais levam a assinatura (ex.: Chat, Feed, Perfil de outro
-- usuário). Gerações anteriores a esta migration ficam com page_path NULL —
-- o dado só passa a existir a partir do deploy.
ALTER TABLE checkout_generations ADD COLUMN page_path TEXT;

CREATE INDEX IF NOT EXISTS idx_checkout_gen_page ON checkout_generations(page_path);
