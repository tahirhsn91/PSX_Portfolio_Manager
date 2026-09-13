/**
 * PostgreSQL connection pool + startup validation.
 *
 * Config comes from the process environment, which Docker Compose fills from
 * .env.local (env_file) plus a per-profile DB_HOST literal:
 *
 *   DB_HOST            db-dev | db-prod          (compose service name)
 *   DB_PORT            5432                      (optional)
 *   POSTGRES_USER      psx
 *   POSTGRES_PASSWORD  <secret>
 *   POSTGRES_DB        psx_portfolio
 *
 * DATABASE_URL, if set, wins over the discrete vars.
 *
 * `DATABASE_URL` is deliberately NOT composed in docker-compose.yml: Compose
 * interpolates ${...} from the shell/.env only (not .env.local), so building
 * the URL there would init Postgres with one password and connect with another.
 */

'use strict';

const { Pool } = require('pg');

const REQUIRED = ['DB_HOST', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'];

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing database environment: ${missing.join(', ')}.\n` +
        'These come from .env.local (see .env.example) — copy it and set the ' +
        'POSTGRES_* values, then rebuild the proxy.',
    );
  }

  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  };
}

let pool = null;

/** Lazily create the pool so a missing config only fails when the DB is used. */
function getPool() {
  if (!pool) {
    pool = new Pool({
      ...buildConfig(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[db] idle client error:', err.message);
    });
  }
  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

/** Single round-trip connectivity check used by /health and startup logging. */
async function ping() {
  const { rows } = await query('SELECT current_database() AS db, current_user AS usr, NOW() AS now');
  return rows[0];
}

/** Close the pool — used by tests and graceful shutdown. */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, ping, close, buildConfig };
