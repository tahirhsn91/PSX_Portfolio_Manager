'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');

/**
 * Password reset tokens (issue #139).
 *
 * The raw token is returned once, to be placed in the emailed link; only its
 * SHA-256 hash is stored. Verification is a hash lookup, so a stolen database
 * cannot be replayed as reset links.
 *
 * Deliberately not bcrypt: the token is 256 bits of CSPRNG output, not a
 * human-chosen secret, so a fast hash is appropriate and keeps the callback
 * cheap.
 */

const TTL_MINUTES = 60;
const BCRYPT_COST = 12;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/**
 * Creates a fresh token for the user and retires any previous unused one, so
 * exactly one link is ever live.
 */
async function createReset(userId, ip) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
  const recordIp = process.env.RECORD_AUTH_IP === 'true';

  await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashToken(token), expiresAt, recordIp ? ip : null],
  );

  return token;
}

/**
 * Consumes a token and sets the new password.
 *
 * The UPDATE ... RETURNING is the atomic claim: two concurrent submits of the
 * same link can only ever see one row, so the second gets null and is refused.
 * Returns the user id on success, null for an unknown, expired or used token.
 */
async function consumeReset(token, newPassword) {
  if (!token || !newPassword) return null;

  const { rows } = await query(
    `UPDATE password_resets
        SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    [hashToken(token)],
  );

  const row = rows[0];
  if (!row) return null;

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

  // Bumping token_version ends every existing session on its next request, so a
  // reset also evicts whoever may have had the old password.
  await query(
    `UPDATE users
        SET password_hash = $1,
            password_changed_at = NOW(),
            must_change_password = FALSE,
            token_version = token_version + 1,
            updated_at = NOW()
      WHERE id = $2`,
    [passwordHash, row.user_id],
  );

  // Any other outstanding link for this account dies with the reset.
  await query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);

  return row.user_id;
}

module.exports = { createReset, consumeReset, hashToken, TTL_MINUTES };
