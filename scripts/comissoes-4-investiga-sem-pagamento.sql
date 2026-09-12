-- INVESTIGACAO — roda no banco do HUB (hub_billing_postgres_prod). So le.
--
--   docker exec -i hub_billing_postgres_prod sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' \
--     < scripts/comissoes-4-investiga-sem-pagamento.sql
--
-- Para que serve: o bloco 4 do passo 2 achou comissoes geradas para
-- assinantes que nao tem NENHUM pagamento capturado no hub. Todas nasceram
-- pelo caminho `access_synced` (o sync que roda no login de quem esta com
-- acesso liberado), e parte delas ja foi paga ao promotor.
--
-- O que ainda nao sabemos e POR QUE essas pessoas estavam com acesso liberado
-- sem pagamento capturado. As hipoteses, e o que cada bloco abaixo separa:
--
--   a) licenca dada na mao (origin 'manual') — acesso concedido pelo admin
--   b) trial que virou licenca ativa no hub (origin 'trial')
--   c) pagamento existe mas nao ficou 'captured' (ficou em 'authorized',
--      'pending', ou foi estornado depois)
--   d) cobranca paga sem linha em payments (caminho de gateway que registra
--      so a charge)
--
-- Cole aqui os customer ids que o bloco 4 imprimiu na coluna customer_no_hub.

\set ON_ERROR_STOP on

CREATE TEMP TABLE alvo (customer_id UUID);

INSERT INTO alvo (customer_id) VALUES
  ('8f611044-419d-40b4-893a-1a5aa5ccb40a'),   -- Henriquezn1        (Alex Joaquim)
  ('11787b5f-229b-4d6d-be42-86f06c43cea6'),   -- Advogato69         (Eline Ketyle)
  ('401bb328-c2da-4d6c-a266-8f4a40907c71'),   -- Usuario excluido   (Eline Ketyle)
  ('046d1d17-7bd9-4c66-aa6c-018fb8b7ee9b');   -- Pretin36           (Gabriel Duraes)

\echo '=== 1. Licencas: de onde veio o acesso ==='
\echo '    origin manual = liberado na mao; trial = periodo de teste.'

SELECT
  l.customer_id,
  c.email,
  l.status,
  l.origin_type,
  l.starts_at::date    AS comeca,
  l.expires_at::date   AS termina,
  l.grace_until::date  AS carencia_ate,
  l.suspended_reason,
  l.revoked_reason
FROM licenses l
JOIN customers c ON c.id = l.customer_id
WHERE l.customer_id IN (SELECT customer_id FROM alvo)
ORDER BY l.customer_id, l.starts_at;

\echo
\echo '=== 2. Pagamentos em QUALQUER status (o passo 1 so exportou captured) ==='

SELECT
  p.customer_id,
  p.status,
  p.payment_method,
  p.gateway_name,
  'R$ ' || to_char(p.amount / 100.0, 'FM999G990D00') AS valor,
  p.captured_at::date  AS capturado_em,
  p.refunded_at::date  AS estornado_em,
  p.created_at::date   AS criado_em
FROM payments p
WHERE p.customer_id IN (SELECT customer_id FROM alvo)
ORDER BY p.customer_id, p.created_at;

\echo
\echo '=== 3. Cobrancas: pode haver charge paga sem linha em payments ==='

SELECT
  ch.customer_id,
  ch.status,
  ch.gateway_name,
  'R$ ' || to_char(ch.amount / 100.0, 'FM999G990D00') AS valor,
  ch.paid_at::date    AS pago_em,
  ch.created_at::date AS criado_em
FROM charges ch
WHERE ch.customer_id IN (SELECT customer_id FROM alvo)
ORDER BY ch.customer_id, ch.created_at;

\echo
\echo '=== 4. Assinaturas ==='

SELECT
  s.customer_id,
  s.status,
  s.gateway_name,
  'R$ ' || to_char(s.contracted_amount / 100.0, 'FM999G990D00') AS contratado,
  s.started_at::date           AS comecou,
  s.trial_ends_at::date        AS trial_ate,
  s.current_period_end::date   AS ciclo_ate
FROM subscriptions s
WHERE s.customer_id IN (SELECT customer_id FROM alvo)
ORDER BY s.customer_id, s.created_at;
