/**
 * Social sign-in (issue #136).
 *
 * The provider is the local stub, so the whole start → callback → link-or-create
 * → session path runs without real credentials. The tests that matter most are
 * the refusals: a forged state, an unverified email (account takeover), a
 * suspended account, and a password login against a provider-only account.
 */

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createTestDatabase, startServer } = require('./support/harness');

// Set before any module reads them (providers read env at call time).
process.env.OAUTH_STUB_ENABLED = 'true';
process.env.OAUTH_SIGNUP = 'true';
process.env.OAUTH_LINK_BY_EMAIL = 'true';

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
  await query('TRUNCATE users CASCADE');
  const oauth = require('../routes/oauth');
  if (oauth.resetOAuthLimiter) oauth.resetOAuthLimiter();
  const auth = require('../routes/auth');
  if (auth.resetAuthLimiter) auth.resetAuthLimiter();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function setCookies(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie();
  const one = res.headers.get('set-cookie');
  return one ? [one] : [];
}

function cookieNamed(res, name) {
  for (const cookie of setCookies(res)) {
    if (cookie.startsWith(`${name}=`)) return cookie.split(';')[0];
  }
  return null;
}

/** A fetch that does not follow redirects, so a 302 and its Location are visible. */
function rawFetch(target, { cookie } = {}) {
  const url = target.startsWith('http') ? target : `${server.baseUrl}${target}`;
  return fetch(url, {
    redirect: 'manual',
    headers: cookie ? { Cookie: cookie } : {},
  });
}

/** Begin a stub sign-in (the stub needs no external provider). */
function stubStart(email) {
  const query = email ? `?stub_email=${encodeURIComponent(email)}` : '';
  return rawFetch(`/api/auth/oauth/stub/start${query}`);
}

/** Full round trip. Returns the callback response and any session cookie. */
async function stubSignIn(email) {
  const start = await stubStart(email);
  assert.equal(start.status, 302, 'start should redirect');
  const stateCookie = cookieNamed(start, 'psx_oauth_state');
  assert.ok(stateCookie, 'start should set the state cookie');

  const callback = await rawFetch(start.headers.get('location'), { cookie: stateCookie });
  return { start, callback, sessionCookie: cookieNamed(callback, 'psx_session') };
}

// ── Provider list ────────────────────────────────────────────────────────────

test('only configured providers are listed', async () => {
  const res = await fetch(`${server.baseUrl}/api/auth/oauth/providers`);
  assert.equal(res.status, 200);
  const { providers } = await res.json();
  // Google/Facebook have no credentials in tests; only the stub is enabled.
  assert.deepEqual(providers.map((p) => p.id), ['stub']);
  assert.equal(providers[0].label, 'Stub (dev)');
});

test('an unknown provider is refused', async () => {
  const res = await rawFetch('/api/auth/oauth/nope/start');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, 'OAUTH_PROVIDER_UNKNOWN');
});

// ── Happy path ───────────────────────────────────────────────────────────────

test('a stub sign-in creates an account and issues the normal session cookie', async () => {
  const { callback, sessionCookie } = await stubSignIn('alice@example.com');
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /\/dashboard$/);
  assert.ok(sessionCookie, 'callback should set psx_session');

  const me = await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.equal(me.status, 200);
  const { user } = await me.json();
  assert.equal(user.email, 'alice@example.com');
  assert.equal(user.hasPassword, false, 'provider-only accounts have no password');
  assert.deepEqual(user.connectedProviders, ['stub']);

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(rows[0].n, 1);

  const events = await query("SELECT COUNT(*)::int AS n FROM user_events WHERE kind = 'oauth_signup'");
  assert.equal(events.rows[0].n, 1);
});

test('a second sign-in reuses the same account and audits oauth_login', async () => {
  await stubSignIn('bob@example.com');
  const second = await stubSignIn('bob@example.com');
  assert.ok(second.sessionCookie);

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(rows[0].n, 1, 'no duplicate account');

  const logins = await query("SELECT COUNT(*)::int AS n FROM user_events WHERE kind = 'oauth_login'");
  assert.equal(logins.rows[0].n, 1);
});

test('a verified provider email links to the existing password account', async () => {
  const hash = await bcrypt.hash('password123', 4);
  const created = await query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id`,
    ['carol@example.com', hash, 'Carol'],
  );
  const userId = created.rows[0].id;

  const { sessionCookie } = await stubSignIn('carol@example.com');
  assert.ok(sessionCookie);

  const me = await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: sessionCookie } });
  assert.equal((await me.json()).user.id, userId);

  const users = await query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(users.rows[0].n, 1, 'linked, not duplicated');

  const linked = await query('SELECT COUNT(*)::int AS n FROM oauth_accounts WHERE user_id = $1', [
    userId,
  ]);
  assert.equal(linked.rows[0].n, 1);

  const audit = await query("SELECT COUNT(*)::int AS n FROM user_events WHERE kind = 'oauth_linked'");
  assert.equal(audit.rows[0].n, 1);
});

// ── Refusals ─────────────────────────────────────────────────────────────────

test('a forged state is refused and issues no session', async () => {
  const start = await stubStart('dave@example.com');
  const location = new URL(start.headers.get('location'));
  location.searchParams.set('state', 'forged');

  const callback = await rawFetch(location.toString(), {
    cookie: cookieNamed(start, 'psx_oauth_state'),
  });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /oauth_error=state/);
  assert.equal(cookieNamed(callback, 'psx_session'), null);

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(rows[0].n, 0);
});

test('an unverified or missing email is never linked (account-takeover guard)', async () => {
  const { linkOrCreate, OAuthError } = require('../services/oauth/linkOrCreate');

  await assert.rejects(
    () =>
      linkOrCreate({
        provider: 'google',
        identity: { subject: 'x', email: 'erin@example.com', emailVerified: false, name: 'Erin' },
        oauthSignup: true,
        linkByEmail: true,
      }),
    (err) => err instanceof OAuthError && err.code === 'OAUTH_EMAIL_UNVERIFIED',
  );

  await assert.rejects(
    () =>
      linkOrCreate({
        provider: 'google',
        identity: { subject: 'y', email: null, emailVerified: false, name: 'No Mail' },
        oauthSignup: true,
        linkByEmail: true,
      }),
    (err) => err instanceof OAuthError && err.code === 'OAUTH_NO_EMAIL',
  );

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
  assert.equal(rows[0].n, 0);
});

test('new-account creation is refused when OAUTH_SIGNUP is off', async () => {
  const { linkOrCreate, OAuthError } = require('../services/oauth/linkOrCreate');
  await assert.rejects(
    () =>
      linkOrCreate({
        provider: 'google',
        identity: { subject: 'z', email: 'frank@example.com', emailVerified: true, name: 'Frank' },
        oauthSignup: false,
        linkByEmail: true,
      }),
    (err) => err instanceof OAuthError && err.code === 'SIGNUP_CLOSED',
  );
});

test('suspension wins at the callback', async () => {
  await stubSignIn('grace@example.com');
  await query(`UPDATE users SET is_active = false WHERE email = 'grace@example.com'`);

  const start = await stubStart('grace@example.com');
  const callback = await rawFetch(start.headers.get('location'), {
    cookie: cookieNamed(start, 'psx_oauth_state'),
  });
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /oauth_error=ACCOUNT_SUSPENDED/);
  assert.equal(cookieNamed(callback, 'psx_session'), null);
});

// ── Password interactions ────────────────────────────────────────────────────

test('a password login against a provider-only account answers USE_OAUTH', async () => {
  await stubSignIn('heidi@example.com');

  const res = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'heidi@example.com', password: 'anything123' }),
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'USE_OAUTH');
});

test('a provider-only account can set a password and then sign in with it', async () => {
  const { sessionCookie } = await stubSignIn('ivan@example.com');
  assert.ok(sessionCookie);

  const set = await fetch(`${server.baseUrl}/api/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ newPassword: 'brand-new-pass-1' }),
  });
  assert.equal(set.status, 200, 'setting a first password needs no current one');

  const login = await fetch(`${server.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ivan@example.com', password: 'brand-new-pass-1' }),
  });
  assert.equal(login.status, 200);
});

test('the last credential cannot be unlinked', async () => {
  const { sessionCookie } = await stubSignIn('judy@example.com');
  const res = await fetch(`${server.baseUrl}/api/auth/oauth/stub/unlink`, {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'LAST_CREDENTIAL');
});
