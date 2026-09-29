/**
 * User administration — the admin half of the permission matrix.
 *
 * Every route here is `requireAuth + requireRole('admin') + blockUntilPasswordChanged`:
 * a signed-out caller gets 401, a signed-in `user` gets 403, and an admin who has
 * not yet changed a forced password gets 403 PASSWORD_CHANGE_REQUIRED. The UI hides
 * this surface from non-admins as a convenience; the gate is here.
 *
 * What an admin may NOT do is as deliberate as what they may:
 *   - no portfolio, holding, dividend or buy content, here or anywhere: statistics
 *     are aggregates, and `/api/portfolios` keeps answering from `req.user.id`
 *     alone, so an admin gets 404 for another user's portfolio like a stranger
 *     (decision 6);
 *   - no self-demotion and no self-suspension, and the last admin cannot be
 *     demoted, suspended or deleted — one careless click must not leave a
 *     deployment nobody can administer;
 *   - no password is ever set, read or returned here (decisions 10 and 12 decide
 *     how an account gets its first one).
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { requireAuth, requireRole, blockUntilPasswordChanged } = require('../middleware/auth');
const { serializeUser, countAdmins, recordEvent, clientIp } = require('../services/users');

const router = express.Router();

const ROLES = ['admin', 'user'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A first password, generated rather than chosen.
 *
 * The alphabet omits the characters that get misread when somebody reads it aloud or
 * copies it by hand — 0/O, 1/l/I — because this password is meant to be handed over
 * once and then never used again. It exists only to get the account to its forced
 * password change.
 */
const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generateFirstPassword(length = 16) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const invalid = (res, message) =>
  res.status(400).json({ error: { code: 'INVALID_INPUT', message } });
const notFound = (res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such user' } });

router.use(requireAuth, requireRole('admin'), blockUntilPasswordChanged);

/**
 * Load a target user and refuse the actions that would strand the instance.
 * `verb` names what is being attempted, for the message the admin reads.
 */
async function loadGuardedTarget(req, res, verb) {
  const { rows } = await query('SELECT id, email, role, is_active FROM users WHERE id = $1', [
    req.params.id,
  ]);
  const target = rows[0];
  if (!target) {
    notFound(res);
    return null;
  }
  if (target.id === req.user.id && verb !== 'delete') {
    res.status(400).json({
      error: { code: 'CANNOT_TARGET_SELF', message: `You cannot ${verb} your own account` },
    });
    return null;
  }
  if (target.role === 'admin' && (await countAdmins()) <= 1) {
    res.status(400).json({
      error: {
        code: 'LAST_ADMIN',
        message: 'This is the last admin — promote another account first',
      },
    });
    return null;
  }
  return target;
}

// ── POST /api/users ───────────────────────────────────────────────────────────
// Creating an account. Decision 10 asks how an admin-created account gets its first
// password; this is that decision implemented the safe way round — the server
// generates one, returns it exactly once so the admin can hand it over, and flags the
// account `must_change_password`. Nothing is chosen by the admin, and nothing is
// stored in readable form: the row holds a bcrypt hash like every other account.
//
// The event kind is `signup` because that is what happened — an account came into
// existence. What distinguishes it from the self-service path is `actor_id`, which
// names the admin, and the meta that records the role that was granted.
router.post(
  '/',
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const errors = [];

    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) errors.push('A valid email address is required');

    const displayName = String(body.displayName ?? '').trim().slice(0, 100) || email;

    const role = body.role === undefined ? 'user' : body.role;
    if (!ROLES.includes(role)) errors.push(`Role must be one of: ${ROLES.join(', ')}`);

    if (errors.length) return invalid(res, errors.join('; '));

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      return res.status(409).json({
        error: { code: 'EMAIL_TAKEN', message: 'An account already uses that email address' },
      });
    }

    const firstPassword = generateFirstPassword();
    const passwordHash = await bcrypt.hash(firstPassword, 10);

    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, email, display_name, role, is_active, must_change_password,
                 phone, timezone, preferences, created_at, last_login_at`,
      [email, passwordHash, displayName, role],
    );

    await recordEvent('signup', {
      userId: rows[0].id,
      actorId: req.user.id,
      ip: clientIp(req),
      meta: { email, role, createdByAdmin: true },
    });

    // The only time this password exists outside the admin's eyes: it is never
    // stored, never logged, and cannot be read back.
    return res.status(201).json({ user: serializeUser(rows[0]), firstPassword });
  }),
);

// ── GET /api/users ────────────────────────────────────────────────────────────
// Listing and search. `portfolioCount` is an aggregate: the matrix gives admins
// statistics, never another user's portfolio contents.
router.get(
  '/',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`);
      where = `WHERE u.email ILIKE $1 OR u.display_name ILIKE $1`;
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.must_change_password,
              u.phone, u.timezone, u.preferences, u.created_at, u.last_login_at,
              COALESCE(p.n, 0)::int AS portfolio_count
         FROM users u
         LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM portfolios GROUP BY user_id) p
                ON p.user_id = u.id
         ${where}
        ORDER BY u.created_at ASC
        LIMIT 200`,
      params,
    );

    return res.json({
      users: rows.map((row) => ({ ...serializeUser(row), portfolioCount: row.portfolio_count })),
      total: rows.length,
    });
  }),
);

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get(
  '/:id',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.must_change_password,
              u.phone, u.timezone, u.preferences, u.created_at, u.last_login_at,
              COALESCE(p.n, 0)::int AS portfolio_count
         FROM users u
         LEFT JOIN (SELECT user_id, COUNT(*) AS n FROM portfolios GROUP BY user_id) p
                ON p.user_id = u.id
        WHERE u.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) return notFound(res);
    return res.json({ user: { ...serializeUser(rows[0]), portfolioCount: rows[0].portfolio_count } });
  }),
);

// ── PATCH /api/users/:id/status ───────────────────────────────────────────────
// Suspend and activate (decision 4: accounts are deactivated, not deleted).
// The middleware compares `is_active` on every request, so this bites on the
// target's very next call rather than when their token expires.
router.patch(
  '/:id/status',
  wrap(async (req, res) => {
    const { isActive } = req.body ?? {};
    if (typeof isActive !== 'boolean') return invalid(res, 'isActive must be true or false');
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error: { code: 'CANNOT_TARGET_SELF', message: 'You cannot change your own status' },
      });
    }

    const target = await loadGuardedTarget(req, res, 'suspend');
    if (!target) return undefined;

    const { rows } = await query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, display_name, role, is_active, must_change_password,
                 phone, timezone, preferences, created_at, last_login_at`,
      [isActive, target.id],
    );
    await recordEvent(isActive ? 'activated' : 'suspended', {
      userId: target.id,
      actorId: req.user.id,
      ip: clientIp(req),
    });
    return res.json({ user: serializeUser(rows[0]) });
  }),
);

// ── PATCH /api/users/:id/role ─────────────────────────────────────────────────
router.patch(
  '/:id/role',
  wrap(async (req, res) => {
    const { role } = req.body ?? {};
    if (!ROLES.includes(role)) return invalid(res, `Role must be one of: ${ROLES.join(', ')}`);
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error: { code: 'CANNOT_TARGET_SELF', message: 'You cannot change your own role' },
      });
    }

    const target = await loadGuardedTarget(req, res, 'change the role of');
    if (!target) return undefined;

    const { rows } = await query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, display_name, role, is_active, must_change_password,
                 phone, timezone, preferences, created_at, last_login_at`,
      [role, target.id],
    );
    // The middleware reads the role from the row on every request, so the target's
    // next call already runs with the new role — no re-login required.
    await recordEvent('role_changed', {
      userId: target.id,
      actorId: req.user.id,
      ip: clientIp(req),
      meta: { from: target.role, to: role },
    });
    return res.json({ user: serializeUser(rows[0]) });
  }),
);

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
// The explicit, deliberate path — suspension is the normal tool. Cascades to the
// user's portfolios, holdings, dividends and buys.
router.delete(
  '/:id',
  wrap(async (req, res) => {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        error: { code: 'CANNOT_TARGET_SELF', message: 'You cannot delete your own account' },
      });
    }
    const target = await loadGuardedTarget(req, res, 'delete');
    if (!target) return undefined;

    await query('DELETE FROM users WHERE id = $1', [target.id]);
    // The target's own events cascade away with them, so the surviving record of
    // the deletion is written against the admin who performed it, naming the
    // account — otherwise deleting a user would erase the evidence of it.
    await recordEvent('deleted', {
      userId: req.user.id,
      actorId: req.user.id,
      ip: clientIp(req),
      meta: { deletedUserId: target.id, email: target.email },
    });
    return res.json({ ok: true, deleted: target.id });
  }),
);

module.exports = router;
