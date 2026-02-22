import { City } from 'country-state-city';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function seedBrazilianCities(db: DbHandle) {
  const existing = (await queryOne(db, 'SELECT COUNT(1) as c FROM cities')) as any;
  if (Number(existing?.c || 0) > 0) return;

  const cities = City.getCitiesOfCountry('BR') as any[];
  if (!Array.isArray(cities) || cities.length === 0) return;

  await run(db, 'BEGIN;');
  try {
    const batchSize = 500;
    let batch: Array<{ name: string; nameNorm: string; state: string; lat: number; lon: number }> = [];
    const flush = async () => {
      if (batch.length === 0) return;
      const current = batch;
      batch = [];
      const values: unknown[] = [];
      const placeholders = current
        .map((row) => {
          values.push(row.name, row.nameNorm, row.state, row.lat, row.lon);
          return '(?, ?, ?, ?, ?)';
        })
        .join(', ');
      await run(db, `INSERT INTO cities (name, name_norm, state, lat, lon) VALUES ${placeholders}`, values);
    };
    for (const c of cities) {
      const name = String(c.name || '').trim();
      const state = String(c.stateCode || c.state_code || '').trim();
      const lat = Number(c.latitude);
      const lon = Number(c.longitude);
      if (!name || !state || Number.isNaN(lat) || Number.isNaN(lon)) continue;
      batch.push({ name, nameNorm: normalizeText(name), state, lat, lon });
      if (batch.length >= batchSize) await flush();
    }
    if (batch.length > 0) await flush();
    await run(db, 'COMMIT;');
    await db.persist();
  } catch (e) {
    await run(db, 'ROLLBACK;');
    throw e;
  }
}

export async function searchCities(db: DbHandle, q: string, limit: number) {
  const query = normalizeText(q);
  if (!query) return [];
  const safeLimit = Math.min(50, Math.max(1, limit));
  const rows = (await queryAll(db, 'SELECT name, state, lat, lon FROM cities WHERE name_norm LIKE ? ORDER BY name_norm ASC LIMIT ?', [
    `%${query}%`,
    safeLimit,
  ])) as any[];
  return rows.map((r) => ({ name: r.name, state: r.state, lat: Number(r.lat), lon: Number(r.lon) }));
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function nearestCity(db: DbHandle, lat: number, lon: number) {
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const delta = 1.0;
  const candidates = (await queryAll(
    db,
    'SELECT name, state, lat, lon FROM cities WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 2000',
    [lat - delta, lat + delta, lon - delta, lon + delta]
  )).map((r: any) => ({ name: r.name, state: r.state, lat: Number(r.lat), lon: Number(r.lon) }));
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestD = haversineKm({ lat, lon }, best);
  for (const c of candidates.slice(1)) {
    const d = haversineKm({ lat, lon }, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { ...best, distanceKm: bestD };
}
