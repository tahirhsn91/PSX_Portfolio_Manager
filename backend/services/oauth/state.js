/**
 * OAuth state + PKCE, carried in a short-lived httpOnly cookie.
 *
 * `state` is the CSRF guard: the value the provider echoes back must equal the
 * one we issued, single use, bound to the provider, and it expires. The PKCE
 * verifier and (for Google) the nonce ride in the same signed cookie, so the
 * callback never trusts a value from the query string except the code itself.
 *
 * The cookie is a JWT signed with the same `JWT_SECRET` as sessions, scoped to
 * `Path=/api/auth/oauth` so it is never sent on ordinary API calls.
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'psx_oauth_state';
const ISSUER = 'psx-portfolio-manager';
const TTL = '10m';
const TTL_MS = 10 * 60 * 1000;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new Error('JWT_SECRET is missing or too short for OAuth state');
  }
  return value;
}

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** PKCE S256: a random verifier and its SHA-256 challenge. */
function pkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function nonce() {
  return base64url(crypto.randomBytes(16));
}

/**
 * Mint the cookie payload. Returns `{ state, token }` — `state` is echoed to the
 * provider, `token` goes in the cookie. `linkUserId` is only set for an
 * account-link attempt started by a signed-in user.
 */
function issue({ provider, verifier, nonce: nonceValue, linkUserId = null, stubEmail = null }) {
  const state = base64url(crypto.randomBytes(16));
  const token = jwt.sign(
    {
      state,
      provider,
      verifier,
      nonce: nonceValue || null,
      linkUserId: linkUserId || null,
      stubEmail: stubEmail || null,
    },
    secret(),
    { expiresIn: TTL, issuer: ISSUER },
  );
  return { state, token };
}

/** The verified cookie payload, or null when missing/expired/tampered. */
function read(req) {
  const raw = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!raw) return null;
  try {
    return jwt.verify(raw, secret(), { issuer: ISSUER });
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/api/auth/oauth',
    maxAge: TTL_MS,
  };
}

function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearCookie(res) {
  // No maxAge/expires when clearing, or browsers keep the cookie.
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/api/auth/oauth',
  });
}

/** Constant-time string compare that tolerates unequal lengths. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { COOKIE_NAME, pkce, nonce, issue, read, setCookie, clearCookie, safeEqual };
