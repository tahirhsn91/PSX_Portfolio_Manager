/**
 * "Last seen" — the timestamp the admin roster shows, and the Profile page repeats.
 *
 * The case worth pinning is the one that produced a wrong-looking value: an account that
 * signs in and then simply keeps using the app. A stamp only the login route writes goes
 * stale for as long as the session lives, which is what made a two-day-old sign-in look
 * like a bug in the format.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let user;
let id;

async function seenAt() {
  const { query } = require('../db/pool');
  const { rows } = await query('SELECT last_seen_at FROM users WHERE id = $1', [id]);
  return rows[0].last_seen_at;
}

async function ageIt(interval) {
  const { query } = require('../db/pool');
  await query(`UPDATE users SET last_seen_at = NOW() - INTERVAL '${interval}' WHERE id = $1`, [id]);
}

before(async () => {
  await createTestDatabase();
  const { runMigrations } = require('../db/migrate');
  await runMigrations();
  server = await startServer();
});

after(async () => {
  if (server) await server.close();
  const { close } = require('../db/pool');
  if (close) await close();
});

beforeEach(async () => {
  const { query } = require('../db/pool');
  await query('TRUNCATE users CASCADE');

  const bcrypt = require('bcryptjs');
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role, last_seen_at)
     VALUES ($1, $2, $3, 'user', NULL) RETURNING id`,
    ['seen@example.com', await bcrypt.hash('password123', 4), 'seen@example.com'],
  );
  id = rows[0].id;

  user = await clientFor(server.baseUrl);
  const login = await user.post('/api/auth/login', {
    email: 'seen@example.com',
    password: 'password123',
  });
  assert.equal(login.status, 200);
});

describe('last seen', () => {
  test('a sign-in stamps it', async () => {
    assert.ok(await seenAt(), 'signing in should have stamped last_seen_at');
  });

  test('opening the app stamps it again, so a long session cannot go stale', async () => {
    await ageIt('2 days');
    const before = await seenAt();

    const res = await user.get('/api/auth/me');
    assert.equal(res.status, 200);

    const stored = await seenAt();
    assert.ok(stored > before, 'GET /me should move the stored value forward');
    assert.equal(
      new Date(res.body.user.lastSeenAt).getTime(),
      stored.getTime(),
      'and the response should report the same stamp the column now holds',
    );
  });

  test('but no more than once a minute — a burst of focuses is not a burst of writes', async () => {
    await ageIt('2 days');
    await user.get('/api/auth/me'); // this one writes
    const stamped = await seenAt();

    await user.get('/api/auth/me'); // these two must not
    await user.get('/api/auth/me');

    assert.equal(
      (await seenAt()).getTime(),
      stamped.getTime(),
      'a call inside the throttle window must leave the stamp alone',
    );
  });

  test('a value already inside the window is reported as it stands', async () => {
    await ageIt('10 seconds');
    const stamped = await seenAt();

    const res = await user.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(
      new Date(res.body.user.lastSeenAt).getTime(),
      stamped.getTime(),
      'the response should carry the existing stamp rather than an invented one',
    );
  });
});
