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

-- ─────────────────────────────────────────────────────────────────────────
-- DUAS FONTES, porque a Stripe nao passa pela tabela payments.
--
-- Mercado Pago / Asaas / LivePix: o hub cria fatura, cobranca e pagamento, e
-- cada pagamento confirmado vira uma linha em payments com status 'captured'.
--
-- Stripe (recorrencia nativa): a Stripe cobra o cartao sozinha a cada ciclo e
-- so avisa com invoice.paid. O hub traduz para 'subscription.renewed', ativa a
-- assinatura e renova a licenca — e NAO grava nada em payments nem em charges.
-- O unico registro de que entrou dinheiro e o proprio webhook guardado em
-- webhook_events.
--
-- A primeira versao deste script lia so payments e, por isso, nao enxergava
-- NENHUM pagamento da Stripe. Foi o que fez o bloco 4 do diagnostico de
-- 12/09/2026 apontar 4 comissoes "sem pagamento": eram assinantes Stripe
-- pagantes, com licenca de origem 'subscription' ativa.
--
-- Nao ha risco de contar o mesmo pagamento duas vezes: Stripe avulsa
-- (checkout sem assinatura) segue pelo fluxo de fatura e aparece so na
-- primeira parte; recorrencia aparece so na segunda. E webhook_events tem
-- UNIQUE (gateway_name, external_event_id), entao reentrega da Stripe nao
-- duplica linha.

WITH todos AS (
  -- 1) Fluxo de fatura: MP, Asaas, LivePix, Stripe avulsa.
  SELECT
    p.customer_id                                    AS customer_id,
    COALESCE(s.product_id, o.product_id)             AS product_id,
    COALESCE(p.captured_at, p.created_at)            AS pago_em,
    p.amount::bigint                                 AS centavos
  FROM payments p
  JOIN charges  c ON c.id = p.charge_id
  JOIN invoices i ON i.id = c.invoice_id
  LEFT JOIN subscriptions s ON s.id = i.subscription_id
  LEFT JOIN orders        o ON o.id = i.order_id
  WHERE p.status = 'captured'
    AND p.refunded_at IS NULL

  UNION ALL

  -- 2) Recorrencia Stripe: so existe como webhook.
  SELECT
    s.customer_id,
    s.product_id,
    -- created da fatura na Stripe (epoch em segundos); cai para a chegada do
    -- webhook quando o campo nao vier.
    COALESCE(
      to_timestamp(NULLIF(w.payload #>> '{data,object,created}', '')::bigint),
      w.created_at
    )                                                AS pago_em,
    COALESCE(NULLIF(w.payload #>> '{data,object,amount_paid}', '')::bigint, 0) AS centavos
  FROM webhook_events w
  JOIN subscriptions s
    ON s.external_subscription_id = COALESCE(
         NULLIF(w.payload ->> 'externalSubscriptionId', ''),
         NULLIF(w.payload #>> '{data,object,subscription}', ''),
         NULLIF(w.payload #>> '{data,object,parent,subscription_details,subscription}', '')
       )
  WHERE w.gateway_name = 'stripe'
    AND w.event_type = 'subscription.renewed'
    -- Fatura de R$ 0 (cupom, periodo de teste da Stripe) nao e pagamento.
    AND COALESCE(NULLIF(w.payload #>> '{data,object,amount_paid}', '')::bigint, 0) > 0
)
SELECT
  customer_id::text                    AS hub_customer_id,
  product_id::text                     AS hub_product_id,
  to_char(pago_em, 'YYYY-MM')          AS periodo,
  COUNT(*)                             AS pagamentos,
  SUM(centavos)                        AS total_centavos,
  MIN(pago_em)::date                   AS primeiro_do_mes
FROM todos
GROUP BY 1, 2, 3
ORDER BY 1, 3;
