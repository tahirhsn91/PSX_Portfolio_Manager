/**
 * Corporate actions — splits, bonus shares, rights issues (issue #92).
 *
 * The invariants under test are the arithmetic the issue states: a split scales
 * quantity while leaving cost basis intact; a bonus raises quantity and lowers
 * the average so cost basis is unchanged; a rights issue adds shares at the
 * subscription price. Every action is reversible by deletion, and ownership is
 * gated exactly as for every other holding-scoped resource.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let api;
let stranger;

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

async function seedHolding({ shares = 100, price = 50 } = {}) {
  const portfolio = await api.post('/api/portfolios', { name: 'Actions', color: '#00a651' });
  const portfolioId = portfolio.body.portfolio.id;
  const holding = await api.post(`/api/portfolios/${portfolioId}/holdings`, {
    companyName: 'Example Corp',
    symbol: 'EXMPL',
    sector: 'Energy',
    shares,
    averagePurchasePrice: price,
    purchaseDate: '2026-01-05',
  });
  assert.equal(holding.status, 201);
  return { portfolioId, holding: holding.body.portfolio.holdings[0] };
}

const findHolding = (portfolio, id) => portfolio.holdings.find((h) => h.id === id);

describe('corporate actions', () => {
  test('a 2:1 split halves the average and doubles the quantity, cost basis unchanged', async () => {
    const { portfolioId, holding } = await seedHolding({ shares: 100, price: 50 });

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, {
      type: 'split',
      date: '2026-02-10',
      ratio: 2,
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 200);
    assert.equal(after.averagePurchasePrice, 25);
    assert.equal(after.shares * after.averagePurchasePrice, 5000, 'cost basis is unchanged');
  });

  test('bonus shares raise the quantity and lower the average so cost basis is unchanged', async () => {
    const { portfolioId, holding } = await seedHolding({ shares: 100, price: 40 });

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, {
      type: 'bonus',
      date: '2026-02-10',
      ratio: 0.25,
    });
    assert.equal(res.status, 201);

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 125);
    assert.equal(after.averagePurchasePrice, 32);
    assert.equal(after.shares * after.averagePurchasePrice, 4000, 'cost basis is unchanged');
  });

  test('a rights issue adds shares at the subscription price', async () => {
    const { portfolioId, holding } = await seedHolding({ shares: 100, price: 50 });

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, {
      type: 'rights',
      date: '2026-02-10',
      ratio: 0.25,
      price: 20,
    });
    assert.equal(res.status, 201);

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.shares, 125);
    assert.equal(after.averagePurchasePrice, 44); // (5000 + 25×20) / 125
  });

  test('an action can be reversed by deletion', async () => {
    const { portfolioId, holding } = await seedHolding({ shares: 100, price: 50 });
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, {
      type: 'split',
      date: '2026-02-10',
      ratio: 2,
    });
    const action = findHolding(added.body.portfolio, holding.id).corporateActions[0];

    const removed = await api.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions/${action.id}`,
    );
    assert.equal(removed.status, 200);

    const after = findHolding(removed.body.portfolio, holding.id);
    assert.equal(after.shares, 100);
    assert.equal(after.averagePurchasePrice, 50);
  });

  test('a stranger gets 404', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, {
      type: 'split',
      date: '2026-02-10',
      ratio: 2,
    });
    const action = findHolding(added.body.portfolio, holding.id).corporateActions[0];

    const res = await stranger.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions/${action.id}`,
    );
    assert.equal(res.status, 404);
  });

  test('rejects a nonsensical action', async () => {
    const { portfolioId, holding } = await seedHolding();
    for (const body of [
      { type: 'dividend', date: '2026-02-10', ratio: 2 },
      { type: 'split', date: '2026-02-30', ratio: 2 },
      { type: 'split', date: '2026-02-10', ratio: 0 },
      { type: 'rights', date: '2026-02-10', ratio: 0.25 },
    ]) {
      const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/corporate-actions`, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} should be refused`);
    }
  });
});
