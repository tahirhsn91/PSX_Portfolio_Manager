/**
 * Session auth: JWT in an httpOnly cookie, policed against the user row.
 *
 * The token is never exposed to JavaScript — no localStorage, no Authorization
 * header from the browser. Cookie is SameSite=Lax so normal top-level
 * navigations to the app still carry the session, and httpOnly so an XSS bug
 * can't read it.
 *
 * The token is not the authority. `requireAuth` loads the user row on every
 * request and compares it with the token's own copy, which is what makes the
 * permission matrix's promises true without a session store:
 *
 *   - a suspended account is refused on its next request, not at token expiry;
 *   - a role change applies immediately, because the role is read from the row;
 *   - a password change bumps `token_version`, so every other token stops working.
 *
 * The lookup is one indexed read by primary key, deliberately not cached: a cache
 * would delay a suspension by exactly its TTL, and being slow to lock out a
 * suspended account is worse than being slow to serve a request.
 *
 * Env:
 *   JWT_SECRET      required (openssl rand -hex 32) — validated at boot
 *   JWT_EXPIRES_IN  optional, default 7d (s | m | h | d)
 *   COOKIE_SECURE   "true" when served over HTTPS (adds Secure to the cookie)
 */

'use strict';

const jwt = require('jsonwebtoken');
const { findSessionUser } = require('../services/users');

const COOKIE_NAME = 'psx_session';
const ISSUER = 'psx-portfolio-manager';
const DEFAULT_EXPIRES_IN = '7d';

/** Parse `7d` / `12h` / `30m` / `45s` into milliseconds (for cookie maxAge). */
function parseDurationMs(value) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(value || '').trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = parseInt(match[1], 10);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return n * unit;
}

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'JWT_SECRET is missing or too short (need >= 16 chars). Set it in ' +
        '.env.local — see .env.example — e.g. `openssl rand -hex 32`.',
    );
  }
  return secret;
}

function expiresIn() {
  return process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;
}

/**
 * Issue a signed session token for a user row.
 *
 * `tv` copies the row's token_version at issue time; requireAuth rejects the token
 * once the row moves on. A row without the column (an older caller) counts as 0,
 * which is also the column default, so both sides agree.
 */
function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, tv: user.token_version ?? 0 },
    jwtSecret(),
    { expiresIn: expiresIn(), issuer: ISSUER },
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: parseDurationMs(expiresIn()),
  };
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearSessionCookie(res) {
  // maxAge/expires must not be sent when clearing, or browsers keep the cookie.
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  });
}

function unauthenticated(res, code, message) {
  return res.status(401).json({ error: { code, message } });
}

/**
 * Reject a request whose session is missing, invalid, or no longer backed by a
 * usable account. On success sets
 * `req.user = { id, email, role, mustChangePassword }`.
 */
async function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return unauthenticated(res, 'UNAUTHENTICATED', 'Sign in to continue');

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret(), { issuer: ISSUER });
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    clearSessionCookie(res); // drop the unusable cookie so the app can recover
    return unauthenticated(
      res,
      expired ? 'SESSION_EXPIRED' : 'INVALID_SESSION',
      expired ? 'Session expired — sign in again' : 'Invalid session',
    );
  }

  try {
    const row = await findSessionUser(payload.sub);
    if (!row) {
      // Valid token, but the account is gone: answer as if there were no session,
      // and drop the cookie so the client stops retrying with it.
      clearSessionCookie(res);
      return unauthenticated(res, 'UNAUTHENTICATED', 'Sign in to continue');
    }
    if (!row.is_active) {
      clearSessionCookie(res);
      return unauthenticated(res, 'ACCOUNT_SUSPENDED', 'This account is suspended');
    }
    if (row.token_version !== (payload.tv ?? 0)) {
      // Password changed, or signed out everywhere: this token is stale.
      clearSessionCookie(res);
      return unauthenticated(res, 'SESSION_REVOKED', 'Session ended — sign in again');
    }

    req.user = {
      id: row.id,
      email: row.email,
      role: row.role,
      mustChangePassword: row.must_change_password,
    };
    return next();
  } catch (err) {
    return next(err); // a database failure is a 503, not a 401
  }
}

/**
 * Gate a router on a role. Mount after `requireAuth`, which populates
 * `req.user.role` from the row. Signed-out is 401; signed-in but not allowed is
 * 403 — the frontend renders those two differently.
 */
function requireRole(role) {
  return function roleGate(req, res, next) {
    if (!req.user) return unauthenticated(res, 'UNAUTHENTICATED', 'Sign in to continue');
    if (req.user.role !== role) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this' },
      });
    }
    return next();
  };
}

/**
 * Hold a forced password change: every data route answers 403 until it is done.
 * Applied to the data routers, never to `/api/auth/me` or `/api/auth/password` —
 * the account must be able to see why it is blocked, and to fix it.
 */
function blockUntilPasswordChanged(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({
      error: {
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your password before continuing',
      },
    });
  }
  return next();
}

module.exports = {
  COOKIE_NAME,
  ISSUER,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireRole,
  blockUntilPasswordChanged,
  parseDurationMs,
};
