-- Corrige os perfis com cidade invalida (1 ou 2 letras).
--
-- Rode o scripts/cidades-invalidas-diagnostico.sql ANTES: este arquivo
-- escreve em perfis de gente real.
--
--   docker exec -i nosigilo-postgres sh -c \
--     'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 -f -' \
--     < scripts/cidades-invalidas-corrige.sql
--
-- O que acontece, na ordem:
--
--   1. Salva os afetados numa tabela de backup. Se der errado, da para
--      voltar (a consulta de reversao esta no fim do arquivo).
--   2. Quem tem coordenada com uma cidade a ate 50 km recebe o nome e a UF
--      dessa cidade. A coordenada e o dado factual — e ja e o que o radar,
--      o feed e a ordenacao por proximidade usam. Alinhar o rotulo a ela
--      deixa o perfil coerente consigo mesmo.
--   3. Todo o resto vira NULL: sem coordenada, ou com coordenada corrompida
--      (havia dois casos a 4.255 km e 8.663 km da cidade mais proxima).
--      Nao inventar onde a pessoa mora e melhor do que chutar — e o modal
--      obrigatorio ja pergunta, porque cidadeValida() exige 3 letras e
--      portanto ja rejeitava "F" do mesmo jeito que rejeita NULL.
--
-- Sobre o passo 2: em varios casos a letra nao bate com a cidade escolhida
-- ("F" virando Eusebio, Caucaia, Maracanau). Sao vizinhos de Fortaleza —
-- gente da regiao metropolitana que ia escrever a capital mas mora na cidade
-- ao lado. A coordenada ganha de proposito.
--
-- ATENCAO: is_banned e is_deactivated sao INTEGER, nao boolean (heranca da
-- migracao do SQLite). Aqui nao filtramos por eles: perfil banido tambem tem
-- a cidade corrigida, para o dado nao voltar a sujar relatorio se ele for
-- reativado.

\set ON_ERROR_STOP on

BEGIN;

\echo '=== Antes ==='
SELECT COUNT(*) AS com_cidade_invalida
FROM users
WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2;

-- ---------------------------------------------------------------- backup --
-- CREATE TABLE ... AS nao aceita IF NOT EXISTS com a mesma semantica em
-- todas as versoes; DROP antes deixa o script re-executavel sem erro.
DROP TABLE IF EXISTS backup_cidade_invalida;
CREATE TABLE backup_cidade_invalida AS
SELECT id, city AS city_antes, state AS state_antes, lat, lon, now() AS salvo_em
FROM users
WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2;

\echo
\echo '=== Backup salvo em backup_cidade_invalida ==='
SELECT COUNT(*) AS linhas_no_backup FROM backup_cidade_invalida;

-- ------------------------------------------- 1) cidade pela coordenada ----
WITH invalidos AS (
  SELECT id, lat, lon
  FROM users
  WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2
    AND lat IS NOT NULL
    AND lon IS NOT NULL
),
alvo AS (
  SELECT i.id, c.name, c.state,
         6371 * acos(least(1, greatest(-1,
             cos(radians(i.lat)) * cos(radians(c.lat)) * cos(radians(c.lon) - radians(i.lon))
           + sin(radians(i.lat)) * sin(radians(c.lat))
         ))) AS km
  FROM invalidos i
  JOIN LATERAL (
    SELECT ci.name, ci.state, ci.lat, ci.lon
    FROM cities ci
    ORDER BY (ci.lat - i.lat) ^ 2 + (ci.lon - i.lon) ^ 2
    LIMIT 1
  ) c ON TRUE
)
UPDATE users u
SET city  = a.name,
    state = upper(a.state)
FROM alvo a
WHERE u.id = a.id
  AND a.km <= 50;

\echo
\echo '=== 1. Corrigidos pela coordenada ==='
SELECT COUNT(*) AS corrigidos
FROM users u
JOIN backup_cidade_invalida b ON b.id = u.id
WHERE char_length(trim(COALESCE(u.city, ''))) > 2;

-- -------------------------------------------------- 2) o resto vira NULL --
-- Sem coordenada utilizavel nao ha o que deduzir. O state fica como esta:
-- ja vinha vazio nesses perfis e mexer nele aqui so ampliaria o alcance
-- da escrita sem ganho.
UPDATE users
SET city = NULL
WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2;

\echo
\echo '=== Depois ==='
SELECT
  (SELECT COUNT(*) FROM users
    WHERE char_length(trim(COALESCE(city, ''))) BETWEEN 1 AND 2)  AS ainda_invalidos,
  (SELECT COUNT(*) FROM users u JOIN backup_cidade_invalida b ON b.id = u.id
    WHERE u.city IS NOT NULL)                                     AS receberam_cidade,
  (SELECT COUNT(*) FROM users u JOIN backup_cidade_invalida b ON b.id = u.id
    WHERE u.city IS NULL)                                         AS ficaram_nulos;

\echo
\echo '=== Amostra do que mudou ==='
SELECT b.city_antes AS antes, u.city AS agora, u.state AS uf
FROM backup_cidade_invalida b
JOIN users u ON u.id = b.id
WHERE u.city IS NOT NULL
ORDER BY u.state, u.city
LIMIT 25;

COMMIT;

-- --------------------------------------------------------------- desfaz --
-- Se algo ficou errado, isto devolve tudo ao estado anterior:
--
--   UPDATE users u
--   SET city = b.city_antes, state = b.state_antes
--   FROM backup_cidade_invalida b
--   WHERE u.id = b.id;
--
-- A tabela backup_cidade_invalida pode ser descartada depois de conferir:
--
--   DROP TABLE backup_cidade_invalida;
