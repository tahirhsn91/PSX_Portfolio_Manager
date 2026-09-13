/**
 * Session auth: JWT in an httpOnly cookie.
 *
 * The token is never exposed to JavaScript — no localStorage, no Authorization
 * header from the browser. Cookie is SameSite=Lax so normal top-level
 * navigations to the app still carry the session, and httpOnly so an XSS bug
 * can't read it.
 *
 * Env:
 *   JWT_SECRET      required (openssl rand -hex 32) — validated at boot
 *   JWT_EXPIRES_IN  optional, default 7d (s | m | h | d)
 *   COOKIE_SECURE   "true" when served over HTTPS (adds Secure to the cookie)
 */

'use strict';

const jwt = require('jsonwebtoken');

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

/** Issue a signed session token for a user row. */
function signSession(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret(), {
    expiresIn: expiresIn(),
    issuer: ISSUER,
  });
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

/**
 * Reject unauthenticated requests. On success sets `req.user = { id, email }`.
 */
function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
  }

  try {
    const payload = jwt.verify(token, jwtSecret(), { issuer: ISSUER });
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    clearSessionCookie(res); // drop the unusable cookie so the app can recover
    return res.status(401).json({
      error: {
        code: expired ? 'SESSION_EXPIRED' : 'INVALID_SESSION',
        message: expired ? 'Session expired — sign in again' : 'Invalid session',
      },
    });
  }
}

module.exports = {
  COOKIE_NAME,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  parseDurationMs,
};
