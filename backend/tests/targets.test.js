/**
 * Target allocation & concentration alerts (issue #97).
 *
 * Targets are per-portfolio, user-defined, and replaced atomically. Holding
 * symbols are uppercased; the concentration threshold is a per-portfolio
 * number validated to 0–100.
 */

'use strict';

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTestDatabase, startServer, clientFor } = require('./support/harness');

let server;
let api;
let other;

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
  await api.post('/api/auth/signup', { email: 'a@example.com', password: 'password123', displayName: 'a@example.com' });

  other = await clientFor(server.baseUrl);
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('password123', 4);
  await query(`INSERT INTO users (email, password_hash, display_name, role) VALUES ($1, $2, $3, 'user')`, [
    'b@example.com',
    hash,
    'b@example.com',
  ]);
  await other.post('/api/auth/login', { email: 'b@example.com', password: 'password123' });
});

async function createPortfolio(client) {
  const res = await client.post('/api/portfolios', { name: 'Test', color: '#00a651' });
  return res.body.portfolio;
}

describe('target allocation', () => {
  test('starts empty with the default threshold, then persists targets', async () => {
    const portfolio = await createPortfolio(api);
    assert.equal(portfolio.concentrationThreshold, 25);

    const initial = await api.get(`/api/portfolios/${portfolio.id}/targets`);
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body.targets, []);
    assert.equal(initial.body.concentrationThreshold, 25);

    const put = await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [
        { scope: 'holding', key: 'engroh', targetPercent: 30 },
        { scope: 'sector', key: 'Energy', targetPercent: 40 },
      ],
      concentrationThreshold: 15,
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.concentrationThreshold, 15);
    assert.equal(put.body.targets.length, 2);
    // holding symbol is uppercased; sector keeps its case
    assert.deepEqual(
      put.body.targets.map((t) => [t.scope, t.key, t.targetPercent]),
      [
        ['holding', 'ENGROH', 30],
        ['sector', 'Energy', 40],
      ],
    );

    // persists on a second fetch
    const again = await api.get(`/api/portfolios/${portfolio.id}/targets`);
    assert.equal(again.body.targets.length, 2);
    assert.equal(again.body.concentrationThreshold, 15);
  });

  test('replaces the whole set on PUT', async () => {
    const portfolio = await createPortfolio(api);
    await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [
        { scope: 'holding', key: 'ENGROH', targetPercent: 30 },
        { scope: 'holding', key: 'LUCK', targetPercent: 20 },
      ],
    });
    await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [{ scope: 'holding', key: 'ENGROH', targetPercent: 50 }],
    });

    const list = await api.get(`/api/portfolios/${portfolio.id}/targets`);
    assert.equal(list.body.targets.length, 1);
    assert.deepEqual(list.body.targets[0], {
      id: list.body.targets[0].id,
      scope: 'holding',
      key: 'ENGROH',
      targetPercent: 50,
    });
  });

  test('rejects invalid targets and a bad threshold', async () => {
    const portfolio = await createPortfolio(api);

    const badScope = await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [{ scope: 'nope', key: 'ENGROH', targetPercent: 30 }],
    });
    assert.equal(badScope.status, 400);

    const badPercent = await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [{ scope: 'holding', key: 'ENGROH', targetPercent: 150 }],
    });
    assert.equal(badPercent.status, 400);

    const duplicate = await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [
        { scope: 'holding', key: 'ENGROH', targetPercent: 30 },
        { scope: 'holding', key: 'engroh', targetPercent: 20 },
      ],
    });
    assert.equal(duplicate.status, 400);

    const badThreshold = await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [],
      concentrationThreshold: 120,
    });
    assert.equal(badThreshold.status, 400);
  });

  test("one account's portfolio targets are invisible to another account", async () => {
    const portfolio = await createPortfolio(api);
    await api.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [{ scope: 'holding', key: 'ENGROH', targetPercent: 30 }],
    });

    const theirs = await other.get(`/api/portfolios/${portfolio.id}/targets`);
    assert.equal(theirs.status, 404);
    const theirPut = await other.call('PUT', `/api/portfolios/${portfolio.id}/targets`, {
      targets: [],
      concentrationThreshold: 10,
    });
    assert.equal(theirPut.status, 404);
  });
});
