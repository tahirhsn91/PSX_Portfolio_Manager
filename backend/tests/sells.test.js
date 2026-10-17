/**
 * The sell log and cash ledger, end to end (issue #90).
 *
 * Sells are the second half of a holding's ledger. The same rule as the buy log
 * applies: the log is the source of truth, the stored totals are derived, and a
 * sale that would leave the ledger short is refused — never half-applied.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let api;
let stranger;

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
  await api.post('/api/auth/signup', {
    email: 'owner@example.com',
    password: 'password123',
    displayName: 'owner@example.com',
  });

  stranger = await clientFor(server.baseUrl);
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 4);
  await query(`INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user')`, [
    'stranger@example.com',
    hash,
    'stranger@example.com',
  ]);
  await stranger.post('/api/auth/login', { email: 'stranger@example.com', password: 'password123' });
});

/** A portfolio with one holding at 120 @ 275.50. */
async function seedHolding(overrides = {}) {
  const portfolio = await api.post('/api/portfolios', { name: 'Sells', color: '#00a651' });
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

describe('logging a sale', () => {
  test('re-derives the position and keeps the weighted-average cost', async () => {
    const { portfolioId, holding } = await seedHolding();
    await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-04-01',
      shares: 10,
      pricePerShare: 100,
    });

    // 130 @ 262.00 (weighted) → sell 30 @ 300.00: 100 remain at the same 262.00 mean.
    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 30,
      pricePerShare: 300,
      fees: 150,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 100, 'shares are buys minus sells');
    assert.equal(after.averagePurchasePrice, roundMoney(262), 'the remaining mean is unchanged by a sale');
    assert.equal(after.sells.length, 1);
    assert.equal(after.sells[0].shares, 30);
    assert.equal(after.sells[0].pricePerShare, 300);
    assert.equal(after.sells[0].fees, 150);
    assert.equal(after.sells[0].date, '2026-04-10');
    assert.equal(after.buys.length, 2, 'the buy log is untouched by a sale');
  });

  test('a sale exceeding the shares owned at its date is refused with 409', async () => {
    const { portfolioId, holding } = await seedHolding();

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 150,
      pricePerShare: 300,
    });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'LOG_CONFLICT');

    const read = await api.get(`/api/portfolios/${portfolioId}`);
    const after = findHolding(read.body.portfolio, holding.id);
    assert.equal(after.shares, 120, 'nothing changed');
    assert.equal(after.sells.length, 0, 'no sale was half-written');
  });

  test('a backdated sale cannot go short either', async () => {
    const { portfolioId, holding } = await seedHolding();
    // Buy 50 today, then backdate a 30-share sale to before the position existed.
    await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/buys`, {
      date: '2026-05-01',
      shares: 50,
      pricePerShare: 100,
    });

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2025-01-01',
      shares: 30,
      pricePerShare: 100,
    });
    assert.equal(res.status, 409, 'a sale dated before any shares existed is refused');
  });

  test('rejects a nonsensical entry without touching the holding', async () => {
    const { portfolioId, holding } = await seedHolding();

    for (const body of [
      { date: '2026-04-10', shares: 0, pricePerShare: 100 },
      { date: '2026-04-10', shares: -5, pricePerShare: 100 },
      { date: 'not-a-date', shares: 5, pricePerShare: 100 },
      { date: '2026-04-10', shares: 5, pricePerShare: -1 },
      { date: '2026-04-10', shares: 5, pricePerShare: 100, fees: -1 },
    ]) {
      const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} should be refused`);
    }

    const read = await api.get(`/api/portfolios/${portfolioId}`);
    assert.equal(findHolding(read.body.portfolio, holding.id).sells.length, 0);
  });
});

describe('correcting and removing a sale', () => {
  test('correcting one sale re-derives the position', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 20,
      pricePerShare: 300,
    });
    const sell = findHolding(added.body.portfolio, holding.id).sells[0];

    const res = await api.patch(
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/sells/${sell.id}`,
      { date: '2026-04-11', shares: 40, pricePerShare: 310, fees: 10 },
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 80, '120 - 40');
    assert.equal(after.sells.length, 1, 'correcting does not duplicate');
    assert.equal(after.sells[0].shares, 40);
    assert.equal(after.sells[0].pricePerShare, 310);
    assert.equal(after.sells[0].fees, 10);
  });

  test('removing a sale restores the position', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 20,
      pricePerShare: 300,
    });
    const sell = findHolding(added.body.portfolio, holding.id).sells[0];

    const res = await api.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/sells/${sell.id}`,
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 120);
    assert.equal(after.sells.length, 0);
  });
});

describe('selling out of a position', () => {
  test('selling the whole position leaves zero shares and keeps the position', async () => {
    const { portfolioId, holding } = await seedHolding();

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 120,
      pricePerShare: 300,
    });
    assert.equal(res.status, 201);

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 0, 'the position is flat');
    assert.equal(after.sells.length, 1);
  });

  test('a holding with sales refuses a direct position edit but allows metadata', async () => {
    const { portfolioId, holding } = await seedHolding();
    await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 20,
      pricePerShare: 300,
    });

    const edit = await api.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}`, {
      shares: 90,
      averagePurchasePrice: 250,
    });
    assert.equal(edit.status, 409, 'position edits must go through the ledger when sales exist');
    assert.equal(edit.body.error.code, 'LOG_CONFLICT');

    const rename = await api.patch(`/api/portfolios/${portfolioId}/holdings/${holding.id}`, {
      companyName: 'Engro Corp',
    });
    assert.equal(rename.status, 200, 'metadata edits are still allowed');
    assert.equal(findHolding(rename.body.portfolio, holding.id).companyName, 'Engro Corp');
  });
});

describe('cash transactions', () => {
  test('deposit and withdrawal are logged and list back', async () => {
    const { portfolioId } = await seedHolding();

    const deposit = await api.post(`/api/portfolios/${portfolioId}/cash`, {
      date: '2026-01-01',
      type: 'deposit',
      amount: 100000,
      notes: 'opening balance',
    });
    assert.equal(deposit.status, 201, JSON.stringify(deposit.body));
    assert.equal(deposit.body.portfolio.cashTransactions.length, 1);

    const withdrawal = await api.post(`/api/portfolios/${portfolioId}/cash`, {
      date: '2026-02-01',
      type: 'withdrawal',
      amount: 25000,
    });
    assert.equal(withdrawal.status, 201);
    const cash = withdrawal.body.portfolio.cashTransactions;
    assert.equal(cash.length, 2);
    assert.equal(cash.some((c) => c.type === 'deposit' && c.amount === 100000), true);
    assert.equal(cash.some((c) => c.type === 'withdrawal' && c.amount === 25000), true);
  });

  test('removing a cash entry removes only that entry', async () => {
    const { portfolioId } = await seedHolding();
    await api.post(`/api/portfolios/${portfolioId}/cash`, { date: '2026-01-01', type: 'deposit', amount: 1000 });
    const added = await api.post(`/api/portfolios/${portfolioId}/cash`, { date: '2026-01-02', type: 'deposit', amount: 2000 });
    const cashId = added.body.portfolio.cashTransactions.find((c) => c.amount === 2000).id;

    const res = await api.call('DELETE', `/api/portfolios/${portfolioId}/cash/${cashId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.portfolio.cashTransactions.length, 1);
    assert.equal(res.body.portfolio.cashTransactions[0].amount, 1000);
  });

  test('rejects a malformed cash entry', async () => {
    const { portfolioId } = await seedHolding();
    for (const body of [
      { date: '2026-01-01', type: 'transfer', amount: 100 },
      { date: '2026-01-01', type: 'deposit', amount: -5 },
      { date: 'not-a-date', type: 'deposit', amount: 100 },
    ]) {
      const res = await api.post(`/api/portfolios/${portfolioId}/cash`, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} should be refused`);
    }
  });
});

describe('nobody else can touch the ledger', () => {
  test('a stranger gets 404 for sells and cash', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/sells`, {
      date: '2026-04-10',
      shares: 10,
      pricePerShare: 300,
    });
    const sell = findHolding(added.body.portfolio, holding.id).sells[0];

    const onSell = await stranger.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/sells/${sell.id}`,
    );
    assert.equal(onSell.status, 404);

    const onCash = await stranger.post(`/api/portfolios/${portfolioId}/cash`, {
      date: '2026-01-01',
      type: 'deposit',
      amount: 1,
    });
    assert.equal(onCash.status, 404);
  });
});
