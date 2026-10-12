-- 118: LGPD (minimizacao): GPS dos usuarios passa a ser guardado com 2 casas (~1 km).
-- Arredonda os que ja existem. Centro de cidade (profile_city) fica igual: o backend
-- reconhece esses pontos para mostrar "Em <cidade>" em vez de uma distancia falsa.
UPDATE users SET lat = ROUND(CAST(lat AS numeric), 2), lon = ROUND(CAST(lon AS numeric), 2)
 WHERE location_source = 'gps' AND lat IS NOT NULL AND lon IS NOT NULL;
