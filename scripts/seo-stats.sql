-- Regenera os numeros de scripts/seo-stats.json.
--
-- Conta apenas perfis que o visitante REALMENTE encontraria: banido,
-- desativado e apagado ficam de fora. Contar quem nao aparece na busca seria
-- prova social falsa, e e o tipo de numero que se vira contra o site.
--
-- Como usar, no servidor:
--
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -t -A -f -' < scripts/seo-stats.sql
--
-- A saida ja e o JSON pronto: cole em scripts/seo-stats.json, atualize o
-- campo _atualizado_em, apague o _ressalva e rode o build.
--
-- As chaves de cidade sao "estado-slug/cidade-slug" e precisam bater com as
-- de ENABLED_CITIES no generate-seo-pages.mjs, senao o numero e ignorado
-- (silenciosamente — o gerador cai para o total do estado ou o nacional).

WITH visiveis AS (
  SELECT trim(city) AS city, trim(state) AS state
  FROM users
  -- ATENCAO: is_banned e is_deactivated sao INTEGER, nao boolean (heranca da
  -- migracao do SQLite), e deleted_at e TEXT. Comparar com `false` da erro
  -- "COALESCE types integer and boolean cannot be matched".
  WHERE COALESCE(is_banned, 0) = 0
    AND COALESCE(is_deactivated, 0) = 0
    AND deleted_at IS NULL
),
nacional AS (
  SELECT COUNT(*) AS n FROM visiveis
),
por_uf AS (
  SELECT state AS uf, COUNT(*) AS n
  FROM visiveis
  WHERE COALESCE(state, '') <> ''
  GROUP BY state
),
por_cidade AS (
  SELECT city, COUNT(*) AS n
  FROM visiveis
  WHERE COALESCE(city, '') <> ''
  GROUP BY city
  HAVING COUNT(*) >= 5
)
SELECT jsonb_pretty(jsonb_build_object(
  'nacional', (SELECT n FROM nacional),
  'por_uf',   (SELECT jsonb_object_agg(uf, n) FROM por_uf),
  'por_cidade', (SELECT jsonb_object_agg(city, n) FROM por_cidade)
));
