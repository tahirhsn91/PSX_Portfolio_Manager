/**
 * Portfolio routes — the database is the source of truth.
 *
 * Every query is scoped by the authenticated user id: a portfolio that belongs
 * to someone else is indistinguishable from one that doesn't exist (404). There
 * is no cross-user read path anywhere in this file.
 *
 * Serialization note: `pg` returns NUMERIC and DATE columns as **strings**, so
 * every value is mapped explicitly into the frontend's `Portfolio` / `Holding` /
 * `DividendRecord` shapes (numbers as numbers, dates as YYYY-MM-DD or ISO).
 */

'use strict';

const express = require('express');
const { getPool, query } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIVIDEND_TYPES = ['cash', 'stock', 'bonus'];

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ── Serialization ─────────────────────────────────────────────────────────────

const num = (v) => (v === null || v === undefined ? 0 : Number(v));
const isoDate = (v) =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const isoStamp = (v) =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

function serializeDividend(row) {
  return {
    id: row.id,
    holdingId: row.holding_id,
    date: isoDate(row.date),
    amountPerShare: num(row.amount_per_share),
    totalAmount: num(row.total_amount),
    type: row.type,
  };
}

function serializeHolding(row, dividends) {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    companyName: row.company_name,
    symbol: row.symbol,
    sector: row.sector ?? 'Unknown',
    shares: num(row.shares),
    averagePurchasePrice: num(row.avg_purchase_price),
    purchaseDate: isoDate(row.purchase_date),
    ...(row.notes ? { notes: row.notes } : {}),
    dividendsReceived: dividends,
  };
}

function serializePortfolio(row, holdings) {
  return {
    id: row.id,
    name: row.name,
    ...(row.description ? { description: row.description } : {}),
    color: row.color,
    createdAt: isoStamp(row.created_at),
    updatedAt: isoStamp(row.updated_at),
    holdings,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All of a user's portfolios with holdings + dividends nested. */
async function listPortfolios(userId) {
  const { rows: portfolioRows } = await query(
    'SELECT * FROM portfolios WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  if (!portfolioRows.length) return [];

  const portfolioIds = portfolioRows.map((p) => p.id);
  const { rows: holdingRows } = await query(
    'SELECT * FROM holdings WHERE portfolio_id = ANY($1::uuid[]) ORDER BY created_at',
    [portfolioIds],
  );

  const holdingIds = holdingRows.map((h) => h.id);
  const dividendRows = holdingIds.length
    ? (
        await query(
          'SELECT * FROM dividend_records WHERE holding_id = ANY($1::uuid[]) ORDER BY date',
          [holdingIds],
        )
      ).rows
    : [];

  const dividendsByHolding = new Map();
  for (const d of dividendRows) {
    const list = dividendsByHolding.get(d.holding_id) ?? [];
    list.push(serializeDividend(d));
    dividendsByHolding.set(d.holding_id, list);
  }

  const holdingsByPortfolio = new Map();
  for (const h of holdingRows) {
    const list = holdingsByPortfolio.get(h.portfolio_id) ?? [];
    list.push(serializeHolding(h, dividendsByHolding.get(h.id) ?? []));
    holdingsByPortfolio.set(h.portfolio_id, list);
  }

  return portfolioRows.map((p) => serializePortfolio(p, holdingsByPortfolio.get(p.id) ?? []));
}

async function loadPortfolio(userId, id) {
  const all = await listPortfolios(userId);
  return all.find((p) => p.id === id) ?? null;
}

/** Ownership gate for every nested route. */
async function findOwnedPortfolio(userId, id) {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await query('SELECT * FROM portfolios WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ?? null;
}

async function findOwnedHolding(userId, portfolioId, holdingId) {
  if (!UUID_RE.test(holdingId)) return null;
  const { rows } = await query(
    `SELECT h.* FROM holdings h
       JOIN portfolios p ON p.id = h.portfolio_id
      WHERE h.id = $1 AND h.portfolio_id = $2 AND p.user_id = $3`,
    [holdingId, portfolioId, userId],
  );
  return rows[0] ?? null;
}

const notFound = (res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
const invalid = (res, message) =>
  res.status(400).json({ error: { code: 'INVALID_INPUT', message } });

// ── Validation ────────────────────────────────────────────────────────────────

function readPortfolioInput(body = {}, { partial = false } = {}) {
  const out = {};
  const errors = [];

  if (body.name !== undefined || !partial) {
    const name = String(body.name ?? '').trim();
    if (!name) errors.push('Portfolio name is required');
    else if (name.length > 50) errors.push('Portfolio name must be 50 characters or fewer');
    else out.name = name;
  }
  if (body.description !== undefined) {
    out.description = body.description ? String(body.description).trim().slice(0, 2000) : null;
  }
  if (body.color !== undefined || !partial) {
    const color = String(body.color ?? '');
    if (!HEX_COLOR_RE.test(color)) errors.push('Color must be a hex value like #00a651');
    else out.color = color;
  }

  return { values: out, errors };
}

function readHoldingInput(body = {}, { partial = false } = {}) {
  const out = {};
  const errors = [];

  const text = (field, max, label) => {
    if (body[field] === undefined) {
      if (!partial) errors.push(`${label} is required`);
      return;
    }
    const value = String(body[field] ?? '').trim();
    if (!value) errors.push(`${label} is required`);
    else if (value.length > max) errors.push(`${label} must be ${max} characters or fewer`);
    else out[field] = value;
  };

  text('companyName', 100, 'Company name');
  text('symbol', 10, 'Symbol');
  if (out.symbol) out.symbol = out.symbol.toUpperCase();
  if (body.sector !== undefined) out.sector = body.sector ? String(body.sector).trim().slice(0, 100) : null;

  if (body.shares !== undefined || !partial) {
    const shares = Number(body.shares);
    if (!Number.isFinite(shares) || shares <= 0) errors.push('Shares must be greater than 0');
    else out.shares = shares;
  }
  if (body.averagePurchasePrice !== undefined || !partial) {
    const price = Number(body.averagePurchasePrice);
    if (!Number.isFinite(price) || price < 0) errors.push('Average purchase price must be 0 or greater');
    else out.averagePurchasePrice = price;
  }
  if (body.purchaseDate !== undefined || !partial) {
    const date = String(body.purchaseDate ?? '').slice(0, 10);
    if (!DATE_RE.test(date)) errors.push('Purchase date must be YYYY-MM-DD');
    else out.purchaseDate = date;
  }
  if (body.notes !== undefined) out.notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;

  return { values: out, errors };
}

function readDividendInput(body = {}) {
  const errors = [];
  const date = String(body.date ?? '').slice(0, 10);
  if (!DATE_RE.test(date)) errors.push('Date must be YYYY-MM-DD');

  const amountPerShare = Number(body.amountPerShare);
  if (!Number.isFinite(amountPerShare) || amountPerShare < 0) {
    errors.push('Amount per share must be 0 or greater');
  }
  const totalAmount = Number(body.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount < 0) {
    errors.push('Total amount must be 0 or greater');
  }
  const type = String(body.type ?? 'cash');
  if (!DIVIDEND_TYPES.includes(type)) errors.push(`Type must be one of ${DIVIDEND_TYPES.join(', ')}`);

  return { values: { date, amountPerShare, totalAmount, type }, errors };
}

// ── GET /api/portfolios ───────────────────────────────────────────────────────
router.get(
  '/',
  wrap(async (req, res) => {
    res.json({ portfolios: await listPortfolios(req.user.id) });
  }),
);

// ── GET /api/portfolios/export ────────────────────────────────────────────────
// Declared before `/:id` so "export" isn't parsed as a portfolio id.
router.get(
  '/export',
  wrap(async (req, res) => {
    res.json({
      app: 'psx-portfolio-manager',
      version: 1,
      exportedAt: new Date().toISOString(),
      portfolios: await listPortfolios(req.user.id),
    });
  }),
);

// ── POST /api/portfolios ──────────────────────────────────────────────────────
router.post(
  '/',
  wrap(async (req, res) => {
    const { values, errors } = readPortfolioInput(req.body);
    if (errors.length) return invalid(res, errors.join('; '));

    const { rows } = await query(
      `INSERT INTO portfolios (user_id, name, description, color)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, values.name, values.description ?? null, values.color],
    );
    return res.status(201).json({ portfolio: serializePortfolio(rows[0], []) });
  }),
);

// ── POST /api/portfolios/import ───────────────────────────────────────────────
router.post(
  '/import',
  wrap(async (req, res) => {
    const incoming = Array.isArray(req.body?.portfolios) ? req.body.portfolios : null;
    if (!incoming) return invalid(res, 'Body must be { portfolios: [...] }');

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      let imported = 0;

      for (const p of incoming) {
        const name = String(p?.name ?? '').trim().slice(0, 50);
        if (!name) continue;

        const { rows } = await client.query(
          `INSERT INTO portfolios (user_id, name, description, color)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [
            req.user.id,
            name,
            p.description ? String(p.description).trim().slice(0, 2000) : null,
            HEX_COLOR_RE.test(String(p.color ?? '')) ? p.color : '#00a651',
          ],
        );
        const portfolioId = rows[0].id;

        for (const h of Array.isArray(p.holdings) ? p.holdings : []) {
          const symbol = String(h?.symbol ?? '').trim().toUpperCase().slice(0, 10);
          if (!symbol) continue;

          const holding = await client.query(
            `INSERT INTO holdings
               (portfolio_id, company_name, symbol, sector, shares, avg_purchase_price, purchase_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              portfolioId,
              String(h.companyName ?? symbol).trim().slice(0, 100),
              symbol,
              h.sector ? String(h.sector).trim().slice(0, 100) : null,
              Number(h.shares) || 0,
              Number(h.averagePurchasePrice) || 0,
              DATE_RE.test(String(h.purchaseDate ?? '')) ? String(h.purchaseDate).slice(0, 10) : isoDate(new Date()),
              h.notes ? String(h.notes).trim().slice(0, 2000) : null,
            ],
          );

          for (const d of Array.isArray(h.dividendsReceived) ? h.dividendsReceived : []) {
            if (!DATE_RE.test(String(d?.date ?? ''))) continue;
            await client.query(
              `INSERT INTO dividend_records (holding_id, date, amount_per_share, total_amount, type)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                holding.rows[0].id,
                String(d.date).slice(0, 10),
                Number(d.amountPerShare) || 0,
                Number(d.totalAmount) || 0,
                DIVIDEND_TYPES.includes(d.type) ? d.type : 'cash',
              ],
            );
          }
        }
        imported += 1;
      }

      await client.query('COMMIT');
      return res.status(201).json({ imported, portfolios: await listPortfolios(req.user.id) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// ── PATCH /api/portfolios/:id ─────────────────────────────────────────────────
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const existing = await findOwnedPortfolio(req.user.id, req.params.id);
    if (!existing) return notFound(res);

    const { values, errors } = readPortfolioInput(req.body, { partial: true });
    if (errors.length) return invalid(res, errors.join('; '));

    const sets = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (values.name !== undefined) push('name', values.name);
    if (values.description !== undefined) push('description', values.description);
    if (values.color !== undefined) push('color', values.color);

    if (!sets.length) return invalid(res, 'Nothing to update');

    sets.push('updated_at = NOW()');
    params.push(req.params.id, req.user.id);

    await query(
      `UPDATE portfolios SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params,
    );

    return res.json({ portfolio: await loadPortfolio(req.user.id, req.params.id) });
  }),
);

// ── DELETE /api/portfolios/:id ────────────────────────────────────────────────
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const existing = await findOwnedPortfolio(req.user.id, req.params.id);
    if (!existing) return notFound(res);

    await query('DELETE FROM portfolios WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    return res.json({ ok: true, deletedId: req.params.id });
  }),
);

// ── POST /api/portfolios/:id/duplicate ────────────────────────────────────────
router.post(
  '/:id/duplicate',
  wrap(async (req, res) => {
    const source = await findOwnedPortfolio(req.user.id, req.params.id);
    if (!source) return notFound(res);

    const client = await getPool().connect();
    let newId;
    try {
      await client.query('BEGIN');

      const name = req.body?.name
        ? String(req.body.name).trim().slice(0, 50)
        : `${source.name} (Copy)`;

      const created = await client.query(
        `INSERT INTO portfolios (user_id, name, description, color)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.user.id, name, source.description, source.color],
      );
      newId = created.rows[0].id;

      const holdings = await client.query('SELECT * FROM holdings WHERE portfolio_id = $1', [source.id]);
      for (const h of holdings.rows) {
        const copy = await client.query(
          `INSERT INTO holdings
             (portfolio_id, company_name, symbol, sector, shares, avg_purchase_price, purchase_date, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [newId, h.company_name, h.symbol, h.sector, h.shares, h.avg_purchase_price, h.purchase_date, h.notes],
        );
        // Same transaction, so a failure here rolls the whole copy back.
        await client.query(
          `INSERT INTO dividend_records (holding_id, date, amount_per_share, total_amount, type)
           SELECT $1, date, amount_per_share, total_amount, type
             FROM dividend_records WHERE holding_id = $2`,
          [copy.rows[0].id, h.id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.status(201).json({ portfolio: await loadPortfolio(req.user.id, newId) });
  }),
);

// ── Holdings ──────────────────────────────────────────────────────────────────

router.post(
  '/:id/holdings',
  wrap(async (req, res) => {
    const portfolio = await findOwnedPortfolio(req.user.id, req.params.id);
    if (!portfolio) return notFound(res);

    const { values, errors } = readHoldingInput(req.body);
    if (errors.length) return invalid(res, errors.join('; '));

    await query(
      `INSERT INTO holdings
         (portfolio_id, company_name, symbol, sector, shares, avg_purchase_price, purchase_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        portfolio.id,
        values.companyName,
        values.symbol,
        values.sector ?? null,
        values.shares,
        values.averagePurchasePrice,
        values.purchaseDate,
        values.notes ?? null,
      ],
    );
    await query('UPDATE portfolios SET updated_at = NOW() WHERE id = $1', [portfolio.id]);

    return res.status(201).json({ portfolio: await loadPortfolio(req.user.id, portfolio.id) });
  }),
);

router.patch(
  '/:id/holdings/:holdingId',
  wrap(async (req, res) => {
    const holding = await findOwnedHolding(req.user.id, req.params.id, req.params.holdingId);
    if (!holding) return notFound(res);

    const { values, errors } = readHoldingInput(req.body, { partial: true });
    if (errors.length) return invalid(res, errors.join('; '));

    const columns = {
      companyName: 'company_name',
      symbol: 'symbol',
      sector: 'sector',
      shares: 'shares',
      averagePurchasePrice: 'avg_purchase_price',
      purchaseDate: 'purchase_date',
      notes: 'notes',
    };
    const sets = [];
    const params = [];
    for (const [field, column] of Object.entries(columns)) {
      if (values[field] !== undefined) {
        params.push(values[field]);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (!sets.length) return invalid(res, 'Nothing to update');

    params.push(holding.id);
    await query(`UPDATE holdings SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    await query('UPDATE portfolios SET updated_at = NOW() WHERE id = $1', [holding.portfolio_id]);

    return res.json({ portfolio: await loadPortfolio(req.user.id, holding.portfolio_id) });
  }),
);

router.delete(
  '/:id/holdings/:holdingId',
  wrap(async (req, res) => {
    const holding = await findOwnedHolding(req.user.id, req.params.id, req.params.holdingId);
    if (!holding) return notFound(res);

    await query('DELETE FROM holdings WHERE id = $1', [holding.id]);
    await query('UPDATE portfolios SET updated_at = NOW() WHERE id = $1', [holding.portfolio_id]);

    return res.json({ portfolio: await loadPortfolio(req.user.id, holding.portfolio_id) });
  }),
);

// ── Dividends ─────────────────────────────────────────────────────────────────

router.post(
  '/:id/holdings/:holdingId/dividends',
  wrap(async (req, res) => {
    const holding = await findOwnedHolding(req.user.id, req.params.id, req.params.holdingId);
    if (!holding) return notFound(res);

    const { values, errors } = readDividendInput(req.body);
    if (errors.length) return invalid(res, errors.join('; '));

    await query(
      `INSERT INTO dividend_records (holding_id, date, amount_per_share, total_amount, type)
       VALUES ($1, $2, $3, $4, $5)`,
      [holding.id, values.date, values.amountPerShare, values.totalAmount, values.type],
    );

    return res.status(201).json({ portfolio: await loadPortfolio(req.user.id, holding.portfolio_id) });
  }),
);

router.delete(
  '/:id/holdings/:holdingId/dividends/:dividendId',
  wrap(async (req, res) => {
    const holding = await findOwnedHolding(req.user.id, req.params.id, req.params.holdingId);
    if (!holding) return notFound(res);
    if (!UUID_RE.test(req.params.dividendId)) return notFound(res);

    const { rowCount } = await query(
      'DELETE FROM dividend_records WHERE id = $1 AND holding_id = $2',
      [req.params.dividendId, holding.id],
    );
    if (!rowCount) return notFound(res);

    return res.json({ portfolio: await loadPortfolio(req.user.id, holding.portfolio_id) });
  }),
);

// ── GET /api/portfolios/:id ───────────────────────────────────────────────────
router.get(
  '/:id',
  wrap(async (req, res) => {
    const portfolio = await loadPortfolio(req.user.id, req.params.id);
    if (!portfolio) return notFound(res);
    return res.json({ portfolio });
  }),
);

module.exports = router;
