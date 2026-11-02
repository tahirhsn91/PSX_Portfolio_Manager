-- =============================================================================
-- Social sign-in (issue #136).
--
-- A provider identity is a credential like a password: it maps to exactly one
-- user, and the same provider cannot be attached twice. Kept in its own table so
-- an account can hold a password and/or several providers, and so unlinking one
-- leaves the others intact.
--
-- Two supporting changes:
--   * users.password_hash becomes nullable — a provider-only account has none.
--     The password routes must fail closed on a NULL hash (routes/auth.js).
--   * users.email_verified_at records that a *provider* verified the address,
--     which is the only thing that may link an identity to an existing account.
--
-- Applied by db/migrate.js on proxy startup, in filename order, once.
-- =============================================================================

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'stub' exists for local/dev testing only (OAUTH_STUB_ENABLED); real
  -- deployments never write it. Keeping it in the constraint means the same
  -- link-or-create path is exercised end to end without provider credentials.
  provider            TEXT NOT NULL CHECK (provider IN ('google','facebook','stub')),
  provider_account_id TEXT NOT NULL,
  email               TEXT,
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  display_name        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ,
  UNIQUE (provider, provider_account_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

-- New audit kinds. The original CHECK is unnamed, so Postgres named it
-- user_events_kind_check.
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_kind_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_kind_check CHECK (kind IN (
  'signup','login','logout','password_changed','role_changed','suspended','activated','deleted',
  'oauth_signup','oauth_login','oauth_linked','oauth_unlinked'
));
