/**
 * The initial administrator (issue #4, decision 5).
 *
 * The invariant that matters most is the boring one: the seed must never touch an
 * account that already exists. A seed that resets the admin password on every boot
 * is a permanent backdoor, and it looks identical to a working seed in any test
 * that only asserts the first run.
 */

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase } = require('./support/harness');

before(async () => {
  await createTestDatabase();
  const { runMigrations } = require('../db/migrate');
  await runMigrations();
});

after(async () => {
  const pool = require('../db/pool');
  for (const fn of ['getPool', 'pool']) {
    if (typeof pool[fn] === 'function') {
      const p = pool[fn]();
      if (p && typeof p.end === 'function') await p.end();
      break;
    }
  }
});

const { seedAdmin } = require('../services/seedAdmin');

beforeEach(async () => {
  await require('../db/pool').query('TRUNCATE users CASCADE');
});

test('creates the admin on an empty instance, hashed and flagged', async () => {
  const outcome = await seedAdmin({ email: 'superadmin@xyz.com', password: 'seed-password-1' });
  assert.deepEqual(outcome.action, 'created');

  const { rows } = await require('../db/pool').query(
    'SELECT email, role, is_active, must_change_password, password_hash FROM users',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, 'superadmin@xyz.com');
  assert.equal(rows[0].role, 'admin');
  assert.equal(rows[0].is_active, true);
  assert.equal(rows[0].must_change_password, true, 'the first login must change it');

  const serialized = JSON.stringify(rows[0]);
  assert.ok(!serialized.includes('seed-password-1'), 'the plaintext is never stored');
  assert.match(rows[0].password_hash, /^\$2[aby]\$/, 'stored as a bcrypt hash');
});

test('is idempotent and never resets an existing password', async () => {
  await seedAdmin({ email: 'superadmin@xyz.com', password: 'seed-password-1' });
  const { rows: before } = await require('../db/pool').query(
    'SELECT password_hash FROM users WHERE email = $1',
    ['superadmin@xyz.com'],
  );

  const second = await seedAdmin({ email: 'superadmin@xyz.com', password: 'a-different-one' });
  assert.equal(second.action, 'exists', 'a second run must not create anything');

  const { rows: after } = await require('../db/pool').query(
    'SELECT password_hash FROM users WHERE email = $1',
    ['superadmin@xyz.com'],
  );
  assert.equal(after[0].password_hash, before[0].password_hash, 'the password survives');
  assert.equal((await require('../db/pool').query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n, 1);
});

test('does nothing once any admin exists, so it is not a second way in', async () => {
  await require('../db/pool').query(
    `INSERT INTO users (email, password_hash, role) VALUES ('someone@example.com', '$2a$12$x', 'admin')`,
  );
  const outcome = await seedAdmin({ email: 'superadmin@xyz.com', password: 'seed-password-1' });
  assert.equal(outcome.action, 'exists');
  const { rows } = await require('../db/pool').query(
    "SELECT COUNT(*)::int AS n FROM users WHERE email = 'superadmin@xyz.com'",
  );
  assert.equal(rows[0].n, 0);
});

test('skips quietly when unconfigured, and refuses a short password', async () => {
  assert.equal((await seedAdmin({ email: '', password: '' })).action, 'skipped');
  assert.equal((await seedAdmin({ email: '', password: '' })).reason, 'not-configured');

  const short = await seedAdmin({ email: 'superadmin@xyz.com', password: 'short' });
  assert.equal(short.action, 'skipped');
  assert.equal((await require('../db/pool').query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n, 0);
});
