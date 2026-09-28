-- =============================================================================
-- The account event record (decision 5's "record when they registered", and the
-- audit trail behind decision 9's "View reports").
--
-- One row per account event, written in the same transaction as the thing it
-- records. `actor_id` names who performed it — a role change or a suspension is an
-- admin's act, and a trail that cannot name the actor answers nothing.
--
-- ip / user_agent are personal data. They are nullable and off by default: the
-- route writes an IP only when RECORD_AUTH_IP=true (see routes/auth.js), and the
-- user-agent is deliberately never stored. Never render a raw IP in the admin UI.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN (
               'signup','login','logout','password_changed',
               'role_changed','suspended','activated','deleted'
             )),
  at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Who did it. NULL means the account did it to itself (a login, a password change).
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  ip         INET,
  meta       JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_events_user ON user_events(user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_kind ON user_events(kind, at DESC);
