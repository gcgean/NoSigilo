-- Diagnostico dos perfis com cidade invalida (1 ou 2 letras).
--
-- De onde vem: o campo cidade e um autocomplete que dispara a cada tecla.
-- Quem digitava "S" comecando a escrever "Sao Paulo", nao escolhia da lista e
-- salvava, gravava "S". O guard sanitizeCityValue (backend/src/app.ts) so
-- entrou no commit da7605b e hoje transforma isso em NULL, entao estes
-- registros sao anteriores a ele — a torneira ja esta fechada, falta limpar
-- o que ficou.
--
-- Por que importa mais do que parece: cidade alimenta a busca local, o radar,
-- a ordenacao do feed e dos stories. Um perfil com cidade "S" nao casa com
-- cidade nenhuma e some do mecanismo de proximidade inteiro.
--
-- Este arquivo NAO escreve nada. Rode antes da correcao:
--
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -f -' < scripts/cidades-invalidas-diagnostico.sql
--
-- ATENCAO ao ler: is_banned e is_deactivated sao INTEGER, nao boolean
-- (heranca da migracao do SQLite), e deleted_at e TEXT. Comparar com `false`
-- da erro "COALESCE types integer and boolean cannot be matched".

\echo '=== 1. Quantos sao, e quantos o visitante enxerga ==='

SELECT
  trim(city)                                    AS cidade_gravada,
  COUNT(*)                                      AS perfis,
  COUNT(*) FILTER (WHERE COALESCE(is_banned,0) = 0
                     AND COALESCE(is_deactivated,0) = 0
                     AND deleted_at IS NULL)    AS visiveis,
  COUNT(*) FILTER (WHERE lat IS NOT NULL
                     AND lon IS NOT NULL)       AS com_coordenada
FROM users
WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2
GROUP BY 1
ORDER BY perfis DESC;

\echo
\echo '=== 2. Cidade provavel de cada um, pela coordenada ==='
\echo '    km = distancia ate a cidade mais proxima do banco de cidades.'
\echo '    Acima de ~50 km o palpite fica fraco e nao deve ser aplicado.'

WITH invalidos AS (
  SELECT id, name, trim(city) AS city, upper(trim(COALESCE(state, ''))) AS uf,
         lat, lon, created_at,
         (COALESCE(is_banned,0) = 0 AND COALESCE(is_deactivated,0) = 0
          AND deleted_at IS NULL) AS visivel
  FROM users
  WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2
)
SELECT
  i.city                          AS gravado,
  NULLIF(i.uf, '')                AS uf_gravada,
  i.visivel,
  substr(i.created_at, 1, 10)     AS cadastro,
  c.name                          AS cidade_provavel,
  c.state                         AS uf_provavel,
  CASE WHEN c.name IS NULL THEN NULL ELSE
    round((6371 * acos(least(1, greatest(-1,
        cos(radians(i.lat)) * cos(radians(c.lat)) * cos(radians(c.lon) - radians(i.lon))
      + sin(radians(i.lat)) * sin(radians(c.lat))
    ))))::numeric, 1)
  END                             AS km
FROM invalidos i
-- Quando o perfil tem UF valida, so considera cidades daquela UF: e um
-- palpite bem mais seguro do que a coordenada sozinha perto de divisa.
LEFT JOIN LATERAL (
  SELECT ci.name, ci.state, ci.lat, ci.lon
  FROM cities ci
  WHERE i.lat IS NOT NULL
    AND i.lon IS NOT NULL
    AND (char_length(i.uf) <> 2 OR upper(ci.state) = i.uf)
  ORDER BY (ci.lat - i.lat) ^ 2 + (ci.lon - i.lon) ^ 2
  LIMIT 1
) c ON TRUE
ORDER BY i.visivel DESC, km NULLS LAST;

\echo
\echo '=== 3. Resumo: quantos da para corrigir com seguranca ==='

WITH invalidos AS (
  SELECT id, upper(trim(COALESCE(state, ''))) AS uf, lat, lon
  FROM users
  WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2
),
palpites AS (
  SELECT i.id,
    CASE WHEN c.name IS NULL THEN NULL ELSE
      6371 * acos(least(1, greatest(-1,
          cos(radians(i.lat)) * cos(radians(c.lat)) * cos(radians(c.lon) - radians(i.lon))
        + sin(radians(i.lat)) * sin(radians(c.lat))
      )))
    END AS km
  FROM invalidos i
  LEFT JOIN LATERAL (
    SELECT ci.name, ci.state, ci.lat, ci.lon
    FROM cities ci
    WHERE i.lat IS NOT NULL AND i.lon IS NOT NULL
      AND (char_length(i.uf) <> 2 OR upper(ci.state) = i.uf)
    ORDER BY (ci.lat - i.lat) ^ 2 + (ci.lon - i.lon) ^ 2
    LIMIT 1
  ) c ON TRUE
)
SELECT
  COUNT(*)                                    AS total,
  COUNT(*) FILTER (WHERE km IS NOT NULL
                     AND km <= 50)            AS corrigiveis_pela_coordenada,
  COUNT(*) FILTER (WHERE km IS NOT NULL
                     AND km > 50)             AS palpite_fraco,
  COUNT(*) FILTER (WHERE km IS NULL)          AS sem_coordenada
FROM palpites;
