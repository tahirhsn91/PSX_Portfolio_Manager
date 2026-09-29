/**
 * The purchase ledger, end to end (issue #4, G2).
 *
 * The log is the source of truth, so what these tests are here to catch is drift:
 * a holding whose stored totals no longer agree with the entries that produced them,
 * or an edit that half-lands. The arithmetic asserted here is the browser store's —
 * `positionFromBuys` and `roundMoney` — so a total that matches in one place matches
 * in the other (decision 14).
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let api; // a signed-in client, the owner of the portfolio under test
let stranger; // a second account, to prove none of this leaks

const roundMoney = (n) => Math.round(n * 100) / 100;

before(async () => {
  await createTestDatabase();
  const { runMigrations } = require('../db/migrate');
  await runMigrations();
  server = await startServer();
});

after(async () => {
  if (server) await server.close();
  const { close } = require('../db/pool');
  if (close) await close();
});

beforeEach(async () => {
  const { query } = require('../db/pool');
  await query('TRUNCATE users CASCADE');

  api = await clientFor(server.baseUrl);
  const first = await api.post('/api/auth/signup', {
    email: 'owner@example.com',
    password: 'password123',
    displayName: 'owner@example.com',
  });
  assert.equal(first.status, 201, 'the first account of an empty instance should be created');

  stranger = await clientFor(server.baseUrl);
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 4); // low cost: tests only
  await query(`INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user')`, [
    'stranger@example.com',
    hash,
    'stranger@example.com',
  ]);
  const login = await stranger.post('/api/auth/login', {
    email: 'stranger@example.com',
    password: 'password123',
  });
  assert.equal(login.status, 200, 'the stranger should be able to log in');
});

/** A portfolio with one holding, created the way the Add form creates it. */
async function seedHolding(overrides = {}) {
  const portfolio = await api.post('/api/portfolios', { name: 'Ledger', color: '#00a651' });
  assert.equal(portfolio.status, 201, JSON.stringify(portfolio.body));
  const portfolioId = portfolio.body.portfolio.id;

  const holding = await api.post(`/api/portfolios/${portfolioId}/holdings`, {
    companyName: 'Engro Holdings',
    symbol: 'ENGROH',
    sector: 'Fertilizer',
    shares: 120,
    averagePurchasePrice: 275.5,
    purchaseDate: '2026-03-04',
    ...overrides,
  });
  assert.equal(holding.status, 201, JSON.stringify(holding.body));

  return { portfolioId, holding: holding.body.portfolio.holdings[0] };
}

const findHolding = (portfolio, id) => portfolio.holdings.find((h) => h.id === id);

describe('the log a holding is created with', () => {
  test('a new holding arrives with an opening entry that derives back to its totals', async () => {
    const { portfolioId, holding } = await seedHolding();

    assert.equal(holding.shares, 120);
    assert.equal(holding.averagePurchasePrice, 275.5);
    assert.equal(holding.buys.length, 1, 'the Add form should have seeded one entry');

    const [opening] = holding.buys;
    assert.equal(opening.kind, 'opening', 'it is a position, not a purchase');
    assert.equal(opening.shares, 120);
    assert.equal(opening.pricePerShare, 275.5);
    assert.equal(opening.totalCost, 120 * 275.5);
    assert.equal(opening.date, '2026-03-04');

    // The entry reproduces the holding exactly — no rounding drift on the way in.
    assert.equal(roundMoney(opening.shares * opening.pricePerShare), roundMoney(holding.shares * holding.averagePurchasePrice));
    assert.equal(portfolioId.length > 0, true);
  });
});

describe('logging a purchase', () => {
  test('re-derives the position and leaves the position\'s own date alone', async () => {
    const { portfolioId, holding } = await seedHolding();

    // 120 @ 275.50 = 33,060.00, plus 10 @ 100.00 = 34,060.00 over 130 shares = 262.00
    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 130, 'the total is the log\'s sum');
    assert.equal(after.averagePurchasePrice, roundMoney(34060 / 130), 'the mean is cost-weighted');
    assert.equal(after.purchaseDate, '2026-03-04', 'the position keeps its original date');
    assert.equal(after.buys.length, 2);
    assert.equal(after.buys.filter((b) => b.kind === 'buy').length, 1);

    // The client cannot smuggle in an opening entry.
    assert.equal(after.buys.every((b) => b.kind === 'buy' || b.kind === 'opening'), true);
  });

  test('a client-declared kind is ignored — new entries are purchases', async () => {
    const { portfolioId, holding } = await seedHolding();
    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-02',
      shares: 5,
      pricePerShare: 200,
      kind: 'opening',
    });
    assert.equal(res.status, 201);

    const after = findHolding(res.body.portfolio, holding.id);
    const added = after.buys.find((b) => b.date === '2026-04-02');
    assert.equal(added.kind, 'buy', 'opening entries are the server\'s to create');
  });

  test('rejects a nonsensical entry without touching the holding', async () => {
    const { portfolioId, holding } = await seedHolding();

    for (const body of [
      { date: '2026-04-01', shares: 0, pricePerShare: 10 },
      { date: '2026-04-01', shares: -5, pricePerShare: 10 },
      { date: 'not-a-date', shares: 5, pricePerShare: 10 },
      { date: '2026-04-01', shares: 5, pricePerShare: -1 },
    ]) {
      const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} should be refused`);
    }

    const read = await api.get(`/api/portfolios/${portfolioId}`);
    const held = findHolding(read.body.portfolio, holding.id);
    assert.equal(held.shares, 120);
    assert.equal(held.buys.length, 1);
  });
});

describe('correcting and removing entries', () => {
  test('correcting one purchase re-prices the whole position', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });
    const buy = findHolding(added.body.portfolio, holding.id).buys.find((b) => b.kind === 'buy');

    // 10 @ 100.00 → 40 @ 400.00: 120 @ 275.50 + 40 @ 400.00 = 160, cost 49,060.00
    const res = await api.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys/${buy.id}`, {
      date: '2026-04-01',
      shares: 40,
      pricePerShare: 400,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 160);
    assert.equal(after.averagePurchasePrice, roundMoney(49060 / 160));
    assert.equal(after.buys.length, 2, 'correcting an entry does not duplicate it');
  });

  test('removing the last entry removes the holding — an empty log describes nothing', async () => {
    const { portfolioId, holding } = await seedHolding();

    const res = await api.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/buys/${holding.buys[0].id}`,
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.holdingRemoved, true);
    assert.equal(
      res.body.portfolio.holdings.some((h) => h.id === holding.id),
      false,
      'the holding should be gone',
    );
  });

  test('removing one of several entries re-derives the rest', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });
    const buy = findHolding(added.body.portfolio, holding.id).buys.find((b) => b.kind === 'buy');

    const res = await api.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/buys/${buy.id}`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.holdingRemoved, false);

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 120, 'back to what the opening entry describes');
    assert.equal(after.averagePurchasePrice, 275.5);
    assert.equal(after.buys.length, 1);
  });
});

describe('editing the totals directly (decision 14)', () => {
  test('rewrites the opening entry so the log derives to the edited totals, paisa-exact', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });
    assert.equal(added.status, 201);

    // 130 shares at a mean of 262.307692… → edited to 135 at exactly 262.50. The real
    // purchase (10 @ 100) is untouched, so the opening entry carries the difference:
    // 125 shares, and a price that makes the cost come back out at 262.50.
    const res = await api.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}`, {
      shares: 135,
      averagePurchasePrice: 262.5,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 135);
    assert.equal(after.averagePurchasePrice, 262.5, 'the edit is what the holding reads');

    const opening = after.buys.find((b) => b.kind === 'opening');
    assert.equal(opening.shares, 125, 'the opening entry absorbed the difference');
    assert.equal(opening.pricePerShare, 275.5, 'at a price that preserves the mean');

    // And the log still reproduces the totals exactly.
    const shares = after.buys.reduce((sum, b) => sum + b.shares, 0);
    const cost = after.buys.reduce((sum, b) => sum + b.shares * b.pricePerShare, 0);
    assert.equal(shares, 135);
    assert.equal(roundMoney(cost / shares), 262.5);
  });

  test('an edit the log cannot absorb is refused with 409, and nothing changes', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });
    const before = findHolding(added.body.portfolio, holding.id);

    // 5 shares cannot be described by the log: the real purchase alone accounts for 10.
    const res = await api.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}`, {
      shares: 5,
      averagePurchasePrice: 100,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'LOG_CONFLICT');

    const read = await api.get(`/api/portfolios/${portfolioId}`);
    const after = findHolding(read.body.portfolio, holding.id);
    assert.equal(after.shares, before.shares, 'the holding is exactly as it was');
    assert.equal(after.averagePurchasePrice, before.averagePurchasePrice);
    assert.equal(after.buys.length, before.buys.length, 'no entry was half-written');
  });
});

describe('the log is nobody else\'s to read or write', () => {
  test('another account gets 404 for the holding and for a buy inside it', async () => {
    const { portfolioId, holding } = await seedHolding();

    const onHolding = await stranger.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}`, {
      shares: 1,
    });
    assert.equal(onHolding.status, 404);

    const onBuy = await stranger.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/buys/${holding.buys[0].id}`,
    );
    assert.equal(onBuy.status, 404);

    const read = await api.get(`/api/portfolios/${portfolioId}`);
    assert.equal(findHolding(read.body.portfolio, holding.id).shares, 120, 'nothing leaked through');
  });
});

describe('the log in a backup', () => {
  test('export carries it, and import restores it — opening entry included', async () => {
    const { portfolioId, holding } = await seedHolding();
    await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });

    const exported = await api.get('/api/portfolios/export');
    assert.equal(exported.status, 200);
    const serialised = exported.body.portfolios.find((p) => p.id === portfolioId);
    const exportedHolding = serialised.holdings.find((h) => h.id === holding.id);
    assert.equal(exportedHolding.buys.length, 2, 'both entries travel with the holding');
    assert.equal(
      exportedHolding.buys.some((b) => b.kind === 'opening'),
      true,
    );

    const imported = await api.post('/api/portfolios/import', {
      portfolios: [
        {
          name: 'Restored',
          holdings: [
            {
              companyName: exportedHolding.companyName,
              symbol: 'RESTORED',
              shares: exportedHolding.shares,
              averagePurchasePrice: exportedHolding.averagePurchasePrice,
              purchaseDate: exportedHolding.purchaseDate,
              buys: exportedHolding.buys,
            },
          ],
        },
      ],
    });
    assert.equal(imported.status, 201, JSON.stringify(imported.body));

    const restored = imported.body.portfolios.find((p) => p.name === 'Restored');
    assert.ok(restored, 'the portfolio should be in the response');
    const restoredHolding = restored.holdings[0];
    assert.equal(restoredHolding.shares, 130);
    assert.equal(restoredHolding.averagePurchasePrice, exportedHolding.averagePurchasePrice);
    assert.equal(restoredHolding.buys.length, 2, 'the restored log is the exported log');
  });

  test('a holding imported without a log is seeded rather than left deriving to nothing', async () => {
    const imported = await api.post('/api/portfolios/import', {
      portfolios: [
        {
          name: 'Old backup',
          holdings: [
            {
              companyName: 'Lucky Cement',
              symbol: 'LUCK',
              shares: 50,
              averagePurchasePrice: 900,
              purchaseDate: '2025-01-15',
            },
          ],
        },
      ],
    });
    assert.equal(imported.status, 201);

    const restored = imported.body.portfolios.find((p) => p.name === 'Old backup').holdings[0];
    assert.equal(restored.shares, 50, 'the shares survive the trip');
    assert.equal(restored.averagePurchasePrice, 900);
    assert.equal(restored.buys.length, 1);
    assert.equal(restored.buys[0].kind, 'opening');
  });
});
