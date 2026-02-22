import initSqlJs from 'sql.js';
import { Pool } from 'pg';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SqlJsDb = import('sql.js').Database;

export type DbMode = 'sqljs' | 'pg';

export type DbHandle = {
  mode: DbMode;
  exec: (sql: string) => Promise<void>;
  queryAll: (sql: string, params?: unknown[]) => Promise<any[]>;
  queryOne: (sql: string, params?: unknown[]) => Promise<any | null>;
  run: (sql: string, params?: unknown[]) => Promise<void>;
  persist: () => Promise<void>;
  close: () => Promise<void>;
};

export async function queryAll(db: DbHandle, sql: string, params: unknown[] = []) {
  return db.queryAll(sql, params);
}

export async function queryOne(db: DbHandle, sql: string, params: unknown[] = []) {
  return db.queryOne(sql, params);
}

export async function run(db: DbHandle, sql: string, params: unknown[] = []) {
  await db.run(sql, params);
}

function ensureDir(filePath: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function locateSqlJsDistFile(file: string) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
}

function absolutePath(p: string) {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function sqljsQueryAll(db: SqlJsDb, sql: string, params: unknown[] = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as any);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function sqljsQueryOne(db: SqlJsDb, sql: string, params: unknown[] = []) {
  const rows = sqljsQueryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function sqljsRun(db: SqlJsDb, sql: string, params: unknown[] = []) {
  db.run(sql, params as any);
}

function toPgSql(sql: string) {
  let out = '';
  let idx = 1;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      const prev = i > 0 ? sql[i - 1] : '';
      if (prev !== '\\') inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      const prev = i > 0 ? sql[i - 1] : '';
      if (prev !== '\\') inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === '?') {
      out += `$${idx++}`;
      continue;
    }
    out += ch;
  }
  return out;
}

async function applyPgMigrations(options: { pool: Pool; migrationsDir: string }) {
  await options.pool.query('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const appliedRows = await options.pool.query('SELECT id FROM _migrations');
  const applied = new Set(appliedRows.rows.map((r: any) => String(r.id)));
  const migrationFiles = readdirSync(options.migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(options.migrationsDir, file), 'utf-8');
    await options.pool.query(sql);
    await options.pool.query('INSERT INTO _migrations (id, applied_at) VALUES ($1, $2)', [file, nowIso()]);
  }
}

export async function initDb(options: {
  databaseFile: string;
  migrationsDir: string;
  databaseUrl?: string;
  pgMigrationsDir?: string;
}): Promise<DbHandle> {
  const databaseUrl = options.databaseUrl;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    await pool.query('SELECT 1');
    const migrationsDir = options.pgMigrationsDir ? absolutePath(options.pgMigrationsDir) : absolutePath(options.migrationsDir);
    await applyPgMigrations({ pool, migrationsDir });
    return {
      mode: 'pg',
      exec: async (sql: string) => {
        await pool.query(sql);
      },
      queryAll: async (sql: string, params: unknown[] = []) => {
        const r = await pool.query(toPgSql(sql), params as any);
        return r.rows;
      },
      queryOne: async (sql: string, params: unknown[] = []) => {
        const r = await pool.query(toPgSql(sql), params as any);
        return r.rows.length > 0 ? r.rows[0] : null;
      },
      run: async (sql: string, params: unknown[] = []) => {
        await pool.query(toPgSql(sql), params as any);
      },
      persist: async () => {},
      close: async () => {
        await pool.end();
      },
    };
  }

  const SQL = await initSqlJs({
    locateFile: (file: string) => locateSqlJsDistFile(file),
  });

  const dbFile = absolutePath(options.databaseFile);
  ensureDir(dbFile);

  const db = existsSync(dbFile) ? new SQL.Database(new Uint8Array(readFileSync(dbFile))) : new SQL.Database();
  db.exec('PRAGMA foreign_keys = ON;');

  const persist = async () => {
    const tmp = `${dbFile}.${Date.now()}.tmp`;
    writeFileSync(tmp, Buffer.from(db.export()));
    try {
      renameSync(tmp, dbFile);
    } catch {
      writeFileSync(dbFile, readFileSync(tmp));
      unlinkSync(tmp);
    }
  };

  sqljsRun(db, 'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(sqljsQueryAll(db, 'SELECT id FROM _migrations').map((r) => String(r.id)));
  const migrationFiles = readdirSync(absolutePath(options.migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  for (const file of migrationFiles) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(absolutePath(options.migrationsDir), file), 'utf-8');
    db.exec(sql);
    sqljsRun(db, 'INSERT INTO _migrations (id, applied_at) VALUES (?, ?)', [file, nowIso()]);
    await persist();
  }

  return {
    mode: 'sqljs',
    exec: async (sql: string) => {
      db.exec(sql);
    },
    queryAll: async (sql: string, params: unknown[] = []) => sqljsQueryAll(db, sql, params),
    queryOne: async (sql: string, params: unknown[] = []) => sqljsQueryOne(db, sql, params),
    run: async (sql: string, params: unknown[] = []) => {
      sqljsRun(db, sql, params);
    },
    persist,
    close: async () => {},
  };
}
