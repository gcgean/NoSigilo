-- 107: indice da contagem de pedidos de contato (criado em producao em 04/10/2026
-- com CONCURRENTLY). O contador de nao lidas roda a cada poucos segundos por
-- usuario e varria as 65 mil conversas por pedido_para (36 ms -> 0,3 ms).
CREATE INDEX IF NOT EXISTS idx_conv_pedido_para ON conversations (pedido_para) WHERE pedido_para IS NOT NULL;
