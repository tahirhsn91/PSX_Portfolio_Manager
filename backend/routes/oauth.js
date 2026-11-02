/**
 * Social sign-in routes (issue #136), mounted at /api/auth/oauth.
 *
 * The flow is the server-side Authorization Code flow with PKCE: this router
 * builds the provider URL, receives the callback, exchanges the code, resolves
 * the identity to a user (linkOrCreate) and issues the app's own `psx_session`
 * cookie. No provider token ever reaches the browser.
 *
 * Failures redirect back to `/login?oauth_error=<code>` rather than rendering a
 * JSON error: the browser arrives here by navigation, not fetch, so it must land
 * on a page it can retry from.
 */

'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { createRateLimiter } = require('../middleware/rateLimit');
const {
  COOKIE_NAME: SESSION_COOKIE,
  ISSUER: SESSION_ISSUER,
  signSession,
  setSessionCookie,
  requireAuth,
} = require('../middleware/auth');
const { recordEvent, clientIp } = require('../services/users');
const providers = require('../services/oauth/providers');
const state = require('../services/oauth/state');
const { linkOrCreate, OAuthError } = require('../services/oauth/linkOrCreate');

const router = express.Router();

// Shares the auth budget: one IP gets 20 starts/callbacks per 15 minutes.
const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });

/** Where the callback lives. An absolute base is required behind TLS/proxies. */
function callbackBase(req) {
  const configured = (process.env.OAUTH_CALLBACK_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}/api/auth/oauth`;
}

function redirectUriFor(req, providerId) {
  return `${callbackBase(req)}/${providerId}/callback`;
}

/** The app origin the browser returns to after the callback. */
function appBase(req) {
  const configured = (process.env.ALLOWED_ORIGIN || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function fail(res, req, code) {
  const url = new URL('/login', appBase(req));
  url.searchParams.set('oauth_error', code);
  return res.redirect(302, url.toString());
}

/** The signed-in user id from the session cookie, or null. Never trusted alone. */
function softSessionUserId(req) {
  const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { issuer: SESSION_ISSUER }).sub ?? null;
  } catch {
    return null;
  }
}

// ── GET /api/auth/oauth/providers ────────────────────────────────────────────
// Configured providers only — the UI renders exactly this list, so an
// unconfigured provider produces no button at all.
router.get('/providers', (_req, res) => {
  res.json({ providers: providers.listProviders() });
});

// ── GET /api/auth/oauth/:provider/start ──────────────────────────────────────
router.get('/:provider/start', authLimiter, (req, res) => {
  const provider = providers.getProvider(req.params.provider);
  if (!provider) {
    return res.status(404).json({
      error: { code: 'OAUTH_PROVIDER_UNKNOWN', message: 'Unknown sign-in provider' },
    });
  }

  // An account-link attempt is only honoured for a signed-in user; the id is
  // carried inside the signed state cookie, never in the query string.
  let linkUserId = null;
  if (req.query.link === '1') {
    linkUserId = softSessionUserId(req);
    if (!linkUserId) {
      return res.status(401).json({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in to connect a provider' },
      });
    }
  }

  const { verifier, challenge } = state.pkce();
  const nonce = state.nonce();
  // Dev convenience: choose the stub's address without real credentials.
  const stubEmail =
    provider.id === 'stub' && typeof req.query.stub_email === 'string'
      ? req.query.stub_email.trim().slice(0, 200)
      : null;

  const issued = state.issue({
    provider: provider.id,
    verifier,
    nonce,
    linkUserId,
    stubEmail,
  });
  state.setCookie(res, issued.token);

  const url = provider.authorizeUrl({
    state: issued.state,
    codeChallenge: challenge,
    redirectUri: redirectUriFor(req, provider.id),
    nonce,
  });
  return res.redirect(302, url);
});

// ── GET /api/auth/oauth/:provider/callback ───────────────────────────────────
router.get('/:provider/callback', authLimiter, async (req, res) => {
  const provider = providers.getProvider(req.params.provider);
  if (!provider) return fail(res, req, 'provider');

  // A cancelled consent screen arrives as ?error=access_denied.
  if (typeof req.query.error === 'string') return fail(res, req, 'cancelled');

  const saved = state.read(req);
  state.clearCookie(res);

  if (!saved || saved.provider !== provider.id) return fail(res, req, 'state');
  if (typeof req.query.state !== 'string' || !state.safeEqual(saved.state, req.query.state)) {
    return fail(res, req, 'state');
  }
  if (typeof req.query.code !== 'string' || !req.query.code) return fail(res, req, 'code');

  let identity;
  try {
    identity = await provider.exchange({
      code: req.query.code,
      codeVerifier: saved.verifier,
      redirectUri: redirectUriFor(req, provider.id),
      statePayload: saved,
    });
  } catch (err) {
    console.error(`[oauth] ${provider.id} exchange failed: ${err.code || err.message}`);
    return fail(res, req, 'exchange');
  }

  let result;
  try {
    result = await linkOrCreate({
      provider: provider.id,
      identity,
      linkUserId: saved.linkUserId,
      oauthSignup: process.env.OAUTH_SIGNUP === 'true',
      linkByEmail: process.env.OAUTH_LINK_BY_EMAIL !== 'false',
    });
  } catch (err) {
    if (err instanceof OAuthError) return fail(res, req, err.code);
    throw err;
  }

  const kind =
    result.outcome === 'signup' ? 'oauth_signup' : result.outcome === 'linked' ? 'oauth_linked' : 'oauth_login';
  await recordEvent(kind, { userId: result.user.id, ip: clientIp(req) });

  setSessionCookie(res, signSession(result.user));
  return res.redirect(302, new URL('/dashboard', appBase(req)).toString());
});

// ── POST /api/auth/oauth/:provider/unlink ────────────────────────────────────
router.post('/:provider/unlink', requireAuth, async (req, res) => {
  const providerId = req.params.provider;
  const { query } = require('../db/pool');

  const linked = await query(
    `SELECT id FROM oauth_accounts WHERE user_id = $1 AND provider = $2`,
    [req.user.id, providerId],
  );
  if (!linked.rows.length) {
    return res.status(404).json({ error: { code: 'OAUTH_NOT_LINKED', message: 'That provider is not connected' } });
  }

  // Never leave an account with no way to sign in: require a password or
  // another connected provider first.
  const [password, others] = await Promise.all([
    query(`SELECT password_hash FROM users WHERE id = $1`, [req.user.id]),
    query(
      `SELECT 1 FROM oauth_accounts WHERE user_id = $1 AND provider <> $2 LIMIT 1`,
      [req.user.id, providerId],
    ),
  ]);
  const hasPassword = Boolean(password.rows[0]?.password_hash);
  if (!hasPassword && !others.rows.length) {
    return res.status(409).json({
      error: {
        code: 'LAST_CREDENTIAL',
        message: 'Connect another sign-in method or set a password before disconnecting this one',
      },
    });
  }

  await query(`DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2`, [
    req.user.id,
    providerId,
  ]);
  await recordEvent('oauth_unlinked', { userId: req.user.id, ip: clientIp(req) });
  return res.json({ ok: true });
});

module.exports = router;
// Exposed so the test suite can clear the shared budget between cases.
router.resetOAuthLimiter = () => authLimiter.reset();
