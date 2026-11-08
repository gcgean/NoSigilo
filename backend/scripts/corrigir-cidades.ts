// Corrige perfis com cidade sem coordenadas ("Fortaleza ce", bairro, cadastro
// pelo Google que nunca calculou a posição). Só mexe em quem está SEM lat/lon —
// localização por GPS nunca é tocada.
//
// Uso (no container do backend):
//   npx tsx scripts/corrigir-cidades.ts            # só mostra o que faria
//   npx tsx scripts/corrigir-cidades.ts --aplicar  # grava
import path from 'node:path';
import { env } from '../src/env.js';
import { initDb, queryAll, run } from '../src/db.js';
import { resolverCidade } from '../src/cidades.js';

const aplicar = process.argv.includes('--aplicar');

const db = await initDb({
  databaseFile: env.DATABASE_FILE,
  migrationsDir: path.join(process.cwd(), 'migrations'),
  pgMigrationsDir: path.join(process.cwd(), 'pg-migrations'),
  databaseUrl: env.DATABASE_URL || undefined,
});

const linhas = (await queryAll(
  db,
  `SELECT id, city, state FROM users
    WHERE deleted_at IS NULL AND lat IS NULL AND city IS NOT NULL AND TRIM(city) <> ''`,
  []
)) as any[];

let corrigidos = 0;
const semSolucao = new Map<string, number>();
const exemplos: string[] = [];
for (const u of linhas) {
  const r = await resolverCidade(db, u.city, u.state);
  if (!r) {
    const chave = `${String(u.city).trim()} | ${String(u.state || '').trim() || '—'}`;
    semSolucao.set(chave, (semSolucao.get(chave) ?? 0) + 1);
    continue;
  }
  corrigidos += 1;
  if (exemplos.length < 25 && (r.city !== u.city || r.state !== u.state)) exemplos.push(`${u.city} | ${u.state || '—'}  →  ${r.city}/${r.state}`);
  if (aplicar) {
    await run(
      db,
      "UPDATE users SET city = ?, state = ?, lat = ?, lon = ?, location_source = 'profile_city' WHERE id = ? AND lat IS NULL",
      [r.city, r.state, r.lat, r.lon, u.id]
    );
  }
}

console.log(`${aplicar ? 'APLICADO' : 'SIMULAÇÃO'}: ${linhas.length} perfis sem coordenadas; ${corrigidos} resolvidos; ${linhas.length - corrigidos} sem solução.`);
console.log('\nExemplos de troca:');
for (const e of exemplos) console.log('  ' + e);
console.log('\nSem solução (mais comuns):');
for (const [k, n] of [...semSolucao.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n}× ${k}`);
process.exit(0);
