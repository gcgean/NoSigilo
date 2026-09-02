-- Versões anteriores capturavam o GPS silenciosamente no login e sobrescreviam
-- a referência da cidade cadastrada. Restaura uma vez esses registros para o
-- centro da cidade do perfil. Novos usos explícitos do GPS voltam a marcar a
-- localização como "gps" pelo endpoint /api/location.
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
WHERE location_source = 'gps'
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
