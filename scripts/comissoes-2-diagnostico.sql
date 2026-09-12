-- PASSO 2 de 3 — roda no banco do NOSIGILO. NAO escreve nada em producao.
--
-- Cruza os pagamentos exportados do hub (passo 1) com as comissoes que
-- existem, e mostra quanto cada promotor deixou de receber por causa do bug
-- que dava uma comissao unica por assinante em vez de uma por mes.
--
-- Antes de rodar, leve o CSV para dentro do container:
--
--   docker cp /tmp/pagamentos-hub.csv nosigilo-postgres:/tmp/pagamentos-hub.csv
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' \
--     < scripts/comissoes-2-diagnostico.sql
--
-- A tabela de trabalho e TEMP: some quando a sessao do psql fecha. Rodar isto
-- nao deixa rastro no banco.

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

\echo '=== 0. O que veio no arquivo ==='
SELECT COUNT(*) AS linhas, COUNT(DISTINCT hub_customer_id) AS clientes,
       MIN(periodo) AS do_mes, MAX(periodo) AS ate_o_mes
FROM hub_pagamentos;

-- Cada pagamento confirmado de um assinante que veio pelo convite de um
-- promotor ATIVO na epoca. O vinculo assinante->promotor e o mesmo que o
-- backend usa: invite_link_entries -> invite_links.inviter_user_id.
CREATE TEMP TABLE devido AS
SELECT
  p.user_id                                   AS promotor_user_id,
  u.id                                        AS assinante_user_id,
  hp.periodo,
  hp.total_centavos                           AS pago_centavos,
  -- 20% do que o assinante pagou naquele mes, a mesma conta do backend
  -- (Math.round(subAmount * 0.20)).
  ROUND(hp.total_centavos * 0.20)::bigint     AS comissao_devida
FROM hub_pagamentos hp
JOIN users u
  ON u.hub_customer_id = hp.hub_customer_id
 -- O hub atende mais de um produto: so conta o pagamento do produto que ESTE
 -- usuario assina no NoSigilo.
 AND (u.hub_product_id IS NULL OR u.hub_product_id = hp.hub_product_id)
JOIN invite_link_entries e ON e.invitee_user_id = u.id
JOIN invite_links l        ON l.id = e.invite_link_id
JOIN promoters p           ON p.user_id = l.inviter_user_id
WHERE p.status = 'active'
  -- Pagamento anterior a ativacao do promotor nao gera comissao: ele ainda
  -- nao era promotor quando aquele dinheiro entrou.
  AND hp.primeiro_do_mes >= p.activated_at::date;

\echo
\echo '=== 1. Resumo por promotor: o que ja tem x o que faltou ==='

WITH ja_existe AS (
  SELECT promoter_user_id, subscriber_user_id, period
  FROM promoter_commissions
  WHERE status <> 'cancelled'
),
faltando AS (
  SELECT d.*
  FROM devido d
  LEFT JOIN ja_existe j
    ON j.subscriber_user_id = d.assinante_user_id
   AND j.period = d.periodo
  WHERE j.subscriber_user_id IS NULL
)
SELECT
  pr.full_name                                                     AS promotor,
  pr.pix_key                                                       AS pix,
  COUNT(*)                                                         AS meses_sem_comissao,
  COUNT(DISTINCT f.assinante_user_id)                              AS assinantes_envolvidos,
  'R$ ' || to_char(SUM(f.comissao_devida) / 100.0, 'FM999G990D00') AS a_creditar,
  'R$ ' || to_char(
    COALESCE((SELECT SUM(pc.commission_amount) FROM promoter_commissions pc
              WHERE pc.promoter_user_id = pr.user_id AND pc.status = 'approved'), 0) / 100.0,
    'FM999G990D00')                                                AS aprovado_hoje,
  'R$ ' || to_char(
    (COALESCE((SELECT SUM(pc.commission_amount) FROM promoter_commissions pc
               WHERE pc.promoter_user_id = pr.user_id AND pc.status = 'approved'), 0)
     + SUM(f.comissao_devida)) / 100.0, 'FM999G990D00')            AS saldo_apos_correcao,
  -- O minimo de R$ 10,00 e sobre o acumulado, entao o que importa e o saldo
  -- DEPOIS do credito: quem nao chegava ao minimo pode passar a chegar.
  CASE
    WHEN COALESCE((SELECT SUM(pc.commission_amount) FROM promoter_commissions pc
                   WHERE pc.promoter_user_id = pr.user_id AND pc.status = 'approved'), 0)
         + SUM(f.comissao_devida) >= 1000
    THEN 'SIM' ELSE 'nao'
  END                                                              AS libera_pagamento
FROM faltando f
JOIN promoters pr ON pr.user_id = f.promotor_user_id
GROUP BY pr.user_id, pr.full_name, pr.pix_key
ORDER BY SUM(f.comissao_devida) DESC;

\echo
\echo '=== 2. Total geral a creditar ==='

WITH ja_existe AS (
  SELECT subscriber_user_id, period FROM promoter_commissions WHERE status <> 'cancelled'
)
SELECT
  COUNT(*)                                                       AS comissoes_a_criar,
  COUNT(DISTINCT d.promotor_user_id)                             AS promotores,
  'R$ ' || to_char(SUM(d.comissao_devida) / 100.0, 'FM999G990D00') AS total
FROM devido d
LEFT JOIN ja_existe j ON j.subscriber_user_id = d.assinante_user_id AND j.period = d.periodo
WHERE j.subscriber_user_id IS NULL;

\echo
\echo '=== 3. Detalhe mes a mes (confira algumas linhas antes de aplicar) ==='

WITH ja_existe AS (
  SELECT subscriber_user_id, period FROM promoter_commissions WHERE status <> 'cancelled'
)
SELECT
  pr.full_name                                            AS promotor,
  us.name                                                 AS assinante,
  d.periodo,
  'R$ ' || to_char(d.pago_centavos / 100.0, 'FM999G990D00')    AS ele_pagou,
  'R$ ' || to_char(d.comissao_devida / 100.0, 'FM999G990D00')  AS comissao
FROM devido d
LEFT JOIN ja_existe j ON j.subscriber_user_id = d.assinante_user_id AND j.period = d.periodo
JOIN promoters pr ON pr.user_id = d.promotor_user_id
JOIN users us     ON us.id = d.assinante_user_id
WHERE j.subscriber_user_id IS NULL
ORDER BY pr.full_name, d.periodo, us.name
LIMIT 100;

\echo
\echo '=== 4. Sanidade: comissoes que existem e o hub NAO explica ==='
\echo '    Esperado: as de trial/liberacao manual, que nasceram de'
\echo '    license.activated sem pagamento. Muitas linhas aqui querem'
\echo '    investigacao ANTES de creditar qualquer coisa.'

SELECT
  pr.full_name        AS promotor,
  us.name             AS assinante,
  pc.period,
  pc.status,
  pc.event_type,
  'R$ ' || to_char(pc.commission_amount / 100.0, 'FM999G990D00') AS valor
FROM promoter_commissions pc
JOIN promoters pr ON pr.user_id = pc.promoter_user_id
JOIN users us     ON us.id = pc.subscriber_user_id
LEFT JOIN devido d
  ON d.assinante_user_id = pc.subscriber_user_id AND d.periodo = pc.period
WHERE pc.status <> 'cancelled'
  AND d.assinante_user_id IS NULL
ORDER BY pr.full_name, pc.period
LIMIT 50;
