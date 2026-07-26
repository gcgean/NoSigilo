-- NoSigilo · Conversao de HOMENS cadastrados nas ULTIMAS 6 HORAS.
-- Uso: docker exec -i nosigilo-postgres psql -U nosigilo -d nosigilo < analise_homens_6h.sql
DROP TABLE IF EXISTS hx;
CREATE TEMP TABLE hx AS
SELECT
  u.id,
  u.created_at::timestamptz AS created_ts,
  u.last_seen_at AS last_seen,
  ( u.is_premium = 1
    OR lower(coalesce(u.hub_access_status,'')) LIKE 'active%'
    OR (u.hub_license_end_at IS NOT NULL AND u.hub_license_end_at::timestamptz > now())
  ) AS paid,
  (SELECT count(*) FROM profile_visits pv JOIN users vu ON vu.id = pv.visitor_user_id
     WHERE pv.visited_user_id = u.id AND lower(coalesce(vu.gender,'')) ~ '^(mulher|casal)') AS visitas_recebidas,
  (SELECT count(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN users su ON su.id = m.sender_id
     WHERE m.sender_id <> u.id AND (c.user_a_id = u.id OR c.user_b_id = u.id)
       AND lower(coalesce(su.gender,'')) ~ '^(mulher|casal)') AS msgs_recebidas,
  (SELECT count(*) FROM likes lk JOIN users lu ON lu.id = lk.user_id
     WHERE lk.target_id = u.id AND lower(coalesce(lu.gender,'')) ~ '^(mulher|casal)') AS likes_recebidos,
  (SELECT count(*) FROM messages m2 WHERE m2.sender_id = u.id) AS msgs_enviadas,
  (SELECT count(*) FROM likes lk2 WHERE lk2.user_id = u.id) AS likes_dados,
  (SELECT count(*) FROM profile_visits p2 WHERE p2.visitor_user_id = u.id) AS visitas_feitas,
  EXISTS (SELECT 1 FROM checkout_generations cg WHERE cg.user_id = u.id) AS gerou_checkout
FROM users u
WHERE lower(coalesce(u.gender,'')) ~ '^homem'
  AND u.created_at::timestamptz >= now() - interval '6 hours';

\echo '=== 1_FUNIL (ultimas 6h) ==='
SELECT count(*) AS homens_6h,
  count(*) FILTER (WHERE paid) AS assinaram,
  round(100.0*count(*) FILTER (WHERE paid)/nullif(count(*),0),1) AS conversao_pct,
  count(*) FILTER (WHERE NOT paid) AS nao_assinaram,
  count(*) FILTER (WHERE gerou_checkout) AS abriram_checkout,
  count(*) FILTER (WHERE gerou_checkout AND NOT paid) AS gerou_pix_nao_pagou,
  count(*) FILTER (WHERE NOT gerou_checkout AND NOT paid) AS nunca_abriu_checkout
FROM hx;

\echo '=== 2_RETORNO (nao assinantes) ==='
SELECT count(*) AS nao_assinantes,
  count(*) FILTER (WHERE last_seen IS NULL OR last_seen <= created_ts + interval '30 min') AS sumiram_1a_sessao,
  count(*) FILTER (WHERE last_seen > created_ts + interval '30 min') AS voltaram,
  count(*) FILTER (WHERE last_seen > now() - interval '1 hour') AS ativos_ult_1h
FROM hx WHERE NOT paid;

\echo '=== 3_SINAL (recebeu interesse de mulher/casal?) ==='
SELECT count(*) AS total,
  count(*) FILTER (WHERE (visitas_recebidas+msgs_recebidas+likes_recebidos)=0) AS sem_sinal,
  count(*) FILTER (WHERE (visitas_recebidas+msgs_recebidas+likes_recebidos)>0) AS com_sinal,
  round(100.0*count(*) FILTER (WHERE paid AND (visitas_recebidas+msgs_recebidas+likes_recebidos)=0)
        /nullif(count(*) FILTER (WHERE (visitas_recebidas+msgs_recebidas+likes_recebidos)=0),0),1) AS conv_pct_sem_sinal,
  round(100.0*count(*) FILTER (WHERE paid AND (visitas_recebidas+msgs_recebidas+likes_recebidos)>0)
        /nullif(count(*) FILTER (WHERE (visitas_recebidas+msgs_recebidas+likes_recebidos)>0),0),1) AS conv_pct_com_sinal
FROM hx;

\echo '=== 4_ACAO (engajamento dele) ==='
SELECT count(*) FILTER (WHERE NOT paid) AS nao_assinantes,
  count(*) FILTER (WHERE NOT paid AND (msgs_enviadas+likes_dados+visitas_feitas)=0) AS nao_fez_nada,
  count(*) FILTER (WHERE NOT paid AND (msgs_enviadas+likes_dados+visitas_feitas) BETWEEN 1 AND 5) AS explorou_pouco,
  count(*) FILTER (WHERE NOT paid AND (msgs_enviadas+likes_dados+visitas_feitas) > 5) AS engajou_nao_pagou
FROM hx;

\echo '=== 5_POR_HORA ==='
SELECT date_trunc('hour', created_ts) AS hora, count(*) AS homens, count(*) FILTER (WHERE paid) AS assinaram
FROM hx GROUP BY 1 ORDER BY 1;
