/**
 * Password reset by email (issue #139).
 *
 * The properties worth asserting are the ones a reset flow is judged on: an
 * unknown address is indistinguishable from a known one, a token is single-use
 * and time-limited, and a successful reset ends every other session. The mail
 * transport is the console stub here — no provider account, no network.
 */

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let query;

before(async () => {
  await createTestDatabase();
  await require('../db/migrate').runMigrations();
  server = await startServer();
  query = require('../db/pool').query;
});

after(async () => {
  if (server) await server.close();
  const pool = require('../db/pool');
  if (typeof pool.getPool === 'function') await pool.getPool().end();
});

beforeEach(async () => {
  // Cascades to password_resets and user_events.
  await query('TRUNCATE users CASCADE');
});

/** Provision an account directly; account creation is not this suite's subject. */
async function provision(email, { password = 'old-password-1', active = true } = {}) {
  const hash = await bcrypt.hash(password, 4);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, is_active)
     VALUES ($1, $2, $3, $4) RETURNING id, token_version`,
    [email, hash, 'Reset Tester', active],
  );
  return rows[0];
}

const resetRows = async (userId) => {
  const { rows } = await query(
    'SELECT * FROM password_resets WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return rows;
};

// ── POST /api/auth/forgot ─────────────────────────────────────────────────────

test('a known address mints one token and records the request', async () => {
  const user = await provision('known@example.com');
  const client = await clientFor(server.baseUrl);

  const res = await client.post('/api/auth/forgot', { email: 'known@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });

  const rows = await resetRows(user.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].used_at, null);
  assert.ok(new Date(rows[0].expires_at) > new Date());

  const { rows: events } = await query(
    `SELECT COUNT(*)::int AS n FROM user_events
      WHERE kind = 'password_reset_requested' AND user_id = $1`,
    [user.id],
  );
  assert.equal(events[0].n, 1);
});

test('an unknown address answers exactly as a known one and mints nothing', async () => {
  const user = await provision('known@example.com');
  const client = await clientFor(server.baseUrl);

  const known = await client.post('/api/auth/forgot', { email: 'known@example.com' });
  const unknown = await client.post('/api/auth/forgot', { email: 'nobody@example.com' });

  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body, unknown.body);

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM password_resets');
  assert.equal(rows[0].n, 1, 'only the known address may have a token');
  assert.equal((await resetRows(user.id)).length, 1);
});

test('a suspended account gets no token', async () => {
  const user = await provision('suspended@example.com', { active: false });
  const client = await clientFor(server.baseUrl);

  const res = await client.post('/api/auth/forgot', { email: 'suspended@example.com' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal((await resetRows(user.id)).length, 0);
});

test('a second request retires the first link', async () => {
  const user = await provision('twice@example.com');
  const { createReset } = require('../services/passwordReset');

  await createReset(user.id);
  await createReset(user.id);

  assert.equal((await resetRows(user.id)).length, 1, 'only one link may be live');
});

// ── POST /api/auth/reset ──────────────────────────────────────────────────────

test('a valid token sets the password, ends other sessions and cannot be reused', async () => {
  const user = await provision('reset@example.com');
  const { createReset } = require('../services/passwordReset');

  // A session that exists before the reset.
  const session = await clientFor(server.baseUrl);
  const login = await session.post('/api/auth/login', {
    email: 'reset@example.com',
    password: 'old-password-1',
  });
  assert.equal(login.status, 200);

  const token = await createReset(user.id);
  const client = await clientFor(server.baseUrl);
  const res = await client.post('/api/auth/reset', {
    token,
    newPassword: 'brand-new-pass-9',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });

  // Old password out, new password in.
  const fresh = await clientFor(server.baseUrl);
  const oldLogin = await fresh.post('/api/auth/login', {
    email: 'reset@example.com',
    password: 'old-password-1',
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await fresh.post('/api/auth/login', {
    email: 'reset@example.com',
    password: 'brand-new-pass-9',
  });
  assert.equal(newLogin.status, 200);

  // The pre-reset cookie is still in hand, but token_version moved past it.
  const me = await session.get('/api/auth/me');
  assert.equal(me.status, 401, 'a reset must evict other sessions');

  // Single use.
  const replay = await clientFor(server.baseUrl);
  const again = await replay.post('/api/auth/reset', {
    token,
    newPassword: 'another-pass-10',
  });
  assert.equal(again.status, 400);
  assert.equal(again.body.error.code, 'RESET_TOKEN_INVALID');

  const { rows: events } = await query(
    `SELECT COUNT(*)::int AS n FROM user_events
      WHERE kind = 'password_reset_completed' AND user_id = $1`,
    [user.id],
  );
  assert.equal(events[0].n, 1);
});

test('an expired token is refused', async () => {
  const user = await provision('expired@example.com');
  const { hashToken } = require('../services/passwordReset');

  const token = 'expired-token-value';
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() - INTERVAL '1 minute')`,
    [user.id, hashToken(token)],
  );

  const client = await clientFor(server.baseUrl);
  const res = await client.post('/api/auth/reset', {
    token,
    newPassword: 'whatever-pass-11',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'RESET_TOKEN_INVALID');
});

test('an unknown token is refused with the same code', async () => {
  const client = await clientFor(server.baseUrl);
  const res = await client.post('/api/auth/reset', {
    token: 'not-a-real-token',
    newPassword: 'whatever-pass-12',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'RESET_TOKEN_INVALID');
});

test('a short password is refused without burning the token', async () => {
  const user = await provision('short@example.com');
  const { createReset } = require('../services/passwordReset');
  const token = await createReset(user.id);

  const client = await clientFor(server.baseUrl);
  const res = await client.post('/api/auth/reset', { token, newPassword: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_INPUT');

  const rows = await resetRows(user.id);
  assert.equal(rows[0].used_at, null, 'a rejected password must not consume the link');
});

test('the test environment selects the console stub, not a real transport', async () => {
  const { transportName } = require('../services/mail');
  assert.equal(transportName(), 'stub');
});
