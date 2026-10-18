-- Corporate actions: stock splits, bonus shares, and rights issues (issue #92).
--
-- An action adjusts a holding's quantity and cost basis at a point in time, and
-- is folded into the chronological ledger replay alongside buys and sells (never
-- double-applied to price data that already reflects it). The stored `ratio` is
-- the multiplier the replay uses:
--   split  — new shares per old share (2 = a 2:1 split); cost basis unchanged.
--   bonus  — bonus shares per held share (0.10 = a 10% bonus); cost basis unchanged.
--   rights — entitlement new shares per held share (0.25 = 1 new per 4 held), plus
--            the subscription `price` paid per new share (cost basis rises by it).

CREATE TABLE IF NOT EXISTS corporate_actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('split', 'bonus', 'rights')),
  date       DATE NOT NULL,
  ratio      NUMERIC(12,6) NOT NULL CHECK (ratio > 0),
  price      NUMERIC(12,4) CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS corporate_actions_holding_idx ON corporate_actions (holding_id, date, created_at);
