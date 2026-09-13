/**
 * Auth routes — signup, login, logout, session read.
 *
 * Session = JWT in an httpOnly cookie (see middleware/auth.js). Errors use the
 * same envelope as the rest of the API: { error: { code, message } }.
 *
 * Env:
 *   ALLOW_PUBLIC_SIGNUP  default true; "false" makes signup invite-only, with a
 *                        bootstrap exception while the users table is empty
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const {
  signSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PUBLIC_SIGNUP = process.env.ALLOW_PUBLIC_SIGNUP !== 'false';
// Compared against when the email is unknown, so response time doesn't leak
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('psx-portfolio-manager-dummy', BCRYPT_COST);

const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    createdAt: row.created_at,
  };
}

function invalid(res, message) {
  return res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
}

function readCredentials(body = {}) {
  return {
    email: String(body.email ?? '').trim().toLowerCase(),
    password: String(body.password ?? ''),
    displayName: body.displayName ? String(body.displayName).trim().slice(0, 100) : null,
  };
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post(
  '/signup',
  authLimiter,
  wrap(async (req, res) => {
    const { email, password, displayName } = readCredentials(req.body);

    if (!EMAIL_RE.test(email)) return invalid(res, 'Enter a valid email address');
    if (password.length < 8) return invalid(res, 'Password must be at least 8 characters');
    if (password.length > 200) return invalid(res, 'Password is too long');

    if (!PUBLIC_SIGNUP) {
      const { rows } = await query('SELECT COUNT(*)::int AS n FROM users');
      if (rows[0].n > 0) {
        return res.status(403).json({
          error: { code: 'SIGNUP_CLOSED', message: 'Sign-up is invite-only' },
        });
      }
      // First account bootstraps an invite-only instance.
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    let row;
    try {
      const result = await query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, created_at`,
        [email, passwordHash, displayName],
      );
      row = result.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
        });
      }
      throw err;
    }

    setSessionCookie(res, signSession(row));
    return res.status(201).json({ user: serializeUser(row) });
  }),
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  wrap(async (req, res) => {
    const { email, password } = readCredentials(req.body);
    if (!email || !password) return invalid(res, 'Email and password are required');

    const { rows } = await query(
      'SELECT id, email, display_name, password_hash, created_at FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];

    // Always run a compare so an unknown email costs the same as a wrong password.
    const matches = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !matches) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
      });
    }

    setSessionCookie(res, signSession(user));
    return res.json({ user: serializeUser(user) });
  }),
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
      [req.user.id],
    );
    if (!rows[0]) {
      // Token is valid but the account is gone — treat as signed out.
      clearSessionCookie(res);
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Account no longer exists' } });
    }
    return res.json({ user: serializeUser(rows[0]) });
  }),
);

module.exports = router;
