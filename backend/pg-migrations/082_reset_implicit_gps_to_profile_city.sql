-- Versões anteriores capturavam o GPS silenciosamente no login e sobrescreviam
-- a referência da cidade cadastrada. Restaura uma vez esses registros para o
-- centro da cidade do perfil. Novos usos explícitos do GPS voltam a marcar a
-- localização como "gps" pelo endpoint /api/location.
UPDATE users u
SET lat = c.lat,
    lon = c.lon,
    location_source = 'profile_city'
FROM cities c
WHERE u.location_source = 'gps'
  AND u.city IS NOT NULL
  AND BTRIM(u.city) <> ''
  AND u.state IS NOT NULL
  AND BTRIM(u.state) <> ''
  AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(u.city))
  AND UPPER(BTRIM(c.state)) = UPPER(BTRIM(u.state));
