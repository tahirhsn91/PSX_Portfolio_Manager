/**
 * The permission matrix, end to end (issue #4).
 *
 * Every assertion runs against the real app, the real schema and real bcrypt
 * hashes. What this suite is here to catch is the class of bug that a UI cannot:
 * a route that is reachable when it should not be, or a role that is trusted
 * because the client said so.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let admin; // client, signed in as an admin
let user; // client, signed in as a plain user
let other; // client, a second plain user

async function signup(client, email, password = 'password123') {
  const res = await client.post('/api/auth/signup', { email, password, displayName: email });
  return res;
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
  // Cascades to portfolios, holdings and events.
  const { query } = require('../db/pool');
  await query('TRUNCATE users CASCADE');

  const first = await clientFor(server.baseUrl);
  // The first account of an empty instance is the admin — the fallback bootstrap.
  const created = await signup(first, 'first@example.com');
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, 'admin', 'the first account must be an admin');
  admin = first;

  user = await clientFor(server.baseUrl);
  await promoteToUser(user, 'user@example.com');

  other = await clientFor(server.baseUrl);
  await promoteToUser(other, 'other@example.com');
});

/** Create a plain account through the admin surface once it exists. */
async function promoteToUser(client, email) {
  // Sign-up is closed by default, so accounts come from an admin. Until
  // POST /api/users lands (decision 10 decides the first password), the suite
  // creates the row the way a provisioning step would: directly, then logs in.
  const bcrypt = require('bcryptjs');
  const { query } = require('../db/pool');
  const hash = await bcrypt.hash('password123', 4); // low cost: tests only
  await query(
    `INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user')`,
    [email, hash, email],
  );
  const res = await client.post('/api/auth/login', { email, password: 'password123' });
  assert.equal(res.status, 200, `expected ${email} to log in`);
}

describe('anonymous callers', () => {
  test('get 401 on every protected route', async () => {
    const anon = await clientFor(server.baseUrl);
    for (const path of ['/api/portfolios', '/api/users', '/api/auth/me']) {
      const res = await anon.get(path);
      assert.equal(res.status, 401, `${path} should be 401`);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    }
  });

  test('can still sign up while the instance is empty, and cannot afterwards', async () => {
    const { query } = require('../db/pool');
    await query('TRUNCATE users CASCADE');
    const anon = await clientFor(server.baseUrl);

    const firstRes = await signup(anon, 'bootstrap@example.com');
    assert.equal(firstRes.status, 201);
    assert.equal(firstRes.body.user.role, 'admin');

    const second = await clientFor(server.baseUrl);
    const secondRes = await signup(second, 'later@example.com');
    assert.equal(secondRes.status, 403, 'sign-up is closed once an account exists');
    assert.equal(secondRes.body.error.code, 'SIGNUP_CLOSED');
  });
});

describe('a plain user', () => {
  test('is refused every admin route with 403 FORBIDDEN', async () => {
    const resList = await user.get('/api/users');
    assert.equal(resList.status, 403);
    assert.equal(resList.body.error.code, 'FORBIDDEN');

    const resRole = await user.patch(`/api/users/${admin.userId ?? 'x'}/role`, { role: 'admin' });
    assert.equal(resRole.status, 403);
    const resStatus = await user.patch('/api/users/x/status', { isActive: false });
    assert.equal(resStatus.status, 403);
    const resDelete = await user.del('/api/users/x');
    assert.equal(resDelete.status, 403);
  });

  test('cannot raise their own role through a crafted request', async () => {
    // `role` is not a field the profile route accepts, so the request is rejected
    // outright rather than silently ignored.
    const res = await user.patch('/api/auth/me', { role: 'admin' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'INVALID_INPUT');

    const me = await user.get('/api/auth/me');
    assert.equal(me.body.user.role, 'user', 'still a user');
  });

  test('sees only their own portfolios', async () => {
    const mine = await user.post('/api/portfolios', { name: 'Mine', color: '#00a651' });
    assert.equal(mine.status, 201);
    const id = mine.body.portfolio.id ?? mine.body.portfolio?.id ?? mine.body.id;

    const theirs = await other.get(`/api/portfolios/${id}`);
    assert.equal(theirs.status, 404, 'another user gets 404, not 403');
  });
});

describe('an admin', () => {
  test('can list and search users', async () => {
    const all = await admin.get('/api/users');
    assert.equal(all.status, 200);
    assert.equal(all.body.users.length, 3);

    const searched = await admin.get('/api/users?q=other@');
    assert.equal(searched.body.users.length, 1);
    assert.equal(searched.body.users[0].email, 'other@example.com');
  });

  test('never receives a password hash in any payload', async () => {
    const res = await admin.get('/api/users');
    const serialized = JSON.stringify(res.body);
    assert.ok(!serialized.includes('password_hash'), 'no hash field');
    assert.ok(!serialized.includes('$2'), 'no bcrypt hash value');
  });

  test('gets 404 for another user\'s portfolio, exactly as a stranger would', async () => {
    const mine = await user.post('/api/portfolios', { name: 'Not yours', color: '#00a651' });
    const id = mine.body.portfolio?.id ?? mine.body.id;
    const res = await admin.get(`/api/portfolios/${id}`);
    assert.equal(res.status, 404, 'admins administer accounts, not portfolios');
  });

  test('can change a role, and it applies to that user\'s next request', async () => {
    const { rows } = await require('../db/pool').query(
      "SELECT id FROM users WHERE email = 'user@example.com'",
    );
    const targetId = rows[0].id;

    const promoted = await admin.patch(`/api/users/${targetId}/role`, { role: 'admin' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.user.role, 'admin');

    // The same cookie, no re-login: the middleware reads the role from the row.
    const nowAllowed = await user.get('/api/users');
    assert.equal(nowAllowed.status, 200, 'the promotion applies immediately');
  });

  test('writes an audit event naming themselves as the actor', async () => {
    const { rows: targetRows } = await require('../db/pool').query(
      "SELECT id FROM users WHERE email = 'other@example.com'",
    );
    await admin.patch(`/api/users/${targetRows[0].id}/role`, { role: 'admin' });

    const { rows: events } = await require('../db/pool').query(
      `SELECT kind, actor_id, meta FROM user_events WHERE user_id = $1 ORDER BY at DESC LIMIT 1`,
      [targetRows[0].id],
    );
    assert.equal(events[0].kind, 'role_changed');
    assert.ok(events[0].actor_id, 'the actor must be named');
    assert.equal(events[0].meta.to, 'admin');
  });

  test('cannot change their own role, suspend themselves, or remove the last admin', async () => {
    const { rows } = await require('../db/pool').query(
      "SELECT id FROM users WHERE email = 'first@example.com'",
    );
    const selfId = rows[0].id;

    const selfRole = await admin.patch(`/api/users/${selfId}/role`, { role: 'user' });
    assert.equal(selfRole.status, 400);
    assert.equal(selfRole.body.error.code, 'CANNOT_TARGET_SELF');

    const selfStatus = await admin.patch(`/api/users/${selfId}/status`, { isActive: false });
    assert.equal(selfStatus.status, 400);

    // Demote the others, leaving one admin, then try to remove them.
    const { rows: users } = await require('../db/pool').query(
      "SELECT id FROM users WHERE email <> 'first@example.com'",
    );
    for (const row of users) await admin.del(`/api/users/${row.id}`);

    const onlyAdmin = await admin.patch(`/api/users/${selfId}/status`, { isActive: false });
    assert.equal(onlyAdmin.status, 400, 'the last admin cannot be suspended either way');
  });
});

describe('suspension', () => {
  test('kills a live session on the very next request', async () => {
    const { rows } = await require('../db/pool').query(
      "SELECT id FROM users WHERE email = 'user@example.com'",
    );
    const targetId = rows[0].id;

    assert.equal((await user.get('/api/auth/me')).status, 200);
    const suspended = await admin.patch(`/api/users/${targetId}/status`, { isActive: false });
    assert.equal(suspended.status, 200);

    const after = await user.get('/api/auth/me');
    assert.equal(after.status, 401, 'no waiting for token expiry');
    assert.equal(after.body.error.code, 'ACCOUNT_SUSPENDED');

    // and logging in again is refused too
    const relogin = await user.post('/api/auth/login', {
      email: 'user@example.com',
      password: 'password123',
    });
    assert.equal(relogin.status, 403);
    assert.equal(relogin.body.error.code, 'ACCOUNT_SUSPENDED');
  });
});
