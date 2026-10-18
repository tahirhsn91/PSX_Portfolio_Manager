/**
 * Archive portfolios (issue #98) — soft-delete with recovery.
 *
 * Archiving sets `archived_at` without losing data; restore clears it; hard
 * delete still removes the row. Ownership is enforced on every action.
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

describe('archive', () => {
  test('archive sets archivedAt and keeps the data; restore clears it', async () => {
    const portfolio = await createPortfolio(api);
    assert.equal(portfolio.archivedAt, null);

    const archived = await api.post(`/api/portfolios/${portfolio.id}/archive`);
    assert.equal(archived.status, 200);
    assert.ok(archived.body.portfolio.archivedAt);
    // the portfolio is still present in the list, just flagged
    const list = await api.get('/api/portfolios');
    const listed = list.body.portfolios.find((p) => p.id === portfolio.id);
    assert.ok(listed);
    assert.ok(listed.archivedAt);

    const restored = await api.post(`/api/portfolios/${portfolio.id}/restore`);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.portfolio.archivedAt, null);
  });

  test('hard delete still removes the portfolio outright', async () => {
    const portfolio = await createPortfolio(api);
    await api.post(`/api/portfolios/${portfolio.id}/archive`);

    const removed = await api.call('DELETE', `/api/portfolios/${portfolio.id}`);
    assert.equal(removed.status, 200);

    const list = await api.get('/api/portfolios');
    assert.equal(list.body.portfolios.some((p) => p.id === portfolio.id), false);
  });

  test("another account cannot archive or restore a portfolio it does not own", async () => {
    const portfolio = await createPortfolio(api);

    const theirArchive = await other.post(`/api/portfolios/${portfolio.id}/archive`);
    assert.equal(theirArchive.status, 404);
    const theirRestore = await other.post(`/api/portfolios/${portfolio.id}/restore`);
    assert.equal(theirRestore.status, 404);
  });
});
