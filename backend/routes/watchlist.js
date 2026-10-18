/**
 * Personal watchlist (issue #93).
 *
 * A symbol the account is tracking but does not own. Server-backed and keyed to
 * the account. Only the list is stored here — the frontend prices each entry
 * through the live quote feed, so no stale price is ever persisted.
 */

'use strict';

const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, blockUntilPasswordChanged);

/** A ticker symbol: letters/digits/dots/dashes, 1–20 chars. */
const SYMBOL_RE = /^[A-Z0-9.-]{1,20}$/;

const serialize = (row) => ({
  id: row.id,
  symbol: row.symbol,
  addedAt: row.created_at,
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM watchlist_items WHERE user_id = $1 ORDER BY created_at',
      [req.user.id],
    );
    res.json({ items: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const symbol = String(req.body.symbol ?? '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return res.status(400).json({ error: 'Enter a valid ticker symbol' });
    }
    const { rows } = await query(
      `INSERT INTO watchlist_items (user_id, symbol) VALUES ($1, $2)
       ON CONFLICT (user_id, symbol) DO UPDATE SET symbol = EXCLUDED.symbol
       RETURNING *`,
      [req.user.id, symbol],
    );
    res.status(201).json({ item: serialize(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:symbol', async (req, res, next) => {
  try {
    const symbol = String(req.params.symbol).toUpperCase();
    const { rowCount } = await query(
      'DELETE FROM watchlist_items WHERE user_id = $1 AND symbol = $2',
      [req.user.id, symbol],
    );
    if (!rowCount) return res.status(404).json({ error: 'That symbol is not on your watchlist' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
