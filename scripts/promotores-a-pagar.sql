-- Quem ja atingiu os R$ 10,00 de comissao APROVADA acumulada — a lista para pagar.
--
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' < scripts/promotores-a-pagar.sql
--
-- NAO escreve nada. Dar baixa continua sendo pelo botao "Pagar" do admin, que
-- e o que marca as comissoes como 'paid' e registra a data. Rodar isto duas
-- vezes nao paga ninguem duas vezes.
--
-- O criterio e o mesmo da tela (backend/src/app.ts):
--
--   elegivel  =  SUM(commission_amount) WHERE status = 'approved'  >=  1000
--
-- Tres detalhes que mudam o numero e sao faceis de errar:
--
--   * So entra 'approved'. Comissao 'pending' e a que ainda esta no prazo de
--     estorno — contar ela aqui seria pagar dinheiro que pode voltar.
--   * O acumulado NAO e por periodo: soma tudo o que esta aprovado e nunca foi
--     pago, de qualquer mes. Quem juntou R$ 4 em julho e R$ 7 em agosto esta
--     na lista com R$ 11.
--   * commission_amount esta em CENTAVOS. 1782 = R$ 17,82.

\echo '=== 1. A pagar agora (aprovado >= R$ 10,00) ==='

WITH acumulado AS (
  SELECT
    p.user_id,
    p.full_name,
    p.pix_key,
    p.whatsapp,
    COALESCE(NULLIF(TRIM(p.contact_email), ''), u.email) AS email,
    p.status AS status_promotor,
    COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) AS aprovado,
    COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'pending'),  0) AS pendente,
    COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'paid'),     0) AS ja_pago,
    COUNT(*) FILTER (WHERE pc.status = 'approved')                                AS assinaturas_aprovadas
  FROM promoters p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN promoter_commissions pc ON pc.promoter_user_id = p.user_id
  GROUP BY p.user_id, p.full_name, p.pix_key, p.whatsapp, p.contact_email, u.email, p.status
)
SELECT
  full_name                                      AS promotor,
  pix_key                                        AS pix,
  whatsapp,
  email,
  assinaturas_aprovadas                          AS assinaturas,
  'R$ ' || to_char(aprovado  / 100.0, 'FM999G990D00') AS a_pagar,
  'R$ ' || to_char(pendente  / 100.0, 'FM999G990D00') AS ainda_pendente,
  'R$ ' || to_char(ja_pago   / 100.0, 'FM999G990D00') AS ja_recebido,
  -- Promotor desativado com saldo aprovado aparece de proposito: a comissao
  -- foi ganha enquanto ele estava ativo e continua devida. Confira o status
  -- antes de pagar em vez de deixar o dinheiro sumir da lista.
  status_promotor
FROM acumulado
WHERE aprovado >= 1000
ORDER BY aprovado DESC;

\echo
\echo '=== 2. Total do lote ==='

SELECT
  COUNT(*)                                                  AS promotores,
  'R$ ' || to_char(SUM(aprovado) / 100.0, 'FM999G990D00')   AS total_a_pagar
FROM (
  SELECT COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) AS aprovado
  FROM promoters p
  LEFT JOIN promoter_commissions pc ON pc.promoter_user_id = p.user_id
  GROUP BY p.user_id
) x
WHERE aprovado >= 1000;

\echo
\echo '=== 3. Quase la (tem saldo aprovado, mas ainda nao chegou aos R$ 10) ==='
\echo '    So para voce saber quem esta perto — nao pague desta lista.'

WITH acumulado AS (
  SELECT
    p.full_name,
    COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'approved'), 0) AS aprovado,
    COALESCE(SUM(pc.commission_amount) FILTER (WHERE pc.status = 'pending'),  0) AS pendente
  FROM promoters p
  LEFT JOIN promoter_commissions pc ON pc.promoter_user_id = p.user_id
  GROUP BY p.user_id, p.full_name
)
SELECT
  full_name                                                    AS promotor,
  'R$ ' || to_char(aprovado / 100.0, 'FM999G990D00')           AS aprovado,
  'R$ ' || to_char((1000 - aprovado) / 100.0, 'FM999G990D00')  AS falta,
  'R$ ' || to_char(pendente / 100.0, 'FM999G990D00')           AS pendente_que_pode_virar
FROM acumulado
WHERE aprovado > 0 AND aprovado < 1000
ORDER BY aprovado DESC;
