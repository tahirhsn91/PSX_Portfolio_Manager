/**
 * Shared user reads/writes and the account event log.
 *
 * Kept out of routes/ because three callers need the same rules: the auth routes,
 * the admin routes, and the boot seed. The serialiser is the single place that
 * decides what a user payload may contain — it is the reason a password hash can
 * never leak into a response.
 *
 * Env:
 *   RECORD_AUTH_IP   "true" records the client IP on auth events (off by default:
 *                    it is personal data, and the audit trail does not need it)
 */

'use strict';

const { query } = require('../db/pool');

const PUBLIC_COLUMNS = `
  id, email, display_name, role, is_active, must_change_password,
  phone, timezone, preferences, created_at, last_login_at
`;

/**
 * A user payload safe to send to any client. `password_hash` is absent by
 * construction: it is not in PUBLIC_COLUMNS, so no route can leak it by accident.
 */
function serializeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    phone: row.phone ?? null,
    timezone: row.timezone ?? null,
    preferences: row.preferences ?? {},
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

/** The row the auth middleware needs to police a session. Cheap, indexed by id. */
async function findSessionUser(id) {
  const { rows } = await query(
    `SELECT id, email, role, is_active, token_version, must_change_password
       FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function findUserById(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/** How many admins exist. Used by the seed and by the last-admin guards. */
async function countAdmins() {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
  return rows[0].n;
}

/**
 * Append an account event. Never throws: an audit write must not take down the
 * action it describes, so failures are logged and swallowed.
 */
async function recordEvent(kind, { userId, actorId = null, ip = null, meta = null } = {}) {
  try {
    await query(
      `INSERT INTO user_events (user_id, kind, actor_id, ip, meta) VALUES ($1, $2, $3, $4, $5)`,
      [userId, kind, actorId, process.env.RECORD_AUTH_IP === 'true' ? ip : null, meta],
    );
  } catch (err) {
    console.error(`[api] could not record user event ${kind}: ${err.message}`);
  }
}

/** The client IP, or null. `trust proxy` is not set, so this is the socket peer. */
function clientIp(req) {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

module.exports = {
  PUBLIC_COLUMNS,
  serializeUser,
  findSessionUser,
  findUserById,
  countAdmins,
  recordEvent,
  clientIp,
};
