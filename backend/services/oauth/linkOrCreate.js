/**
 * The link-or-create decision table (issue #136) — the security heart of social
 * sign-in, kept in one testable place.
 *
 * The one rule that must never bend: a provider email may link to an existing
 * account **only** when the provider asserts the address is verified. Otherwise
 * anyone who can create an identity at the provider with your address takes over
 * your portfolios.
 *
 *   identity known                       → sign in
 *   link attempt from a signed-in user   → attach to that account
 *   email unverified / missing           → refuse
 *   verified email, user exists (active) → link + sign in
 *   verified email, user exists (suspended) → refuse ACCOUNT_SUSPENDED
 *   verified email, no user, signup open → create (no password)
 *   verified email, no user, signup shut → refuse SIGNUP_CLOSED
 */

'use strict';

const { query } = require('../../db/pool');

const SESSION_COLUMNS = `
  id, email, display_name, role, is_active, token_version, must_change_password
`;

class OAuthError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
    this.status = status;
  }
}

async function findByIdentity(provider, subject) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.role, u.is_active,
            u.token_version, u.must_change_password
       FROM oauth_accounts oa
       JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = $1 AND oa.provider_account_id = $2`,
    [provider, subject],
  );
  return rows[0] ?? null;
}

async function findByEmail(email) {
  const { rows } = await query(`SELECT ${SESSION_COLUMNS} FROM users WHERE lower(email) = lower($1)`, [
    email,
  ]);
  return rows[0] ?? null;
}

async function attachIdentity(userId, provider, identity) {
  try {
    await query(
      `INSERT INTO oauth_accounts
         (user_id, provider, provider_account_id, email, email_verified, display_name, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, provider, identity.subject, identity.email, Boolean(identity.emailVerified), identity.name],
    );
  } catch (err) {
    if (err.code === '23505') {
      // Either this provider is already attached to this account, or a
      // concurrent callback won the race — either way the identity exists.
      throw new OAuthError('OAUTH_ALREADY_LINKED', 'This sign-in method is already connected', 409);
    }
    throw err;
  }
}

function assertActive(user) {
  if (!user.is_active) {
    throw new OAuthError('ACCOUNT_SUSPENDED', 'This account is suspended', 403);
  }
}

/**
 * Resolve a verified provider identity to a user, creating or linking as the
 * table above allows. Returns `{ user, outcome }` where outcome is one of
 * `login`, `linked`, `signup` — the audit event and session issue from it.
 */
async function linkOrCreate({
  provider,
  identity,
  linkUserId = null,
  oauthSignup = false,
  linkByEmail = true,
}) {
  // 1. A known identity signs in as itself, whatever its email now says.
  const known = await findByIdentity(provider, identity.subject);
  if (known) {
    assertActive(known);
    await query(
      `UPDATE oauth_accounts SET last_login_at = NOW()
        WHERE provider = $1 AND provider_account_id = $2`,
      [provider, identity.subject],
    );
    return { user: known, outcome: 'login' };
  }

  // 2. An explicit link attempt from a signed-in account attaches to that user.
  if (linkUserId) {
    const { rows } = await query(`SELECT ${SESSION_COLUMNS} FROM users WHERE id = $1`, [linkUserId]);
    const user = rows[0];
    if (!user) throw new OAuthError('OAUTH_LINK_TARGET_MISSING', 'That account no longer exists', 404);
    assertActive(user);
    await attachIdentity(user.id, provider, identity);
    return { user, outcome: 'linked' };
  }

  // 3. Refuse anything the provider has not verified. Never link on a guess.
  if (!identity.email) {
    throw new OAuthError('OAUTH_NO_EMAIL', 'That account did not share an email address', 400);
  }
  if (!identity.emailVerified) {
    throw new OAuthError(
      'OAUTH_EMAIL_UNVERIFIED',
      'That account has no verified email address',
      403,
    );
  }

  // 4. Same verified email as an existing account: link, do not duplicate.
  const existing = await findByEmail(identity.email);
  if (existing) {
    assertActive(existing);
    if (!linkByEmail) {
      throw new OAuthError(
        'OAUTH_ACCOUNT_EXISTS',
        'An account with this email already exists — sign in with your password',
        409,
      );
    }
    await attachIdentity(existing.id, provider, identity);
    return { user: existing, outcome: 'linked' };
  }

  // 5. New person: create an account only when provider registration is open.
  if (!oauthSignup) {
    throw new OAuthError(
      'SIGNUP_CLOSED',
      'Sign-up is closed on this instance — ask an administrator',
      403,
    );
  }

  try {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, display_name, role, email_verified_at)
       VALUES ($1, NULL, $2, 'user', NOW())
       RETURNING ${SESSION_COLUMNS}`,
      [identity.email, identity.name],
    );
    await attachIdentity(rows[0].id, provider, identity);
    return { user: rows[0], outcome: 'signup' };
  } catch (err) {
    // A concurrent callback created the same email between the lookup and here:
    // fall back to linking rather than failing the sign-in.
    if (err.code === '23505') {
      const raced = await findByEmail(identity.email);
      if (raced) {
        assertActive(raced);
        await attachIdentity(raced.id, provider, identity);
        return { user: raced, outcome: 'linked' };
      }
    }
    throw err;
  }
}

module.exports = { linkOrCreate, OAuthError, SESSION_COLUMNS };
