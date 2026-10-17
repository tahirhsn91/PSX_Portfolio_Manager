-- Sells and cash movements (issue #90).
--
-- `holding_sells` is the sell half of a holding's ledger. Combined with
-- `holding_buys`, a position is derived by replaying both chronologically under
-- the weighted-average (perpetual) method; realized P/L is computed at read time
-- from the two logs, never stored.

CREATE TABLE IF NOT EXISTS holding_sells (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id      UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  shares          NUMERIC(12,4) NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC(12,2) NOT NULL CHECK (price_per_share >= 0),
  fees            NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fees >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS holding_sells_holding_idx ON holding_sells (holding_id, date, created_at);

-- Cash movements into and out of a portfolio (deposits/withdrawals), for a cash
-- balance and cash-flow-aware performance.
CREATE TABLE IF NOT EXISTS cash_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  type         VARCHAR(10) NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_transactions_portfolio_idx ON cash_transactions (portfolio_id, date);
