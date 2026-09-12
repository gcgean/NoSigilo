-- PASSO 1 de 3 — roda no banco do HUB (Central_pagamentos).
--
-- Exporta todo pagamento CONFIRMADO, por cliente e por mes. E a fonte da
-- verdade sobre quem pagou o que: o NoSigilo nao guarda historico de
-- pagamento, so o estado atual do acesso.
--
--   docker exec -i hub_billing_postgres_prod sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB --csv -f -' \
--     < scripts/comissoes-1-exporta-hub.sql > /tmp/pagamentos-hub.csv
--
-- O container e o do HUB (hub_billing_postgres_prod), nao o nosigilo-postgres.
-- Confira que esta no ar antes:
--
--   docker ps --filter name=hub_billing_postgres_prod
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

-- O formato CSV vem do --csv na linha de comando, NAO de um \pset aqui dentro.
--
-- Motivo: \pset imprime "Output format is csv." no stdout, e como a saida toda
-- e redirecionada para o arquivo, essa frase virava a PRIMEIRA LINHA do CSV,
-- antes do cabecalho. O \copy do passo 2 entao lia "Output format is csv."
-- como se fosse o cabecalho e quebrava. Com --csv nenhum comando de barra
-- imprime nada e o arquivo comeca direto no cabecalho.

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
