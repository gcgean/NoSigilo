-- PASSO 3 de 3 — ESCREVE NO BANCO. Rode o passo 2 antes e confira os numeros.
--
--   docker cp /tmp/pagamentos-hub.csv nosigilo-postgres:/tmp/pagamentos-hub.csv
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 -f -' \
--     < scripts/comissoes-3-aplica.sql
--
-- Cria as comissoes que faltam, com event_type = 'backfill_renovacao' para dar
-- para separar depois do que o sistema gerou sozinho.
--
-- A logica de quanto falta e IDENTICA a do passo 2 (contagem por assinante,
-- nao casamento por mes — ver a explicacao longa la). Se mexer em uma, mexa
-- na outra.
--
-- Elas nascem como 'approved', nao 'pending'. 'pending' e o prazo de estorno,
-- e esses pagamentos aconteceram ha meses — segurar de novo seria adiar pela
-- segunda vez um dinheiro que ja estava atrasado. O passo 1 ja exclui o que
-- foi estornado.
--
-- ISTO NAO PAGA NINGUEM. So credita o saldo. O Pix continua saindo pelo botao
-- "Pagar" do admin, respeitando o minimo de R$ 10,00 acumulado.
--
-- Re-executavel: o que ja existe nao e recontado, e a partir da migracao 086 o
-- indice unico (subscriber_user_id, period) recusa duplicata mesmo se algo
-- escapar. Rodar duas vezes nao credita duas vezes.

\set ON_ERROR_STOP on

CREATE TEMP TABLE hub_pagamentos (
  hub_customer_id  TEXT,
  hub_product_id   TEXT,
  periodo          TEXT,
  pagamentos       INTEGER,
  total_centavos   BIGINT,
  primeiro_do_mes  DATE
);

\copy hub_pagamentos FROM '/tmp/pagamentos-hub.csv' WITH (FORMAT csv, HEADER true)

BEGIN;

CREATE TEMP TABLE vinculo AS
SELECT DISTINCT ON (e.invitee_user_id)
  e.invitee_user_id  AS assinante_user_id,
  l.inviter_user_id  AS promotor_user_id
FROM invite_link_entries e
JOIN invite_links l ON l.id = e.invite_link_id
JOIN promoters p    ON p.user_id = l.inviter_user_id AND p.status = 'active'
ORDER BY e.invitee_user_id, e.created_at;

CREATE TEMP TABLE pagamentos_do_assinante AS
SELECT
  v.assinante_user_id,
  v.promotor_user_id,
  hp.periodo,
  SUM(hp.total_centavos)  AS total_centavos
FROM hub_pagamentos hp
JOIN users u     ON u.hub_customer_id = hp.hub_customer_id
                AND (u.hub_product_id IS NULL OR u.hub_product_id = hp.hub_product_id)
JOIN vinculo v   ON v.assinante_user_id = u.id
JOIN promoters p ON p.user_id = v.promotor_user_id
WHERE hp.primeiro_do_mes >= p.activated_at::date
GROUP BY 1, 2, 3;

CREATE TEMP TABLE falta_por_assinante AS
SELECT
  pa.assinante_user_id,
  pa.promotor_user_id,
  COUNT(*) - COALESCE(c.comissoes, 0) AS faltando
FROM pagamentos_do_assinante pa
LEFT JOIN (
  SELECT subscriber_user_id, COUNT(*) AS comissoes
  FROM promoter_commissions WHERE status <> 'cancelled'
  GROUP BY subscriber_user_id
) c ON c.subscriber_user_id = pa.assinante_user_id
GROUP BY pa.assinante_user_id, pa.promotor_user_id, c.comissoes;

CREATE TEMP TABLE a_creditar AS
WITH candidatos AS (
  SELECT pa.*,
         ROW_NUMBER() OVER (PARTITION BY pa.assinante_user_id ORDER BY pa.periodo DESC) AS ordem
  FROM pagamentos_do_assinante pa
  WHERE NOT EXISTS (
    SELECT 1 FROM promoter_commissions pc
    WHERE pc.subscriber_user_id = pa.assinante_user_id
      AND pc.period = pa.periodo
      AND pc.status <> 'cancelled'
  )
)
SELECT c.promotor_user_id, c.assinante_user_id, c.periodo, c.total_centavos,
       ROUND(c.total_centavos * 0.20)::bigint AS comissao_devida
FROM candidatos c
JOIN falta_por_assinante f ON f.assinante_user_id = c.assinante_user_id
WHERE f.faltando > 0 AND c.ordem <= f.faltando;

\echo '=== Vai criar ==='
SELECT COUNT(*) AS comissoes,
       COUNT(DISTINCT promotor_user_id) AS promotores,
       'R$ ' || to_char(SUM(comissao_devida) / 100.0, 'FM999G990D00') AS total
FROM a_creditar;

INSERT INTO promoter_commissions (
  id, promoter_user_id, subscriber_user_id, subscription_amount,
  commission_amount, status, period, event_type, created_at
)
SELECT
  gen_random_uuid()::text,
  promotor_user_id,
  assinante_user_id,
  total_centavos,
  comissao_devida,
  'approved',
  periodo,
  'backfill_renovacao',
  now()::text
FROM a_creditar;

\echo
\echo '=== Saldo por promotor depois do credito ==='
SELECT
  pr.full_name AS promotor,
  pr.pix_key   AS pix,
  'R$ ' || to_char(COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) / 100.0, 'FM999G990D00') AS aprovado,
  CASE WHEN COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) >= 1000
       THEN 'PAGAR' ELSE 'abaixo do minimo' END AS situacao
FROM promoters pr
JOIN promoter_commissions pc ON pc.promoter_user_id = pr.user_id
WHERE pr.user_id IN (SELECT promotor_user_id FROM a_creditar)
GROUP BY pr.user_id, pr.full_name, pr.pix_key
ORDER BY COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) DESC;

COMMIT;

-- --------------------------------------------------------------- desfaz ---
-- Se algo saiu errado, isto apaga exatamente o que este script criou (e nada
-- do que o sistema gerou sozinho):
--
--   DELETE FROM promoter_commissions WHERE event_type = 'backfill_renovacao';
--
-- Enquanto nenhum desses saldos tiver sido pago. Depois do botao "Pagar" as
-- linhas viram 'paid' e apagar passaria a esconder dinheiro que saiu de
-- verdade — ai a correcao tem de ser manual, comissao por comissao.
