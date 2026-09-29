/**
 * Admin-created accounts, end to end (issue #4: decision 10, and the criterion that
 * no password can be read back).
 *
 * The shape being pinned: the server chooses the first password, shows it exactly
 * once, stores only a bcrypt hash, and the account cannot use the app until it has
 * replaced that password. Every assertion runs against the real app and real hashes,
 * because the thing worth catching is a password that is recoverable.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let admin; // the instance's first account, which is an admin
let plainUser; // a signed-in account with role `user`

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

  admin = await clientFor(server.baseUrl);
  const first = await admin.post('/api/auth/signup', {
    email: 'boss@example.com',
    password: 'password123',
    displayName: 'boss@example.com',
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.user.role, 'admin');

  plainUser = await clientFor(server.baseUrl);
  const bcrypt = require('bcryptjs');
  await query(
    `INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user')`,
    ['plain@example.com', await bcrypt.hash('password123', 4), 'plain@example.com'],
  );
  assert.equal(
    (await plainUser.post('/api/auth/login', { email: 'plain@example.com', password: 'password123' }))
      .status,
    200,
  );
});

const createAccount = (body) => admin.post('/api/users', body);

describe('creating an account', () => {
  test('returns a generated first password once, and flags the account', async () => {
    const res = await createAccount({ email: 'New.User@Example.com', displayName: 'New User' });

    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.email, 'new.user@example.com', 'the address is normalised');
    assert.equal(res.body.user.role, 'user', 'the default role is the lesser one');
    assert.equal(res.body.user.mustChangePassword, true);
    assert.equal(res.body.user.isActive, true);
    assert.equal(typeof res.body.firstPassword, 'string');
    assert.ok(res.body.firstPassword.length >= 12, 'the generated password should be long');

    // It is never returned again.
    const listed = await admin.get('/api/users');
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.body).includes(res.body.firstPassword), false);
  });

  test('grants the requested role', async () => {
    const res = await createAccount({ email: 'second.admin@example.com', role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'admin');
  });

  test('stores only a hash — the password itself appears nowhere in the row', async () => {
    const res = await createAccount({ email: 'stored@example.com' });
    const { firstPassword } = res.body;

    const { query } = require('../db/pool');
    const { rows } = await query('SELECT password_hash, email FROM users WHERE email = $1', [
      'stored@example.com',
    ]);
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].password_hash, firstPassword, 'the password must not be stored');
    assert.match(rows[0].password_hash, /\$2[aby]\$/, 'it should be a bcrypt hash');
    assert.equal(rows[0].password_hash.includes(firstPassword), false);

    // And nothing anywhere else in the database holds it either.
    const { rows: anywhereElse } = await query(
      `SELECT COUNT(*)::int AS n FROM user_events WHERE meta::text ILIKE '%' || $1 || '%'`,
      [firstPassword],
    );
    assert.equal(anywhereElse[0].n, 0, 'the password must not reach the event log');
  });

  test('the new account can sign in, and cannot use the app until it changes its password', async () => {
    const res = await createAccount({ email: 'fresh@example.com' });
    const { firstPassword } = res.body;

    const fresh = await clientFor(server.baseUrl);
    const login = await fresh.post('/api/auth/login', {
      email: 'fresh@example.com',
      password: firstPassword,
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.mustChangePassword, true);

    // The data routes are shut until the password is theirs.
    const blocked = await fresh.get('/api/portfolios');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

    // The way out stays open.
    const changed = await fresh.post('/api/auth/password', {
      currentPassword: firstPassword,
      newPassword: 'their-own-password-1',
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    assert.equal(changed.body.user.mustChangePassword, false);

    const after = await fresh.get('/api/portfolios');
    assert.equal(after.status, 200);
  });

  test('refuses an email that is already in use', async () => {
    assert.equal((await createAccount({ email: 'taken@example.com' })).status, 201);
    const again = await createAccount({ email: 'TAKEN@example.com' });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'EMAIL_TAKEN');
  });

  test('refuses a malformed email and an unknown role, without creating anything', async () => {
    assert.equal((await createAccount({ email: 'not-an-email' })).status, 400);
    assert.equal((await createAccount({ email: 'x@example.com', role: 'superuser' })).status, 400);

    const { query } = require('../db/pool');
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM users WHERE email = 'x@example.com'`);
    assert.equal(rows[0].n, 0);
  });

  test('records who created the account', async () => {
    const res = await createAccount({ email: 'audited@example.com' });
    const { query } = require('../db/pool');
    const { rows } = await query(
      `SELECT kind, actor_id, meta FROM user_events WHERE user_id = $1`,
      [res.body.user.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'signup');
    assert.ok(rows[0].actor_id, 'the admin who did it must be named');
    assert.equal(rows[0].meta.createdByAdmin, true);
  });
});

describe('who may create accounts', () => {
  test('a plain user is refused, and so is a signed-out caller', async () => {
    const asUser = await plainUser.post('/api/users', { email: 'nobody@example.com' });
    assert.equal(asUser.status, 403);

    const anon = await clientFor(server.baseUrl);
    const asAnon = await anon.post('/api/users', { email: 'nobody@example.com' });
    assert.equal(asAnon.status, 401);

    const { query } = require('../db/pool');
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM users WHERE email = 'nobody@example.com'`,
    );
    assert.equal(rows[0].n, 0, 'neither attempt should have created anything');
  });
});
