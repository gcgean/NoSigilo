-- 118: LGPD (minimizacao): GPS dos usuarios passa a ser guardado com 2 casas (~1 km).
UPDATE users SET lat = ROUND(lat, 2), lon = ROUND(lon, 2)
 WHERE location_source = 'gps' AND lat IS NOT NULL AND lon IS NOT NULL;
