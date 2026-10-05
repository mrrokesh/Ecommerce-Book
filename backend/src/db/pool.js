import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { Pool } = pg;

let embedded = null;
let pool = null;

const EMBEDDED_PORT = Number(process.env.EMBEDDED_PG_PORT || 54329);
const EMBEDDED_CFG = {
  host: '127.0.0.1',
  port: EMBEDDED_PORT,
  user: 'postgres',
  password: 'salem',
  database: 'salem_book_house',
};

async function canConnect(cfg) {
  const test = new Pool({ ...cfg, connectionTimeoutMillis: 2000, max: 1 });
  try {
    await test.query('SELECT 1');
    await test.end();
    return true;
  } catch {
    try {
      await test.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

export async function getPool() {
  if (pool) return pool;

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (databaseUrl && !databaseUrl.includes('YOUR_PASSWORD')) {
    const disableSsl = /sslmode=disable/i.test(databaseUrl);
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: disableSsl ? false : undefined,
      connectionTimeoutMillis: 20000,
    });
    console.log('Using DATABASE_URL (remote PostgreSQL)');
    return pool;
  }

  // Reuse already-running embedded Postgres when possible
  if (await canConnect(EMBEDDED_CFG)) {
    pool = new Pool(EMBEDDED_CFG);
    process.env.DATABASE_URL = `postgresql://postgres:salem@127.0.0.1:${EMBEDDED_PORT}/salem_book_house`;
    return pool;
  }

  // Also try connecting to postgres DB first (before salem_book_house exists)
  const adminCfg = { ...EMBEDDED_CFG, database: 'postgres' };
  const adminUp = await canConnect(adminCfg);

  if (!adminUp) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dataDir = path.join(__dirname, '../../.pgdata');
    embedded = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'salem',
      port: EMBEDDED_PORT,
      persistent: true,
    });

    const alreadyInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (!alreadyInit) {
      await embedded.initialise();
    }
    try {
      await embedded.start();
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (!/already|lock file/i.test(msg)) {
        // If start failed for another reason, still try to connect below
        console.warn('Embedded Postgres start warning:', msg || err);
      }
    }
  }

  // Ensure database exists
  const admin = new Pool({ ...adminCfg, connectionTimeoutMillis: 5000 });
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', ['salem_book_house']);
    if (!exists.rowCount) {
      await admin.query('CREATE DATABASE salem_book_house');
    }
  } catch (err) {
    console.warn('Create database note:', err?.message || err);
  } finally {
    await admin.end().catch(() => {});
  }

  pool = new Pool(EMBEDDED_CFG);
  process.env.DATABASE_URL = `postgresql://postgres:salem@127.0.0.1:${EMBEDDED_PORT}/salem_book_house`;
  return pool;
}

export async function query(text, params) {
  const p = await getPool();
  return p.query(text, params);
}

export default { getPool, query };
