-- Archive portfolios (soft-delete) (issue #98).
--
-- Archiving sets `archived_at`; the row and all of its holdings, ledger and
-- targets stay in place, so a restore is instant and loses nothing. Hard delete
-- remains the destructive path and still removes the whole row (CASCADE).

ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
