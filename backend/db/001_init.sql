-- =============================================================================
-- PSX Portfolio Manager — schema
--
-- Applied by backend/db/migrate.js on proxy startup (idempotent). Every table
-- is created with IF NOT EXISTS so re-running is safe; real changes get a new
-- numbered file and a schema_migrations row.
--
-- Money/quantity columns are NUMERIC (never float); note that `pg` returns
-- NUMERIC and DATE as *strings*, so routes serialize them explicitly.
-- =============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Portfolios ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  description TEXT,
  color       CHAR(7) NOT NULL DEFAULT '#00a651',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Holdings ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holdings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id       UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  company_name       VARCHAR(100) NOT NULL,
  symbol             VARCHAR(10) NOT NULL,
  sector             VARCHAR(100),
  shares             NUMERIC(12,4) NOT NULL,
  avg_purchase_price NUMERIC(12,2) NOT NULL,
  purchase_date      DATE NOT NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Dividends ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dividend_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id       UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  amount_per_share NUMERIC(8,2) NOT NULL,
  total_amount     NUMERIC(14,2) NOT NULL,
  type             VARCHAR(10) NOT NULL DEFAULT 'cash'
                     CHECK (type IN ('cash','stock','bonus'))
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portfolios_user    ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol    ON holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_dividends_holding  ON dividend_records(holding_id);
CREATE INDEX IF NOT EXISTS idx_dividends_date     ON dividend_records(date);
