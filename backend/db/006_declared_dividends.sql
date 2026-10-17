-- Declared / upcoming dividends for held stocks (issue #91).
--
-- The scraper feed publishes no declared-dividend calendar (announcement,
-- ex-dividend, book-closure, payment), so these are user-entered. Forecasts are
-- computed at read time by the rule-based prediction engine and never stored
-- here. Every date is optional — a row carries only what the source provides,
-- and a declared dividend is never rendered as paid until it is recorded as a
-- *received* dividend (`dividend_records`), which stays a separate table.

CREATE TABLE IF NOT EXISTS declared_dividends (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id        UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  amount_per_share  NUMERIC(12,4) NOT NULL CHECK (amount_per_share >= 0),
  announcement_date DATE,
  ex_dividend_date  DATE,
  book_closure_date DATE,
  payment_date      DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS declared_dividends_holding_idx ON declared_dividends (holding_id, payment_date, created_at);
