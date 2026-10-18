-- Price alerts (issue #94).
--
-- Alert definitions, keyed to the account. Evaluation happens client-side while
-- the app is open (first release: no background/email/push), so nothing here
-- stores a "triggered" state — only what the user asked to be told about.
-- `kind` is the condition the quote is compared against:
--   price   — current price crosses `threshold` (direction above/below)
--   percent — the day's percentage move crosses `threshold` vs previous close

CREATE TABLE IF NOT EXISTS alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('price', 'percent')),
  direction  TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  threshold  NUMERIC(14,4) NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts (user_id, active, created_at);
