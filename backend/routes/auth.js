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
const { createReset, consumeReset } = require('../services/passwordReset');
const { sendPasswordReset } = require('../services/mail');
const {
  serializeUser,
  findUserById,
  credentialSummary,
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
// Reset requests get their own budget: a forgotten password should not be
// blocked because someone mistyped theirs twenty times.
const resetLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function invalid(res, message) {
  return res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
}

/** The columns signSession and the payload both need, in one place. */
const SESSION_COLUMNS = `
  id, email, display_name, password_hash, role, is_active, token_version,
  must_change_password, phone, timezone, preferences, created_at, last_seen_at
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

    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [row.id]);
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
    // A provider-only account has a NULL hash: comparing against null throws, so
    // it falls through to the dummy hash and is refused below (fail closed).
    const hasPassword = Boolean(user && user.password_hash);
    const matches = await bcrypt.compare(password, hasPassword ? user.password_hash : DUMMY_HASH);

    // An account that exists but has no password signs in with a provider. Name
    // the method instead of leaving a dead form; the compare above already ran.
    if (user && !hasPassword) {
      return res.status(401).json({
        error: {
          code: 'USE_OAUTH',
          message: 'This account signs in with Google or Facebook — use one of those buttons',
        },
      });
    }

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

    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);
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

/**
 * Note that the account was just used, for the roster's "Last seen" column.
 *
 * Throttled to a write a minute: the client calls this on every focus and after every
 * sign-in, and a burst of those should not become a burst of writes. Returns the value to
 * report either way, so the response carries the same stamp the column will.
 */
async function touchLastSeen(id) {
  const { rows } = await query(
    `UPDATE users
        SET last_seen_at = NOW()
      WHERE id = $1
        AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '1 minute')
      RETURNING last_seen_at`,
    [id],
  );
  if (rows[0]) return rows[0].last_seen_at;

  const { rows: current } = await query('SELECT last_seen_at FROM users WHERE id = $1', [id]);
  return current[0] ? current[0].last_seen_at : null;
}

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
    // Opening or focusing the app calls this route, so it doubles as "the account was
    // just used". Deliberately not in the auth middleware: the market endpoints poll while
    // a tab sits open, and touching there would report a user as active all night.
    row.last_seen_at = await touchLastSeen(row.id);

    // Must-change-password is reported here rather than blocking, so the app can
    // route the account to the change-password screen instead of showing a wall.
    // How the account signs in (password + connected providers) rides along, so
    // Settings can show it without a second request.
    const credentials = await credentialSummary(row.id);
    return res.json({
      user: { ...serializeUser(row), ...credentials },
      mustChangePassword: row.must_change_password,
    });
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
        RETURNING ${'id, email, display_name, role, is_active, must_change_password, phone, timezone, preferences, created_at, last_seen_at'}`,
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

    if (!next) return invalid(res, 'New password is required');
    if (next.length < 8) return invalid(res, 'Password must be at least 8 characters');
    if (next.length > 200) return invalid(res, 'Password is too long');

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' } });
    }

    // A provider-only account is *setting* its first password, so there is no
    // current one to demand or compare.
    const hasPassword = Boolean(rows[0].password_hash);
    if (hasPassword) {
      if (!current) return invalid(res, 'Current password is required');
      if (next === current) return invalid(res, 'Choose a password you have not used here');
      if (!(await bcrypt.compare(current, rows[0].password_hash))) {
        return res.status(401).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' },
        });
      }
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

// ── POST /api/auth/forgot ─────────────────────────────────────────────────────
// Public. Answers { ok: true } for every input — registered, unregistered,
// suspended, malformed — because anything else is an account-existence oracle.
router.post(
  '/forgot',
  resetLimiter,
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return res.json({ ok: true });

    const { rows } = await query(
      'SELECT id, email, display_name FROM users WHERE lower(email) = $1 AND is_active = TRUE',
      [email],
    );
    const user = rows[0];

    if (user) {
      const token = await createReset(user.id, clientIp(req));
      await recordEvent('password_reset_requested', { userId: user.id, ip: clientIp(req) });

      // The link points at the SPA, not the API. ALLOWED_ORIGIN is this app's
      // own origin (already trusted for CORS); the request origin is a dev
      // fallback so a bare host works without extra configuration.
      const origin = (process.env.ALLOWED_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

      // Not awaited: a slow relay must not hold the request open, and a send
      // failure must not change the answer. sendPasswordReset never throws.
      void sendPasswordReset({
        to: user.email,
        displayName: user.display_name,
        resetUrl: `${origin}/reset-password?token=${encodeURIComponent(token)}`,
      });
    }

    return res.json({ ok: true });
  }),
);

// ── POST /api/auth/reset ──────────────────────────────────────────────────────
// Public. One generic answer for unknown, expired and already-used tokens.
router.post(
  '/reset',
  resetLimiter,
  wrap(async (req, res) => {
    const token = String(req.body?.token ?? '');
    const next = String(req.body?.newPassword ?? '');

    if (next.length < 8) return invalid(res, 'Password must be at least 8 characters');
    if (next.length > 200) return invalid(res, 'Password is too long');

    const userId = await consumeReset(token, next);
    if (!userId) {
      return res.status(400).json({
        error: { code: 'RESET_TOKEN_INVALID', message: 'This reset link is invalid or has expired' },
      });
    }

    await recordEvent('password_reset_completed', { userId, ip: clientIp(req) });
    return res.json({ ok: true });
  }),
);

// The limiter's window, exposed so the test suite can clear it between cases.
router.resetAuthLimiter = () => {
  authLimiter.reset();
  resetLimiter.reset();
};

module.exports = router;
