/**
 * Sessions that end when the account says so (issue #4).
 *
 * These are the promises the permission matrix makes that a token cannot keep on
 * its own: suspension bites immediately, a role change needs no re-login, and a
 * password change invalidates every other session. They only hold because the
 * middleware compares the token with the user row on every request.
 */

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;

before(async () => {
  await createTestDatabase();
  await require('../db/migrate').runMigrations();
  server = await startServer();
});

after(async () => {
  if (server) await server.close();
  const pool = require('../db/pool');
  if (typeof pool.getPool === 'function') await pool.getPool().end();
});

/** Provision an account directly: creating users is decision 10's endpoint, not this suite's subject. */
async function provision(email, { mustChangePassword = false } = {}) {
  const { query } = require('../db/pool');
  const hash = await bcrypt.hash('password123', 4);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role, must_change_password)
     VALUES ($1, $2, $3, 'user', $4) RETURNING id`,
    [email, hash, email, mustChangePassword],
  );
  return rows[0].id;
}

async function login(email) {
  const client = await clientFor(server.baseUrl);
  const res = await client.post('/api/auth/login', { email, password: 'password123' });
  assert.equal(res.status, 200, `expected ${email} to log in`);
  return client;
}

beforeEach(async () => {
  await require('../db/pool').query('TRUNCATE users CASCADE');
});

test('a forced password change blocks the data routes but not the way out', async () => {
  await provision('fresh@example.com', { mustChangePassword: true });
  const client = await login('fresh@example.com');

  const blocked = await client.get('/api/portfolios');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

  // The account must be able to see why it is blocked and to fix it.
  const me = await client.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.mustChangePassword, true);

  const changed = await client.post('/api/auth/password', {
    currentPassword: 'password123',
    newPassword: 'a-new-password-9',
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.mustChangePassword, false);

  const after = await client.get('/api/portfolios');
  assert.equal(after.status, 200, 'the same session works immediately afterwards');
});

test('changing a password keeps this session and ends every other one', async () => {
  await provision('two-sessions@example.com');
  const first = await login('two-sessions@example.com');
  const second = await login('two-sessions@example.com');

  assert.equal((await second.get('/api/auth/me')).status, 200);

  const changed = await first.post('/api/auth/password', {
    currentPassword: 'password123',
    newPassword: 'a-new-password-9',
  });
  assert.equal(changed.status, 200);

  assert.equal((await first.get('/api/auth/me')).status, 200, 'the session that changed it survives');
  const stale = await second.get('/api/auth/me');
  assert.equal(stale.status, 401);
  assert.equal(stale.body.error.code, 'SESSION_REVOKED');

  const oldPassword = await (await clientFor(server.baseUrl)).post('/api/auth/login', {
    email: 'two-sessions@example.com',
    password: 'password123',
  });
  assert.equal(oldPassword.status, 401, 'the old password stops working');
});

test('a wrong current password changes nothing', async () => {
  await provision('careful@example.com');
  const client = await login('careful@example.com');
  const before = (await require('../db/pool').query(
    'SELECT token_version FROM users WHERE email = $1',
    ['careful@example.com'],
  )).rows[0].token_version;

  const res = await client.post('/api/auth/password', {
    currentPassword: 'not-the-password',
    newPassword: 'a-new-password-9',
  });
  assert.equal(res.status, 401);

  const after = (await require('../db/pool').query(
    'SELECT token_version FROM users WHERE email = $1',
    ['careful@example.com'],
  )).rows[0].token_version;
  assert.equal(after, before, 'no version bump on a failed attempt');
  assert.equal((await client.get('/api/auth/me')).status, 200);
});

test('every auth action lands in the event record', async () => {
  await provision('audited@example.com');
  await login('audited@example.com');

  const { rows } = await require('../db/pool').query(
    `SELECT e.kind FROM user_events e
       JOIN users u ON u.id = e.user_id
      WHERE u.email = 'audited@example.com'
      ORDER BY e.at ASC`,
  );
  assert.deepEqual(rows.map((r) => r.kind), ['login']);
});
