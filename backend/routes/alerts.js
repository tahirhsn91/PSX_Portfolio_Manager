/**
 * Price alerts (issue #94).
 *
 * Alert definitions, keyed to the account. Evaluation is client-side while the
 * app is open, so this route only stores and edits what the user asked to be
 * told about — a target/stop is a notification condition, never an order.
 */

'use strict';

const express = require('express');
const { query } = require('../db/pool');
const { requireAuth, blockUntilPasswordChanged } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, blockUntilPasswordChanged);

const SYMBOL_RE = /^[A-Z0-9.-]{1,20}$/;
const KINDS = new Set(['price', 'percent']);
const DIRECTIONS = new Set(['above', 'below']);

const serialize = (row) => ({
  id: row.id,
  symbol: row.symbol,
  kind: row.kind,
  direction: row.direction,
  threshold: Number(row.threshold),
  active: row.active,
  createdAt: row.created_at,
});

/** Validate an alert body; returns { values, errors }. */
function readAlertInput(body = {}) {
  const errors = [];
  const symbol = String(body.symbol ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) errors.push('Enter a valid ticker symbol');
  const kind = body.kind;
  if (!KINDS.has(kind)) errors.push('Kind must be price or percent');
  const direction = body.direction;
  if (!DIRECTIONS.has(direction)) errors.push('Direction must be above or below');
  const threshold = Number(body.threshold);
  if (!Number.isFinite(threshold)) {
    errors.push('Threshold must be a number');
  } else if (kind === 'price' && threshold <= 0) {
    errors.push('A price level must be greater than 0');
  } else if (kind === 'percent' && threshold < 0) {
    errors.push('A percentage move must be 0 or greater');
  }
  return { values: { symbol, kind, direction, threshold }, errors };
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at',
      [req.user.id],
    );
    res.json({ alerts: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { values, errors } = readAlertInput(req.body);
    if (errors.length) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: errors.join('; ') } });
    }
    const { rows } = await query(
      `INSERT INTO alerts (user_id, symbol, kind, direction, threshold)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, values.symbol, values.kind, values.direction, values.threshold],
    );
    res.status(201).json({ alert: serialize(rows[0]) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM alerts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    const merged = {
      symbol: req.body.symbol ?? existing.symbol,
      kind: req.body.kind ?? existing.kind,
      direction: req.body.direction ?? existing.direction,
      threshold: req.body.threshold ?? existing.threshold,
    };
    const { values, errors } = readAlertInput(merged);
    if (errors.length) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: errors.join('; ') } });
    }

    const active = typeof req.body.active === 'boolean' ? req.body.active : existing.active;
    const { rows: updated } = await query(
      `UPDATE alerts SET symbol = $3, kind = $4, direction = $5, threshold = $6, active = $7
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, values.symbol, values.kind, values.direction, values.threshold, active],
    );
    res.json({ alert: serialize(updated[0]) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM alerts WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);
    if (!rowCount) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
