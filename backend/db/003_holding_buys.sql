-- The purchase ledger (issue #4, G2).
--
-- A holding's position is derived from this log rather than stored beside it:
-- `holdings.shares` is the log's total and `holdings.avg_purchase_price` its
-- cost-weighted mean. The arithmetic is the store's, unchanged (see
-- `positionFromBuys` in the frontend), so a migrated portfolio prices identically
-- to the one the browser was showing.
--
-- `kind = 'opening'` is not a purchase. It is how a position that predates the log
-- is represented — an initial quantity at its own price — and any derivation must
-- treat it as an ordinary log entry rather than excluding it, or every migrated
-- holding re-prices to nothing.

CREATE TABLE IF NOT EXISTS holding_buys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shares NUMERIC(12,4) NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC(12,2) NOT NULL CHECK (price_per_share >= 0),
  kind TEXT NOT NULL DEFAULT 'buy' CHECK (kind IN ('buy', 'opening')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every read is by holding, and the order is stable for display.
CREATE INDEX IF NOT EXISTS holding_buys_holding_idx ON holding_buys (holding_id, date, created_at);

-- The backfill is load-bearing, not housekeeping. Every holding that exists today
-- has no rows here, and deriving a position from an empty log reads zero shares —
-- which is to say, an empty portfolio. Each existing holding therefore gets exactly
-- one `opening` row describing what it already is, so the totals it currently
-- reports are the totals its log derives.
--
-- `shares > 0` is in the predicate because the table's CHECK would reject a
-- zero-share row: a holding with no quantity and a zero log both derive to zero,
-- which is already its value, so it needs no row to stay correct.
INSERT INTO holding_buys (holding_id, date, shares, price_per_share, kind)
SELECT h.id, h.purchase_date, h.shares, h.avg_purchase_price, 'opening'
  FROM holdings h
 WHERE h.shares > 0
   AND NOT EXISTS (SELECT 1 FROM holding_buys b WHERE b.holding_id = h.id);
