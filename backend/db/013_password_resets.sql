-- Password reset tokens (issue #139).
--
-- The raw token exists only in the emailed link. What lives here is its SHA-256
-- hash, so a database read cannot be turned into a working reset link. One row
-- per outstanding request: a new request deletes the previous unused one, and a
-- successful reset deletes the rest, so a user has at most one live token at a
-- time.

CREATE TABLE IF NOT EXISTS password_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  requested_ip INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);

-- Two new audit kinds; the constraint is re-declared with the full list.
ALTER TABLE user_events DROP CONSTRAINT IF EXISTS user_events_kind_check;
ALTER TABLE user_events ADD CONSTRAINT user_events_kind_check CHECK (kind IN (
  'signup','login','logout','password_changed','role_changed','suspended','activated','deleted',
  'oauth_signup','oauth_login','oauth_linked','oauth_unlinked',
  'password_reset_requested','password_reset_completed'
));
