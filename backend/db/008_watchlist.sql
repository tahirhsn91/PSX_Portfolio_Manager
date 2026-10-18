-- Personal watchlist (issue #93).
--
-- A symbol the account is tracking but does not own. Server-backed and keyed to
-- the account, exactly like portfolios, so it survives a reload and follows the
-- user across devices. Symbols are stored uppercase; uniqueness is per account.

CREATE TABLE IF NOT EXISTS watchlist_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS watchlist_items_user_idx ON watchlist_items (user_id, created_at);
