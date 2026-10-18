/**
 * The purchase ledger's arithmetic, in one place (issue #4, G2).
 *
 * The log is the source of truth: a holding's `shares` is its total and
 * `avg_purchase_price` its cost-weighted mean. The arithmetic here is the store's,
 * unchanged — `positionFromBuys` in `frontend/src/utils/calculations.ts` — so the
 * same edit made in either place lands on identical totals (decision 14).
 *
 * `kind = 'opening'` is not a purchase. It is how a position that predates the log
 * (or one edited directly, per decision 14) is represented, and every function here
 * treats it as an ordinary entry: excluding it would re-price every migrated holding
 * to nothing.
 *
 * Precision: money is rounded to the paisa (`roundMoney`), matching the store, and
 * `deriveFromLog` re-reads the rows the database actually stored rather than the
 * numbers we passed in. `NUMERIC(12,4)` and `NUMERIC(12,2)` round on the way in, so
 * deriving from our own inputs would drift from the log by fractions of a paisa.
 */

'use strict';

/** Money in PKR, to the cent — identical to the frontend's `roundMoney`. */
const roundMoney = (amount) => Math.round(amount * 100) / 100;

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/** Normalize a DATE (or ISO string) to 'YYYY-MM-DD' — pg returns DATE as a Date. */
const dayOf = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** The store's `positionFromBuys`, unchanged. */
function positionFromBuys(buys) {
  const shares = buys.reduce((sum, b) => sum + num(b.shares), 0);
  const cost = buys.reduce((sum, b) => sum + num(b.shares) * num(b.price_per_share ?? b.pricePerShare), 0);
  return { shares, averagePurchasePrice: shares > 0 ? roundMoney(cost / shares) : 0 };
}

/** The log for a holding, oldest first. */
async function loadBuys(client, holdingId) {
  const { rows } = await client.query(
    'SELECT * FROM holding_buys WHERE holding_id = $1 ORDER BY date, created_at',
    [holdingId],
  );
  return rows;
}

/** The sell log for a holding, oldest first. */
async function loadSells(client, holdingId) {
  const { rows } = await client.query(
    'SELECT * FROM holding_sells WHERE holding_id = $1 ORDER BY date, created_at',
    [holdingId],
  );
  return rows;
}

/** The corporate-action log for a holding, oldest first. */
async function loadActions(client, holdingId) {
  const { rows } = await client.query(
    'SELECT * FROM corporate_actions WHERE holding_id = $1 ORDER BY date, created_at',
    [holdingId],
  );
  return rows;
}

/**
 * The position a holding's full ledger (buys + sells + corporate actions)
 * describes, under the weighted-average (perpetual) method. Mirrors the
 * frontend's `replayLedger`; only the position is needed here — realized P/L is
 * computed at read time.
 *
 * A split scales shares by `ratio` (cost basis unchanged); a bonus adds
 * `ratio × shares` at no cost; a rights issue adds `ratio × shares` at the
 * subscription `price`. Fractional shares round to whole shares on both sides.
 */
function replayPosition(buys, sells, actions = []) {
  const events = [
    ...buys.map((b) => ({ date: dayOf(b.date), shares: num(b.shares), pricePerShare: num(b.price_per_share), type: 'buy' })),
    ...sells.map((s) => ({ date: dayOf(s.date), shares: num(s.shares), pricePerShare: num(s.price_per_share), type: 'sell' })),
    ...actions.map((a) => ({ date: dayOf(a.date), type: a.type, ratio: num(a.ratio), price: num(a.price) })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let shares = 0;
  let cost = 0;
  for (const e of events) {
    if (e.type === 'buy') {
      shares += e.shares;
      cost += e.shares * e.pricePerShare;
    } else if (e.type === 'sell') {
      const average = shares > 0 ? cost / shares : 0;
      const qty = Math.max(0, Math.min(e.shares, shares));
      shares -= qty;
      cost -= average * qty;
    } else if (e.type === 'split') {
      shares = Math.round(shares * e.ratio);
    } else if (e.type === 'bonus') {
      shares = Math.round(shares * (1 + e.ratio));
    } else if (e.type === 'rights') {
      const added = Math.round(shares * e.ratio);
      shares += added;
      cost += added * e.price;
    }
  }
  return { shares, averagePurchasePrice: shares > 0 ? roundMoney(cost / shares) : 0 };
}

/** Does a chronological replay of buys + sells ever go short? (oversell check). */
function ledgerGoesNegative(buys, sells) {
  const events = [
    ...buys.map((b) => ({ date: dayOf(b.date), shares: num(b.shares), type: 'buy' })),
    ...sells.map((s) => ({ date: dayOf(s.date), shares: num(s.shares), type: 'sell' })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let shares = 0;
  for (const e of events) {
    shares += e.type === 'buy' ? e.shares : -e.shares;
    if (shares < -1e-9) return true;
  }
  return false;
}

/**
 * Recompute the holding from its log and write the totals back. `purchase_date` is
 * deliberately untouched: it describes the position, not the latest purchase — every
 * purchase carries its own date in the log (the store draws the same line).
 */
async function deriveFromLog(client, holdingId) {
  const buys = await loadBuys(client, holdingId);
  const sells = await loadSells(client, holdingId);
  const actions = await loadActions(client, holdingId);
  const position = replayPosition(buys, sells, actions);
  const { rows } = await client.query(
    `UPDATE holdings SET shares = $2, avg_purchase_price = $3
      WHERE id = $1 RETURNING *`,
    [holdingId, position.shares, position.averagePurchasePrice],
  );
  return rows[0] ?? null;
}

/**
 * A holding with no log predates the feature (or was created through the Add form,
 * which writes the totals directly). Seed one `opening` entry describing what the
 * position already is, so the log reconciles to the holding instead of deriving it
 * to zero.
 */
async function ensureOpeningEntry(client, holding) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM holding_buys WHERE holding_id = $1', [holding.id]);
  if (rows[0].n > 0) return false;
  if (num(holding.shares) <= 0) return false; // nothing to describe; already derives to zero

  await client.query(
    `INSERT INTO holding_buys (holding_id, date, shares, price_per_share, kind)
     VALUES ($1, $2, $3, $4, 'opening')`,
    [holding.id, holding.purchase_date, holding.shares, holding.avg_purchase_price],
  );
  return true;
}

/**
 * Decision 14: the Edit form keeps writing the totals directly, so the server keeps
 * the log deriving to the result by rewriting the holding's `opening` entry — never a
 * real purchase, never a special case inside the derivation. Because an opening entry
 * can only be a positive quantity, an edit the log cannot absorb (editing a position
 * *below* the quantity its real purchases already account for) has no representation
 * and is refused, leaving the holding exactly as it was.
 */
async function absorbEdit(client, holding, next) {
  const sells = await loadSells(client, holding.id);
  if (sells.length > 0) {
    return {
      ok: false,
      reason: 'This holding has sales — edit its position through the buy/sell ledger.',
    };
  }
  const actions = await loadActions(client, holding.id);
  if (actions.length > 0) {
    return {
      ok: false,
      reason: 'This holding has corporate actions — edit its position through the ledger.',
    };
  }
  await ensureOpeningEntry(client, holding);

  const buys = await loadBuys(client, holding.id);
  const real = buys.filter((b) => b.kind === 'buy');
  const realShares = real.reduce((sum, b) => sum + num(b.shares), 0);
  const realCost = real.reduce((sum, b) => sum + num(b.shares) * num(b.price_per_share), 0);

  const targetShares = num(next.shares);
  const targetCost = targetShares * num(next.averagePurchasePrice);
  const openingShares = targetShares - realShares;

  if (openingShares <= 0) {
    return {
      ok: false,
      reason:
        realShares > 0
          ? `This holding already logs ${realShares} shares of real purchases, so a total of ${targetShares} cannot be represented by an opening entry.`
          : 'A holding must be greater than zero shares.',
    };
  }

  const openingCost = roundMoney(targetCost - realCost);
  if (openingCost < 0) {
    return { ok: false, reason: 'The logged purchases already cost more than this total, so the log cannot derive to it.' };
  }

  await client.query(
    `UPDATE holding_buys SET shares = $2, price_per_share = $3, date = $4
      WHERE holding_id = $1 AND kind = 'opening'`,
    [holding.id, openingShares, roundMoney(openingCost / openingShares), next.purchaseDate],
  );

  return { ok: true };
}

/** Log a purchase. A holding with no log is seeded first, matching the store. */
async function addBuy(client, holding, input) {
  await ensureOpeningEntry(client, holding);
  const { rows } = await client.query(
    `INSERT INTO holding_buys (holding_id, date, shares, price_per_share, kind)
     VALUES ($1, $2, $3, $4, 'buy') RETURNING *`,
    [holding.id, input.date, input.shares, input.pricePerShare],
  );
  await deriveFromLog(client, holding.id);
  return rows[0];
}

/** Correct one logged purchase; the whole position is re-derived from the log. */
async function updateBuy(client, holdingId, buyId, patch) {
  const { rows } = await client.query(
    `UPDATE holding_buys SET shares = $3, price_per_share = $4
      WHERE id = $1 AND holding_id = $2 RETURNING *`,
    [buyId, holdingId, patch.shares, patch.pricePerShare],
  );
  if (!rows.length) return null;
  await deriveFromLog(client, holdingId);
  return rows[0];
}

/**
 * Remove a logged purchase. The last entry *is* the position, so removing it removes
 * the holding — an empty log would describe nothing.
 */
async function deleteBuy(client, holdingId, buyId) {
  const buys = await loadBuys(client, holdingId);
  const target = buys.find((b) => b.id === buyId);
  if (!target) return { kind: 'missing' };

  await client.query('DELETE FROM holding_buys WHERE id = $1 AND holding_id = $2', [buyId, holdingId]);

  if (buys.length <= 1) {
    await client.query('DELETE FROM holdings WHERE id = $1', [holdingId]);
    return { kind: 'holding-removed' };
  }

  const holding = await deriveFromLog(client, holdingId);
  return { kind: 'updated', holding };
}

/** Log a sale. Refused (without writing) if the ledger would ever go short. */
async function addSell(client, holding, input) {
  const buys = await loadBuys(client, holding.id);
  const sells = await loadSells(client, holding.id);
  if (ledgerGoesNegative(buys, [...sells, { date: input.date, shares: input.shares }])) {
    return { ok: false, reason: 'This sale exceeds the shares owned at its date.' };
  }
  const { rows } = await client.query(
    `INSERT INTO holding_sells (holding_id, date, shares, price_per_share, fees)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [holding.id, input.date, input.shares, input.pricePerShare, input.fees ?? 0],
  );
  await deriveFromLog(client, holding.id);
  return { ok: true, sell: rows[0] };
}

/** Correct one logged sale; the whole position is re-derived from the ledger. */
async function updateSell(client, holdingId, sellId, input) {
  const buys = await loadBuys(client, holdingId);
  const sells = await loadSells(client, holdingId);
  const rest = sells.filter((s) => s.id !== sellId);
  if (ledgerGoesNegative(buys, [...rest, { date: input.date, shares: input.shares }])) {
    return { ok: false, reason: 'This sale exceeds the shares owned at its date.' };
  }
  const { rows } = await client.query(
    `UPDATE holding_sells SET date = $3, shares = $4, price_per_share = $5, fees = $6
      WHERE id = $1 AND holding_id = $2 RETURNING *`,
    [sellId, holdingId, input.date, input.shares, input.pricePerShare, input.fees ?? 0],
  );
  if (!rows.length) return { ok: false, reason: 'Sale not found.' };
  await deriveFromLog(client, holdingId);
  return { ok: true, sell: rows[0] };
}

/** Remove a logged sale; the whole position is re-derived from the ledger. */
async function deleteSell(client, holdingId, sellId) {
  const { rowCount } = await client.query(
    'DELETE FROM holding_sells WHERE id = $1 AND holding_id = $2',
    [sellId, holdingId],
  );
  if (!rowCount) return { ok: false, reason: 'Sale not found.' };
  await deriveFromLog(client, holdingId);
  return { ok: true };
}

/** Log a corporate action and re-derive the position from the full ledger. */
async function addAction(client, holding, input) {
  await ensureOpeningEntry(client, holding);
  const { rows } = await client.query(
    `INSERT INTO corporate_actions (holding_id, type, date, ratio, price)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [holding.id, input.type, input.date, input.ratio, input.price ?? null],
  );
  await deriveFromLog(client, holding.id);
  return rows[0];
}

/** Undo a corporate action; the whole position is re-derived. */
async function deleteAction(client, holdingId, actionId) {
  const { rowCount } = await client.query(
    'DELETE FROM corporate_actions WHERE id = $1 AND holding_id = $2',
    [actionId, holdingId],
  );
  if (!rowCount) return { ok: false, reason: 'Corporate action not found.' };
  await deriveFromLog(client, holdingId);
  return { ok: true };
}

module.exports = {
  roundMoney,
  positionFromBuys,
  loadBuys,
  loadSells,
  loadActions,
  replayPosition,
  ledgerGoesNegative,
  deriveFromLog,
  ensureOpeningEntry,
  absorbEdit,
  addBuy,
  updateBuy,
  deleteBuy,
  addSell,
  updateSell,
  deleteSell,
  addAction,
  deleteAction,
};
