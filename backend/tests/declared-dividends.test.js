/**
 * Declared (upcoming) dividends, end to end (issue #91).
 *
 * The scraper feed publishes no declared-dividend calendar, so these are
 * user-entered rows with optional dates. The invariants under test: a declared
 * dividend is never a received one, missing dates stay missing, and ownership
 * is enforced exactly as for every other holding-scoped resource.
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

async function seedHolding() {
  const portfolio = await api.post('/api/portfolios', { name: 'Dividends', color: '#00a651' });
  assert.equal(portfolio.status, 201);
  const portfolioId = portfolio.body.portfolio.id;
  const holding = await api.post(`/api/portfolios/${portfolioId}/holdings`, {
    companyName: 'Engro Holdings',
    symbol: 'ENGROH',
    sector: 'Fertilizer',
    shares: 120,
    averagePurchasePrice: 275.5,
    purchaseDate: '2026-03-04',
  });
  assert.equal(holding.status, 201);
  return { portfolioId, holding: holding.body.portfolio.holdings[0] };
}

const findHolding = (portfolio, id) => portfolio.holdings.find((h) => h.id === id);

describe('declared dividends', () => {
  test('are logged, carried on the holding, and missing dates stay missing', async () => {
    const { portfolioId, holding } = await seedHolding();

    const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends`, {
      amountPerShare: 12.5,
      exDividendDate: '2026-04-10',
      paymentDate: '2026-04-25',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const after = findHolding(res.body.portfolio, holding.id);
    assert.equal(after.declaredDividends.length, 1);
    const d = after.declaredDividends[0];
    assert.equal(d.amountPerShare, 12.5);
    assert.equal(d.exDividendDate, '2026-04-10');
    assert.equal(d.paymentDate, '2026-04-25');
    assert.equal(d.announcementDate, undefined, 'an absent date stays absent');
    assert.equal(d.bookClosureDate, undefined);
    assert.equal(after.dividendsReceived.length, 0, 'a declared dividend is not a received one');
  });

  test('rejects a nonsensical entry', async () => {
    const { portfolioId, holding } = await seedHolding();
    for (const body of [
      { amountPerShare: -1 },
      { amountPerShare: 5, exDividendDate: 'not-a-date' },
      { amountPerShare: 5, paymentDate: '2026-13-40' },
    ]) {
      const res = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends`, body);
      assert.equal(res.status, 400, `${JSON.stringify(body)} should be refused`);
    }
  });

  test('can be corrected and removed', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends`, {
      amountPerShare: 10,
      paymentDate: '2026-04-25',
    });
    const dividend = findHolding(added.body.portfolio, holding.id).declaredDividends[0];

    const patched = await api.patch(
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends/${dividend.id}`,
      { amountPerShare: 15, bookClosureDate: '2026-04-15', paymentDate: '2026-05-01' },
    );
    assert.equal(patched.status, 200);
    const updated = findHolding(patched.body.portfolio, holding.id).declaredDividends[0];
    assert.equal(updated.amountPerShare, 15);
    assert.equal(updated.bookClosureDate, '2026-04-15');
    assert.equal(updated.paymentDate, '2026-05-01');

    const removed = await api.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends/${dividend.id}`,
    );
    assert.equal(removed.status, 200);
    assert.equal(findHolding(removed.body.portfolio, holding.id).declaredDividends.length, 0);
  });

  test('a stranger gets 404', async () => {
    const { portfolioId, holding } = await seedHolding();
    const added = await api.post(`/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends`, {
      amountPerShare: 10,
    });
    const dividend = findHolding(added.body.portfolio, holding.id).declaredDividends[0];

    const res = await stranger.call(
      'DELETE',
      `/api/portfolios/${portfolioId}/holdings/${holding.id}/declared-dividends/${dividend.id}`,
    );
    assert.equal(res.status, 404);
  });
});
