/**
 * Auth routes — signup, login, logout, session read, own profile, own password.
 *
 * Session = JWT in an httpOnly cookie (see middleware/auth.js). Errors use the
 * same envelope as the rest of the API: { error: { code, message } }.
 *
 * Identity is not authority: the payload here reports `role`, but every gate is
 * enforced by the middleware against the user row, so a hand-edited token or a
 * crafted request body cannot grant anything.
 *
 * Env:
 *   ALLOW_PUBLIC_SIGNUP  default true; "false" (the shipped default for this app)
 *                        makes signup invite-only, with a bootstrap exception
 *                        while the users table is empty
 *   RECORD_AUTH_IP       "true" records the client IP on auth events (off by default)
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
  COOKIE_NAME,
  ISSUER,
} = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const {
  serializeUser,
  findUserById,
  recordEvent,
  clientIp,
} = require('../services/users');

const router = express.Router();

const BCRYPT_COST = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Default closed: this app's accounts are created by an admin (decision 2), and
// the first-account exception below is what lets a fresh instance be claimed.
const PUBLIC_SIGNUP = process.env.ALLOW_PUBLIC_SIGNUP === 'true';
// Compared against when the email is unknown, so response time doesn't leak
// whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('psx-portfolio-manager-dummy', BCRYPT_COST);

const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 20 });

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function invalid(res, message) {
  return res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
}

/** The columns signSession and the payload both need, in one place. */
const SESSION_COLUMNS = `
  id, email, display_name, password_hash, role, is_active, token_version,
  must_change_password, phone, timezone, preferences, created_at, last_login_at
`;

function readCredentials(body = {}) {
  return {
    email: String(body.email ?? '').trim().toLowerCase(),
    password: String(body.password ?? ''),
    displayName: body.displayName ? String(body.displayName).trim().slice(0, 100) : null,
  };
}

/**
 * The user id behind the session cookie, or null. Used by logout, which must work
 * whether or not the session is still valid — clearing a cookie is not a privileged
 * action, and a logout that 401s is a logout the user cannot perform.
 */
function softSessionUserId(req) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return null;
  try {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET, { issuer: ISSUER }).sub ?? null;
  } catch {
    return null;
  }
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

    // The first account of an empty instance is the administrator: on a host
    // deployed without the seed variables this is the only way to obtain one, so
    // it is deliberately preserved rather than tidied away (decision 5).
    const { rows: counted } = await query('SELECT COUNT(*)::int AS n FROM users');
    const isFirstAccount = counted[0].n === 0;

    if (!PUBLIC_SIGNUP && !isFirstAccount) {
      return res.status(403).json({
        error: { code: 'SIGNUP_CLOSED', message: 'Sign-up is invite-only' },
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    let row;
    try {
      const result = await query(
        `INSERT INTO users (email, password_hash, display_name, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${SESSION_COLUMNS}`,
        [email, passwordHash, displayName, isFirstAccount ? 'admin' : 'user'],
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

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);
    await recordEvent('signup', { userId: row.id, ip: clientIp(req) });
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
      `SELECT ${SESSION_COLUMNS} FROM users WHERE email = $1`,
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

    // Suspension is reported only after the password checks out, so the message
    // cannot be used to discover which addresses have accounts.
    if (!user.is_active) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended' },
      });
    }

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await recordEvent('login', { userId: user.id, ip: clientIp(req) });
    setSessionCookie(res, signSession(user));
    // `user` still carries password_hash; serializeUser never emits it.
    return res.json({ user: serializeUser(user) });
  }),
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post(
  '/logout',
  wrap(async (req, res) => {
    const userId = softSessionUserId(req);
    if (userId) await recordEvent('logout', { userId, ip: clientIp(req) });
    clearSessionCookie(res);
    return res.json({ ok: true });
  }),
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const row = await findUserById(req.user.id);
    if (!row) {
      // requireAuth already rejects this case; kept so the route is safe alone.
      clearSessionCookie(res);
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHENTICATED', message: 'Account no longer exists' } });
    }
    // Must-change-password is reported here rather than blocking, so the app can
    // route the account to the change-password screen instead of showing a wall.
    return res.json({ user: serializeUser(row), mustChangePassword: row.must_change_password });
  }),
);

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
// Own profile only. The email is the login identity and is deliberately not
// editable here: changing it needs its own decision (re-verification, collisions).
router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const sets = [];
    const params = [];

    if (body.displayName !== undefined) {
      params.push(String(body.displayName).trim().slice(0, 100) || null);
      sets.push(`display_name = $${params.length}`);
    }
    if (body.phone !== undefined) {
      params.push(body.phone === null ? null : String(body.phone).trim().slice(0, 32) || null);
      sets.push(`phone = $${params.length}`);
    }
    if (body.timezone !== undefined) {
      params.push(body.timezone === null ? null : String(body.timezone).trim().slice(0, 64) || null);
      sets.push(`timezone = $${params.length}`);
    }
    if (body.preferences !== undefined) {
      if (body.preferences === null || typeof body.preferences !== 'object' || Array.isArray(body.preferences)) {
        return invalid(res, 'Preferences must be an object');
      }
      // Shallow merge: a client updating one preference must not drop the others,
      // and keys this build does not know about are carried, not discarded.
      params.push(JSON.stringify(body.preferences));
      sets.push(`preferences = preferences || $${params.length}::jsonb`);
    }

    if (!sets.length) return invalid(res, 'Nothing to update');

    params.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING ${'id, email, display_name, role, is_active, must_change_password, phone, timezone, preferences, created_at, last_login_at'}`,
      params,
    );
    return res.json({ user: serializeUser(rows[0]) });
  }),
);

// ── POST /api/auth/password ───────────────────────────────────────────────────
router.post(
  '/password',
  requireAuth,
  wrap(async (req, res) => {
    const current = String(req.body?.currentPassword ?? '');
    const next = String(req.body?.newPassword ?? '');

    if (!current || !next) return invalid(res, 'Current and new password are required');
    if (next.length < 8) return invalid(res, 'Password must be at least 8 characters');
    if (next.length > 200) return invalid(res, 'Password is too long');
    if (next === current) return invalid(res, 'Choose a password you have not used here');

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
    }
    if (!(await bcrypt.compare(current, rows[0].password_hash))) {
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
      });
    }

    // Bumping token_version invalidates every other token for this account; the
    // cookie below is re-issued so the session doing the change survives.
    const updated = await query(
      `UPDATE users
          SET password_hash = $1, password_changed_at = NOW(),
              must_change_password = FALSE, token_version = token_version + 1,
              updated_at = NOW()
        WHERE id = $2
        RETURNING ${SESSION_COLUMNS}`,
      [await bcrypt.hash(next, BCRYPT_COST), req.user.id],
    );
    const row = updated.rows[0];

    await recordEvent('password_changed', { userId: row.id, ip: clientIp(req) });
    setSessionCookie(res, signSession(row));
    return res.json({ user: serializeUser(row), ok: true });
  }),
);

// The limiter's window, exposed so the test suite can clear it between cases.
router.resetAuthLimiter = () => authLimiter.reset();

module.exports = router;
