/**
 * migrate-production.mjs
 *
 * Script seguro para aplicar migrações pendentes no banco de produção.
 * Uso:
 *   node scripts/migrate-production.mjs [caminho-do-banco]
 *
 * Exemplo:
 *   node scripts/migrate-production.mjs data/nosigilo.sqlite
 *
 * O script:
 *  - Lê o banco SQLite existente
 *  - Verifica quais migrações ainda não foram aplicadas via tabela _migrations
 *  - Aplica apenas as pendentes
 *  - Salva o banco atualizado no mesmo arquivo
 */

import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbArg = process.argv[2] || path.join(__dirname, '..', 'data', 'nosigilo.sqlite');
const dbFile = path.resolve(dbArg);
const migrationsDir = path.resolve(__dirname, '..', 'migrations');

if (!existsSync(dbFile)) {
  console.error(`❌  Banco não encontrado: ${dbFile}`);
  console.error(`    Informe o caminho correto como argumento.`);
  process.exit(1);
}

const SQL = await initSqlJs();
const db = new SQL.Database(new Uint8Array(readFileSync(dbFile)));

// Garante tabela de controle
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);

// Lê migrações já aplicadas
const applied = new Set(
  db.exec('SELECT id FROM _migrations ORDER BY id')
    .flatMap(r => r.values.map(v => String(v[0])))
);

console.log(`\n📂  Banco: ${dbFile}`);
console.log(`✅  Migrações já aplicadas: ${applied.size}`);
applied.forEach(id => console.log(`    ✓ ${id}`));

// Lê arquivos de migração em ordem
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

const pending = files.filter(f => !applied.has(f));

if (pending.length === 0) {
  console.log(`\n🎉  Nenhuma migração pendente. Banco já está atualizado!\n`);
  db.close();
  setTimeout(() => process.exit(0), 100);
}

console.log(`\n⏳  Migrações pendentes: ${pending.length}`);
pending.forEach(f => console.log(`    • ${f}`));
console.log('');

let applied_count = 0;
let failed_count = 0;

for (const file of pending) {
  const sql = readFileSync(path.join(migrationsDir, file), 'utf-8').trim();
  try {
    db.exec(sql);
    db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
    console.log(`  ✅  ${file}`);
    applied_count++;
  } catch (err) {
    // Column already exists errors are safe to ignore
    if (err.message?.includes('duplicate column name') || err.message?.includes('already exists')) {
      db.run('INSERT OR IGNORE INTO _migrations (id, applied_at) VALUES (?, ?)', [file, new Date().toISOString()]);
      console.log(`  ⚠️   ${file} — coluna já existia, marcada como aplicada`);
      applied_count++;
    } else {
      console.error(`  ❌  ${file} — ERRO: ${err.message}`);
      failed_count++;
    }
  }
}

// Salva banco atualizado
const tmp = `${dbFile}.migrate-${Date.now()}.tmp`;
writeFileSync(tmp, Buffer.from(db.export()));
renameSync(tmp, dbFile);
db.close();

console.log(`\n📊  Resultado:`);
console.log(`    Aplicadas com sucesso: ${applied_count}`);
if (failed_count > 0) {
  console.log(`    Com erro: ${failed_count}`);
  console.log(`\n⚠️  Corrija os erros acima antes de iniciar o servidor.\n`);
  setTimeout(() => process.exit(1), 100);
} else {
  console.log(`\n🚀  Banco atualizado com sucesso! Pode reiniciar o servidor.\n`);
  setTimeout(() => process.exit(0), 100);
}
