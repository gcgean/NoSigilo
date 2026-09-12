-- PASSO 2 de 3 — roda no banco do NOSIGILO. NAO escreve nada em producao.
--
-- Cruza os pagamentos exportados do hub (passo 1) com as comissoes que
-- existem, e mostra quanto cada promotor deixou de receber.
--
--   docker cp /tmp/pagamentos-hub.csv nosigilo-postgres:/tmp/pagamentos-hub.csv
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' \
--     < scripts/comissoes-2-diagnostico.sql
--
-- As tabelas de trabalho sao TEMP: somem quando a sessao do psql fecha.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUE NAO DA PARA CASAR PELO MES
--
-- A primeira versao deste script casava pagamento e comissao pelo periodo:
--
--     ON pc.subscriber_user_id = ... AND pc.period = hp.periodo
--
-- Isso esta errado, e errado nas DUAS direcoes ao mesmo tempo. O campo
-- `period` da comissao guarda o mes em que a comissao foi CRIADA, nao o mes
-- do pagamento:
--
--     const period = new Date().toISOString().slice(0, 7);   // app.ts
--
-- A comissao nasce pelo webhook (mesmo mes, em geral) mas tambem pelo sync de
-- acesso, que so roda no proximo login do assinante — podendo ser semanas
-- depois. Quem pagou em 30/06 e voltou ao app em 02/07 tem a comissao
-- arquivada em 2026-07.
--
-- O estrago: o mes do pagamento parecia descoberto (entrava na lista de "a
-- creditar") e o mes da comissao parecia orfao (entrava na lista de
-- "inexplicado"). Um unico pagamento virava um buraco E uma sobra. Na
-- execucao de 12/09/2026 isso aconteceu com Geisson/Sousinglepvh: pagamento em
-- 2026-06, comissao em 2026-07, contado dos dois lados.
--
-- A CORRECAO: comparar QUANTIDADES por assinante, nao meses.
--
--     faltando = (meses em que ele pagou) - (comissoes que ele ja gerou)
--
-- Robusto a qualquer defasagem de arquivamento, porque nao depende de onde a
-- comissao foi arquivada — so de quantas existem.

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

-- Quem convidou cada assinante. DISTINCT ON porque, em tese, o mesmo usuario
-- pode ter mais de uma entrada de convite; vale a mais antiga, que foi a que
-- de fato trouxe a pessoa.
CREATE TEMP TABLE vinculo AS
SELECT DISTINCT ON (e.invitee_user_id)
  e.invitee_user_id  AS assinante_user_id,
  l.inviter_user_id  AS promotor_user_id
FROM invite_link_entries e
JOIN invite_links l ON l.id = e.invite_link_id
JOIN promoters p    ON p.user_id = l.inviter_user_id AND p.status = 'active'
ORDER BY e.invitee_user_id, e.created_at;

-- Um registro por assinante e mes em que houve pagamento confirmado.
CREATE TEMP TABLE pagamentos_do_assinante AS
SELECT
  v.assinante_user_id,
  v.promotor_user_id,
  hp.periodo,
  SUM(hp.total_centavos)    AS total_centavos,
  MIN(hp.primeiro_do_mes)   AS primeiro_do_mes
FROM hub_pagamentos hp
JOIN users u    ON u.hub_customer_id = hp.hub_customer_id
               -- O hub atende mais de um produto: so o que ESTE usuario assina.
               AND (u.hub_product_id IS NULL OR u.hub_product_id = hp.hub_product_id)
JOIN vinculo v  ON v.assinante_user_id = u.id
JOIN promoters p ON p.user_id = v.promotor_user_id
-- Pagamento anterior a ativacao do promotor nao gera comissao: ele ainda nao
-- era promotor quando aquele dinheiro entrou.
WHERE hp.primeiro_do_mes >= p.activated_at::date
GROUP BY 1, 2, 3;

-- Quantos meses pagos x quantas comissoes ja existem, por assinante.
CREATE TEMP TABLE falta_por_assinante AS
SELECT
  pa.assinante_user_id,
  pa.promotor_user_id,
  COUNT(*)                                   AS meses_pagos,
  COALESCE(c.comissoes, 0)                   AS comissoes_existentes,
  COUNT(*) - COALESCE(c.comissoes, 0)        AS faltando
FROM pagamentos_do_assinante pa
LEFT JOIN (
  SELECT subscriber_user_id, COUNT(*) AS comissoes
  FROM promoter_commissions
  WHERE status <> 'cancelled'
  GROUP BY subscriber_user_id
) c ON c.subscriber_user_id = pa.assinante_user_id
GROUP BY pa.assinante_user_id, pa.promotor_user_id, c.comissoes;

-- Quais meses creditar: os pagos que ainda nao tem comissao arquivada naquele
-- mes (para nao esbarrar no indice unico da migracao 086), do mais recente
-- para o mais antigo, na quantidade que falta.
CREATE TEMP TABLE a_creditar AS
WITH candidatos AS (
  SELECT
    pa.*,
    ROW_NUMBER() OVER (PARTITION BY pa.assinante_user_id ORDER BY pa.periodo DESC) AS ordem
  FROM pagamentos_do_assinante pa
  WHERE NOT EXISTS (
    SELECT 1 FROM promoter_commissions pc
    WHERE pc.subscriber_user_id = pa.assinante_user_id
      AND pc.period = pa.periodo
      AND pc.status <> 'cancelled'
  )
)
SELECT
  c.promotor_user_id,
  c.assinante_user_id,
  c.periodo,
  c.total_centavos,
  ROUND(c.total_centavos * 0.20)::bigint AS comissao_devida
FROM candidatos c
JOIN falta_por_assinante f ON f.assinante_user_id = c.assinante_user_id
WHERE f.faltando > 0 AND c.ordem <= f.faltando;

\echo
\echo '=== 1. Resumo por promotor ==='

SELECT
  pr.full_name                                                     AS promotor,
  pr.pix_key                                                       AS pix,
  COUNT(*)                                                         AS comissoes_a_criar,
  COUNT(DISTINCT ac.assinante_user_id)                             AS assinantes,
  'R$ ' || to_char(SUM(ac.comissao_devida) / 100.0, 'FM999G990D00') AS a_creditar,
  'R$ ' || to_char(COALESCE(ap.aprovado, 0) / 100.0, 'FM999G990D00') AS aprovado_hoje,
  'R$ ' || to_char((COALESCE(ap.aprovado, 0) + SUM(ac.comissao_devida)) / 100.0, 'FM999G990D00') AS saldo_apos,
  -- O minimo de R$ 10,00 e sobre o acumulado, entao o que decide e o saldo
  -- DEPOIS do credito.
  CASE WHEN COALESCE(ap.aprovado, 0) + SUM(ac.comissao_devida) >= 1000
       THEN 'SIM' ELSE 'nao' END                                   AS libera_pagamento
FROM a_creditar ac
JOIN promoters pr ON pr.user_id = ac.promotor_user_id
LEFT JOIN (
  SELECT promoter_user_id, SUM(commission_amount) AS aprovado
  FROM promoter_commissions WHERE status = 'approved'
  GROUP BY promoter_user_id
) ap ON ap.promoter_user_id = pr.user_id
GROUP BY pr.user_id, pr.full_name, pr.pix_key, ap.aprovado
ORDER BY SUM(ac.comissao_devida) DESC;

\echo
\echo '=== 2. Total geral ==='
SELECT COUNT(*) AS comissoes_a_criar,
       COUNT(DISTINCT promotor_user_id) AS promotores,
       'R$ ' || to_char(SUM(comissao_devida) / 100.0, 'FM999G990D00') AS total
FROM a_creditar;

\echo
\echo '=== 3. Detalhe: assinante por assinante ==='
\echo '    meses_pagos x comissoes_existentes e o que decide. Se os dois forem'
\echo '    iguais, nada e devido mesmo que os MESES nao coincidam.'

SELECT
  pr.full_name          AS promotor,
  us.name               AS assinante,
  f.meses_pagos,
  f.comissoes_existentes,
  f.faltando,
  (SELECT string_agg(pa.periodo, ' ' ORDER BY pa.periodo)
     FROM pagamentos_do_assinante pa
    WHERE pa.assinante_user_id = f.assinante_user_id)          AS pagou_em,
  (SELECT string_agg(pc.period, ' ' ORDER BY pc.period)
     FROM promoter_commissions pc
    WHERE pc.subscriber_user_id = f.assinante_user_id
      AND pc.status <> 'cancelled')                            AS comissao_arquivada_em
FROM falta_por_assinante f
JOIN promoters pr ON pr.user_id = f.promotor_user_id
JOIN users us     ON us.id = f.assinante_user_id
WHERE f.faltando > 0
ORDER BY pr.full_name, us.name;

\echo
\echo '=== 4. Sanidade: comissoes sem NENHUM pagamento correspondente ==='
\echo '    Agora por assinante, nao por mes. Quem aparece aqui gerou comissao'
\echo '    e nunca pagou nada — provavelmente trial que virou licenca pelo'
\echo '    caminho do sync. Vale entender ANTES de creditar qualquer coisa.'

SELECT
  pr.full_name        AS promotor,
  us.name             AS assinante,
  pc.period           AS comissao_em,
  pc.status,
  pc.event_type,
  'R$ ' || to_char(pc.commission_amount / 100.0, 'FM999G990D00') AS valor,
  u2.hub_customer_id  AS customer_no_hub,
  CASE WHEN u2.hub_customer_id IS NULL THEN 'sem vinculo com o hub'
       WHEN NOT EXISTS (SELECT 1 FROM hub_pagamentos hp WHERE hp.hub_customer_id = u2.hub_customer_id)
         THEN 'customer existe, nenhum pagamento capturado'
       ELSE 'pagou, mas de outro produto ou antes da ativacao do promotor'
  END                 AS explicacao
FROM promoter_commissions pc
JOIN promoters pr ON pr.user_id = pc.promoter_user_id
JOIN users us     ON us.id = pc.subscriber_user_id
JOIN users u2     ON u2.id = pc.subscriber_user_id
WHERE pc.status <> 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM pagamentos_do_assinante pa
    WHERE pa.assinante_user_id = pc.subscriber_user_id
  )
ORDER BY pr.full_name, pc.period;
