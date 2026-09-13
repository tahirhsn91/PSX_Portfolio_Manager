/**
 * Schema migration runner.
 *
 * Applies every `db/NNN_*.sql` file in order, once, inside a transaction, and
 * records the filename in `schema_migrations`. Safe to run on every boot.
 *
 *   node db/migrate.js        (or: require('./migrate').runMigrations())
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');

const MIGRATIONS_DIR = __dirname;

function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

async function runMigrations() {
  const client = await getPool().connect();
  const applied = [];

  try {
    // schema_migrations is created by 001_init.sql, so create it defensively
    // first — otherwise the very first run has nowhere to record progress.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const done = new Set(rows.map((r) => r.version));

    for (const file of migrationFiles()) {
      if (done.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
        console.log(`[db] applied migration ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
  }

  return applied;
}

if (require.main === module) {
  runMigrations()
    .then(async (applied) => {
      console.log(applied.length ? `[db] migrated: ${applied.join(', ')}` : '[db] schema up to date');
      const { close } = require('./pool');
      await close();
    })
    .catch((err) => {
      console.error('[db] migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations, migrationFiles };
