/**
 * The initial administrator (issue #4, decision 5).
 *
 * A fresh instance must be reachable by its owner from the first boot, so this
 * runs after migrations and creates one admin when — and only when — no admin
 * exists. `superadmin@xyz.com` is the account; its password comes from the
 * environment and is never written down anywhere else (this repository is public,
 * so a credential in a file or an issue is a published credential).
 *
 * Invariants, each of them a test in tests/seed-admin.test.js:
 *   1. Creates an admin only when the instance has none — so it is idempotent, and
 *      a restart can never resurrect a password that has since been changed.
 *   2. Never touches an existing account: no password reset, no role change.
 *   3. Hashes with bcrypt before insert, and never logs, echoes or returns the
 *      plaintext — including in the CLI path.
 *   4. Marks the row `must_change_password`, so the first login is forced through a
 *      change (the middleware holds every other route until it is done).
 *
 * Both variables missing is not an error: the deploy may rely on the first-account
 * fallback in routes/auth.js instead. One variable without the other is a
 * misconfiguration and is reported as such, loudly and without the value.
 *
 * Env:
 *   SEED_ADMIN_EMAIL     e.g. superadmin@xyz.com
 *   SEED_ADMIN_PASSWORD  >= 8 chars; generate per host, never reuse one from a chat
 *   BCRYPT_COST          optional, default 10 (shared with routes/auth.js)
 */

'use strict';

const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { countAdmins } = require('./users');

const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10;

/**
 * Create the seed admin if the instance has no admin at all.
 *
 * Returns a plain outcome so callers (boot, CLI, tests) can log or assert it
 * without parsing strings: { action: 'created' | 'exists' | 'skipped', reason? }.
 */
async function seedAdmin({ email, password } = {}) {
  const seedEmail = (email ?? process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const seedPassword = password ?? process.env.SEED_ADMIN_PASSWORD ?? '';

  if (!seedEmail && !seedPassword) return { action: 'skipped', reason: 'not-configured' };
  if (!seedEmail || !seedPassword) {
    // Name what is missing, never what is present.
    const missing = !seedEmail ? 'SEED_ADMIN_EMAIL' : 'SEED_ADMIN_PASSWORD';
    return { action: 'skipped', reason: `incomplete: ${missing} is not set` };
  }
  if (seedPassword.length < 8) {
    return { action: 'skipped', reason: 'SEED_ADMIN_PASSWORD is shorter than 8 characters' };
  }

  if ((await countAdmins()) > 0) return { action: 'exists' };

  const passwordHash = await bcrypt.hash(seedPassword, BCRYPT_COST);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, role, must_change_password)
     VALUES ($1, $2, $3, 'admin', TRUE)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [seedEmail, passwordHash, 'Super Admin'],
  );

  // A conflicting row means the address already exists as a plain user: promote
  // nothing, report it, and leave the decision to a human.
  if (!rows[0]) return { action: 'skipped', reason: 'that email already exists' };

  const { recordEvent } = require('./users');
  await recordEvent('signup', { userId: rows[0].id, meta: { source: 'seed' } });
  return { action: 'created', userId: rows[0].id };
}

/** Log the outcome without ever including the password or the hash. */
function reportOutcome(outcome, log = console.log) {
  if (outcome.action === 'created') {
    log('[proxy] seeded the initial admin — first login must change the password');
  } else if (outcome.action === 'exists') {
    log('[proxy] seed admin skipped: this instance already has an admin');
  } else if (outcome.reason === 'not-configured') {
    log('[proxy] seed admin not configured (no SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)');
  } else {
    log(`[proxy] seed admin skipped: ${outcome.reason}`);
  }
  return outcome;
}

module.exports = { seedAdmin, reportOutcome, BCRYPT_COST };

// CLI: `npm run seed:admin` — same function, one process, no server.
if (require.main === module) {
  // No dotenv here on purpose: this package has no such dependency, and the
  // container is given its environment by compose. Running it by hand:
  //   set -a; . ../.env.local; set +a; node db/seedAdmin.js
  seedAdmin()
    .then((outcome) => {
      reportOutcome(outcome);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`[seed] failed: ${err.message}`);
      process.exit(1);
    });
}
