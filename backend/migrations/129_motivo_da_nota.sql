-- 129: motivo da nota baixa do app. motivos = opções de 1 toque (slugs
-- separados por vírgula, ver MOTIVOS_NOTA em app.ts); motivo_pedido_em =
-- quando perguntamos de novo o motivo a quem deu nota baixa sem explicar
-- (pergunta uma vez só, respondendo ou dispensando).
ALTER TABLE app_ratings ADD COLUMN motivos TEXT;
ALTER TABLE app_ratings ADD COLUMN motivo_pedido_em TEXT;
