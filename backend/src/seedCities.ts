import { City } from 'country-state-city';
import type { DbHandle } from './db.js';
import { queryAll, queryOne, run } from './db.js';

export function normalizeText(value: string) {
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

/** Portugal entra na mesma tabela, com "PT" no lugar da UF (Lisboa, PT). */
export const UF_PORTUGAL = 'PT';

// A biblioteca traz nomes em inglês e com sufixo ("Lisbon", "Bragança Municipality").
const NOMES_EM_PORTUGUES: Record<string, string> = { Lisbon: 'Lisboa' };

/**
 * Cidades de Portugal (adicionado em 11/2026). Roda uma vez: se já houver
 * alguma com UF "PT", não faz nada. Uma linha por nome — a biblioteca repete
 * cidades em distritos errados (Lisboa aparece em "Guarda").
 */
export async function seedPortugalCities(db: DbHandle) {
  const existing = (await queryOne(db, 'SELECT COUNT(1) as c FROM cities WHERE state = ?', [UF_PORTUGAL])) as any;
  if (Number(existing?.c || 0) > 0) return;

  const vistos = new Set<string>();
  const linhas: Array<[string, string, string, number, number]> = [];
  for (const c of (City.getCitiesOfCountry('PT') as any[]) || []) {
    let name = String(c.name || '').trim().replace(/ Municipality$/, '');
    name = NOMES_EM_PORTUGUES[name] ?? name;
    const lat = Number(c.latitude);
    const lon = Number(c.longitude);
    const nameNorm = normalizeText(name);
    if (!name || !nameNorm || Number.isNaN(lat) || Number.isNaN(lon) || vistos.has(nameNorm)) continue;
    vistos.add(nameNorm);
    linhas.push([name, nameNorm, UF_PORTUGAL, lat, lon]);
  }
  if (linhas.length === 0) return;

  await run(db, 'BEGIN;');
  try {
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500);
      await run(
        db,
        `INSERT INTO cities (name, name_norm, state, lat, lon) VALUES ${lote.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        lote.flat()
      );
    }
    await run(db, 'COMMIT;');
    await db.persist();
  } catch (e) {
    await run(db, 'ROLLBACK;');
    throw e;
  }
}

/**
 * `deQuem`: país de quem busca (cabeçalho do Cloudflare). 128 nomes existem
 * nos dois países ("São Paulo" é também freguesia de Lisboa), então:
 * - quem está em Portugal vê Portugal primeiro, depois o Brasil;
 * - quem está fora só vê a cidade de Portugal se o nome não existir no Brasil
 *   ("Leiria" aparece; "São Paulo, PT" não) — a busca do Brasil fica como era.
 */
export async function searchCities(db: DbHandle, q: string, limit: number, deQuem = '') {
  const query = normalizeText(q);
  if (!query) return [];
  const safeLimit = Math.min(50, Math.max(1, limit));
  const emPortugal = deQuem.toUpperCase() === UF_PORTUGAL;
  const filtroPortugal = emPortugal
    ? ''
    : `AND (state <> '${UF_PORTUGAL}' OR NOT EXISTS (
         SELECT 1 FROM cities b WHERE b.name_norm = cities.name_norm AND b.state <> '${UF_PORTUGAL}'))`;
  const rows = (await queryAll(
    db,
    `SELECT name, state, lat, lon FROM cities WHERE name_norm LIKE ? ${filtroPortugal}
      ORDER BY CASE WHEN name_norm = ? THEN 0 ELSE 1 END,
               CASE WHEN name_norm LIKE ? THEN 0 ELSE 1 END, -- começa com o que foi digitado
               CASE WHEN state = '${UF_PORTUGAL}' THEN ${emPortugal ? 0 : 1} ELSE ${emPortugal ? 1 : 0} END,
               name_norm ASC
      LIMIT ?`,
    [`%${query}%`, query, `${query}%`, safeLimit]
  )) as any[];
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
  // Distância ponderada pelo tamanho da cidade (13/11/2026). O centro mais
  // perto errava a periferia das cidades grandes: o sul de Fortaleza
  // (Messejana, Lagoa Redonda) fica a 9 km do centro de Eusébio e a 12 km do
  // de Fortaleza, e o GPS punha o usuário em Eusébio. Dividindo pela "raio"
  // aproximado de cada cidade, quem está dentro de uma cidade grande fica nela.
  const peso = (c: { name: string; state: string }) => RAIO_URBANO_KM[`${c.name}|${c.state}`] ?? RAIO_URBANO_PADRAO_KM;
  let best = candidates[0];
  let bestD = haversineKm({ lat, lon }, best);
  let bestScore = bestD / peso(best);
  for (const c of candidates.slice(1)) {
    const d = haversineKm({ lat, lon }, c);
    const score = d / peso(c);
    if (score < bestScore) {
      bestScore = score;
      bestD = d;
      best = c;
    }
  }
  // Portugal: a base traz freguesias (só Lisboa tem 52 — "Pena", "Anjos").
  // Perto de uma cidade principal, o GPS dá a cidade, não o bairro.
  if (best.state === UF_PORTUGAL) {
    let principal: (typeof best) | null = null;
    let principalD = RAIO_CIDADE_PRINCIPAL_PT_KM;
    for (const c of candidates) {
      if (c.state !== UF_PORTUGAL || !CIDADES_PRINCIPAIS_PT.has(c.name)) continue;
      const d = haversineKm({ lat, lon }, c);
      if (d <= principalD) {
        principalD = d;
        principal = c;
      }
    }
    if (principal) return { ...principal, distanceKm: principalD };
  }
  return { ...best, distanceKm: bestD };
}

// Raio urbano aproximado (km), de sqrt(área urbana / π), das cidades grandes do
// Brasil. Fora da lista vale RAIO_URBANO_PADRAO_KM. Usado só para decidir a
// cidade a partir do GPS (nearestCity), não para distâncias.
const RAIO_URBANO_PADRAO_KM = 5;
const RAIO_URBANO_KM: Record<string, number> = {
  'São Paulo|SP': 22, 'Rio de Janeiro|RJ': 19, 'Belo Horizonte|MG': 10, 'Salvador|BA': 13, 'Fortaleza|CE': 11,
  'Recife|PE': 8.5, 'Porto Alegre|RS': 12, 'Curitiba|PR': 12, 'Manaus|AM': 12, 'Belém|PA': 10, 'Goiânia|GO': 13,
  'São Luís|MA': 11, 'Maceió|AL': 10, 'Natal|RN': 7.5, 'Teresina|PI': 10, 'João Pessoa|PB': 8, 'Aracaju|SE': 7.5,
  'Cuiabá|MT': 9, 'Campo Grande|MS': 11, 'Florianópolis|SC': 10, 'Vitória|ES': 5.5, 'Porto Velho|RO': 8,
  'Rio Branco|AC': 7, 'Macapá|AP': 8, 'Boa Vista|RR': 8, 'Palmas|TO': 8, 'Brasília|DF': 12,
  'Guarulhos|SP': 10, 'Campinas|SP': 11, 'São Gonçalo|RJ': 9, 'Duque de Caxias|RJ': 9, 'Nova Iguaçu|RJ': 9,
  'São Bernardo do Campo|SP': 9, 'Santo André|SP': 7.5, 'Osasco|SP': 5.5, 'Ribeirão Preto|SP': 9, 'Sorocaba|SP': 9,
  'Uberlândia|MG': 9, 'Contagem|MG': 8, 'Juiz de Fora|MG': 8, 'Joinville|SC': 8, 'Londrina|PR': 8,
  'Feira de Santana|BA': 8, 'Jaboatão dos Guararapes|PE': 8, 'Caxias do Sul|RS': 8, 'Aparecida de Goiânia|GO': 8,
  'Serra|ES': 8, 'Vila Velha|ES': 7, 'Cariacica|ES': 6.5, 'Maringá|PR': 7, 'São José dos Campos|SP': 9,
  'Santos|SP': 6, 'Niterói|RJ': 8, 'Campos dos Goytacazes|RJ': 8, 'Montes Claros|MG': 7, 'Anápolis|GO': 7,
  'Caucaia|CE': 7, 'Ananindeua|PA': 7, 'Betim|MG': 7, 'Mauá|SP': 5.5, 'Diadema|SP': 4.5, 'Carapicuíba|SP': 4.5,
};

const RAIO_CIDADE_PRINCIPAL_PT_KM = 12;
const CIDADES_PRINCIPAIS_PT = new Set([
  'Lisboa', 'Porto', 'Amadora', 'Almada', 'Odivelas', 'Loures', 'Oeiras', 'Cascais', 'Sintra', 'Seixal',
  'Barreiro', 'Montijo', 'Moita', 'Vila Franca de Xira', 'Mafra', 'Setúbal', 'Palmela', 'Sesimbra',
  'Matosinhos', 'Vila Nova de Gaia', 'Gondomar', 'Maia', 'Valongo', 'Vila do Conde', 'Póvoa de Varzim',
  'Espinho', 'Santa Maria da Feira', 'Braga', 'Guimarães', 'Barcelos', 'Vila Nova de Famalicão',
  'Viana do Castelo', 'Coimbra', 'Figueira da Foz', 'Aveiro', 'Ílhavo', 'Ovar', 'Viseu', 'Leiria',
  'Marinha Grande', 'Caldas da Rainha', 'Torres Vedras', 'Santarém', 'Tomar', 'Abrantes', 'Castelo Branco',
  'Covilhã', 'Guarda', 'Évora', 'Beja', 'Portalegre', 'Vila Real', 'Bragança', 'Faro', 'Loulé',
  'Albufeira', 'Portimão', 'Lagos', 'Olhão', 'Tavira', 'Funchal', 'Ponta Delgada', 'Angra do Heroísmo',
]);
