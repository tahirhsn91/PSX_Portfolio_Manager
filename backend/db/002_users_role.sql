-- =============================================================================
-- Users grow: roles, account status, session revocation, profile, preferences.
--
-- Applied by backend/db/migrate.js on proxy startup (idempotent). Every change is
-- additive with a default, so existing rows backfill to a working 'user'.
--
-- Session model: the token carries `sub` and `tv` (its token_version). The auth
-- middleware loads the user row on every authenticated request and compares, so
-- suspending an account, changing a role or changing a password all take effect on
-- that user's *next request* rather than at token expiry. Bumping token_version is
-- how a password change (or a "sign out everywhere") invalidates old tokens without
-- a session table.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','user'));
EXCEPTION
  WHEN duplicate_object THEN NULL;   -- already constrained: re-running is a no-op
END $$;

-- Suspension (decision 4): accounts are deactivated, not deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Session revocation without a session store: the token's copy must match this.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

-- Set on a seeded or admin-created account: the first login must change it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Profile (decision 11: these live on the account so they follow the user).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone    VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);

-- Preferences that are not profile and not the device's theme: default portfolio,
-- watchlist, display formats. JSONB because the list is still moving (decision 11
-- names some, flags others as unassigned) and a column per format would be guessing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
