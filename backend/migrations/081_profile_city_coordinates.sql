-- Usa o centro aproximado da cidade do perfil como referência de descoberta
-- quando o usuário ainda não autorizou o GPS. O GPS pode substituir estes
-- valores posteriormente sem expor uma localização precisa por padrão.
ALTER TABLE users ADD COLUMN location_source TEXT;

UPDATE users
SET lat = (
      SELECT c.lat
      FROM cities c
      WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(users.city))
        AND UPPER(TRIM(c.state)) = UPPER(TRIM(users.state))
      LIMIT 1
    ),
    lon = (
      SELECT c.lon
      FROM cities c
      WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(users.city))
        AND UPPER(TRIM(c.state)) = UPPER(TRIM(users.state))
      LIMIT 1
    ),
    location_source = 'profile_city'
WHERE (lat IS NULL OR lon IS NULL)
  AND city IS NOT NULL
  AND TRIM(city) <> ''
  AND state IS NOT NULL
  AND TRIM(state) <> ''
  AND EXISTS (
    SELECT 1
    FROM cities c
    WHERE LOWER(TRIM(c.name)) = LOWER(TRIM(users.city))
      AND UPPER(TRIM(c.state)) = UPPER(TRIM(users.state))
  );

UPDATE users
SET location_source = 'gps'
WHERE lat IS NOT NULL
  AND lon IS NOT NULL
  AND location_source IS NULL;
