/**
 * Test harness for the proxy's first backend suite (`node --test`).
 *
 * Two things this file exists to guarantee:
 *
 * 1. **It can never touch a real database.** The target name must end in `_test`,
 *    or the harness refuses to start. The dev stack shares one Postgres service
 *    with a live worker, and a suite that truncates the wrong database is worse
 *    than no suite at all.
 * 2. **It exercises the real app and the real schema** — migrations applied, no
 *    mocks — because the permission matrix is only worth asserting end to end.
 *
 * Environment is set *before* the pool is required: db/pool.js reads POSTGRES_* at
 * require time, so the order here is load-bearing.
 */

'use strict';

const { Client } = require('pg');

const baseDatabase = process.env.POSTGRES_DB || 'psx_portfolio';
const TEST_DATABASE = process.env.TEST_DATABASE || `${baseDatabase}_test`;

if (!/_test$/.test(TEST_DATABASE)) {
  throw new Error(
    `Refusing to run: test database "${TEST_DATABASE}" must end in "_test". ` +
      'This suite truncates tables and must never point at a live database.',
  );
}

process.env.POSTGRES_DB = TEST_DATABASE;
process.env.JWT_SECRET = 'test-secret-that-is-long-enough';
process.env.ALLOW_PUBLIC_SIGNUP = 'false';
process.env.NODE_ENV = 'test';

/** Create the test database if it does not exist, using the maintenance DB. */
async function createTestDatabase() {
  // Same variable names as db/pool.js: DB_HOST/DB_PORT, not POSTGRES_HOST/PORT.
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  } catch (err) {
    // 42P04 = "database already exists"; 23505 arrives when two test files race
    // to create it, which is what happens the moment a second file starts.
    if (!['42P04', '23505'].includes(err.code)) throw err;
  } finally {
    await client.end();
  }
}

/** Start the real app on an ephemeral port. Returns { baseUrl, close }. */
async function startServer() {
  const { app, connectDatabase } = require('../../index');
  // Migrations + the connectivity check that flips the routes' DB gate open.
  // Without this every /api/* route answers 503 before it reaches a single test.
  await connectDatabase();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * A cookie-aware JSON client. Node 18's fetch has everything needed, so the suite
 * adds no dependency to a package that has none for testing.
 */
function makeClient(baseUrl) {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    setCookie(value) {
      cookie = value;
    },
    async call(method, path, body, { withCookie = true } = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie && withCookie) headers.Cookie = cookie;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      // getSetCookie() is Node 20+; the fallback regex works on 18 as well and
      // deliberately cannot be fooled by a comma inside an Expires attribute.
      const raw = res.headers.getSetCookie
        ? (res.headers.getSetCookie() ?? []).join('; ')
        : (res.headers.get('set-cookie') ?? '');
      const session = /psx_session=([^;]*)/.exec(raw);
      if (session) cookie = `psx_session=${session[1]}`;
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, body: json };
    },
  };
}

/** Convenience wrappers used by the suites. */
async function clientFor(baseUrl) {
  // The auth limiter is real and in-process: its 20 attempts per 15 minutes are
  // shared by every test, because they all arrive from 127.0.0.1.
  const auth = require('../../routes/auth');
  if (auth.resetAuthLimiter) auth.resetAuthLimiter();

  const client = makeClient(baseUrl);
  client.get = (path, opts) => client.call('GET', path, undefined, opts);
  client.post = (path, body, opts) => client.call('POST', path, body, opts);
  client.patch = (path, body, opts) => client.call('PATCH', path, body, opts);
  client.del = (path, opts) => client.call('DELETE', path, undefined, opts);
  return client;
}

module.exports = { TEST_DATABASE, createTestDatabase, startServer, clientFor };
