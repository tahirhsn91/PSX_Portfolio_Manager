-- Target allocation & concentration alerts (issue #97).
--
-- User-defined target percentages per holding or sector, compared against the
-- live allocation. `target_key` is the symbol (scope 'holding') or sector name
-- (scope 'sector'). The concentration threshold is a per-portfolio setting:
-- when any holding/sector's live weight exceeds it, the UI flags it.

CREATE TABLE IF NOT EXISTS allocation_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id   UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('holding', 'sector')),
  target_key     TEXT NOT NULL,
  target_percent NUMERIC(6,3) NOT NULL CHECK (target_percent >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, scope, target_key)
);

CREATE INDEX IF NOT EXISTS allocation_targets_portfolio_idx ON allocation_targets (portfolio_id);

ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS concentration_threshold NUMERIC(6,3) NOT NULL DEFAULT 25;
