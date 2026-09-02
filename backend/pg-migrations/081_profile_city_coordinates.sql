-- Usa o centro aproximado da cidade do perfil como referência de descoberta
-- quando o usuário ainda não autorizou o GPS. O GPS pode substituir estes
-- valores posteriormente sem expor uma localização precisa por padrão.
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_source TEXT;

UPDATE users u
SET lat = c.lat,
    lon = c.lon,
    location_source = 'profile_city'
FROM cities c
WHERE (u.lat IS NULL OR u.lon IS NULL)
  AND u.city IS NOT NULL
  AND BTRIM(u.city) <> ''
  AND u.state IS NOT NULL
  AND BTRIM(u.state) <> ''
  AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(u.city))
  AND UPPER(BTRIM(c.state)) = UPPER(BTRIM(u.state));

UPDATE users
SET location_source = 'gps'
WHERE lat IS NOT NULL
  AND lon IS NOT NULL
  AND location_source IS NULL;
