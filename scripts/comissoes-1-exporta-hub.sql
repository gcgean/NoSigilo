-- PASSO 1 de 3 — roda no banco do HUB (Central_pagamentos).
--
-- Exporta todo pagamento CONFIRMADO, por cliente e por mes. E a fonte da
-- verdade sobre quem pagou o que: o NoSigilo nao guarda historico de
-- pagamento, so o estado atual do acesso.
--
--   docker exec -i <container-do-postgres-do-hub> sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' \
--     < scripts/comissoes-1-exporta-hub.sql > /tmp/pagamentos-hub.csv
--
-- Confira o nome do container com `docker ps` antes de rodar — nao e o
-- nosigilo-postgres, e o do hub de pagamentos.
--
-- NAO escreve nada.
--
-- O que conta como pagamento confirmado:
--
--   status = 'captured'   o dinheiro entrou (o enum tem pending, authorized,
--                         captured, failed, refunded — so captured liquidou).
--   refunded_at IS NULL   estorno depois some com a comissao; ver o passo 3,
--                         que trata isso.
--
-- O mes vem de COALESCE(captured_at, created_at): captured_at e a data real da
-- liquidacao, e created_at so cobre registro antigo sem essa coluna
-- preenchida. Usar created_at direto jogaria um pagamento liquidado no dia 1
-- para o mes anterior, e o promotor perderia um ciclo.
--
-- product_id vai junto porque o hub atende mais de um produto: quem for
-- conferir do lado do NoSigilo filtra pelo hub_product_id do proprio usuario.

\pset format csv
\pset tuples_only off

SELECT
  p.customer_id::text                                          AS hub_customer_id,
  COALESCE(s.product_id, o.product_id)::text                   AS hub_product_id,
  to_char(COALESCE(p.captured_at, p.created_at), 'YYYY-MM')    AS periodo,
  COUNT(*)                                                     AS pagamentos,
  SUM(p.amount)                                                AS total_centavos,
  MIN(COALESCE(p.captured_at, p.created_at))::date             AS primeiro_do_mes
FROM payments p
JOIN charges  c ON c.id = p.charge_id
JOIN invoices i ON i.id = c.invoice_id
LEFT JOIN subscriptions s ON s.id = i.subscription_id
LEFT JOIN orders        o ON o.id = i.order_id
WHERE p.status = 'captured'
  AND p.refunded_at IS NULL
GROUP BY 1, 2, 3
ORDER BY 1, 3;
