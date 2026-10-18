/**
 * Personal watchlist (issue #93).
 *
 * Server-backed, keyed to the account: an add persists, a duplicate is
 * idempotent, a remove is gone for good, and one account's list never leaks
 * into another's. Only the symbol list is stored — pricing is the feed's job.
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

  // Public signup is disabled in the test env (only the bootstrap signup works),
  // so the second account is seeded directly and logged in.
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

describe('watchlist', () => {
  test('adds, lists, and persists a symbol', async () => {
    const added = await api.post('/api/watchlist', { symbol: 'ENGROH' });
    assert.equal(added.status, 201);
    assert.equal(added.body.item.symbol, 'ENGROH');

    const list = await api.get('/api/watchlist');
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].symbol, 'ENGROH');

    // A second fetch (a reload) still shows it.
    const again = await api.get('/api/watchlist');
    assert.equal(again.body.items.length, 1);
  });

  test('a duplicate add is idempotent, and the symbol is uppercased', async () => {
    await api.post('/api/watchlist', { symbol: 'luck' });
    const dup = await api.post('/api/watchlist', { symbol: 'LUCK' });
    assert.equal(dup.status, 201);

    const list = await api.get('/api/watchlist');
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].symbol, 'LUCK');
  });

  test('removes a symbol', async () => {
    await api.post('/api/watchlist', { symbol: 'ENGROH' });
    const removed = await api.call('DELETE', '/api/watchlist/ENGROH');
    assert.equal(removed.status, 204);

    const list = await api.get('/api/watchlist');
    assert.equal(list.body.items.length, 0);
  });

  test("one account's list never leaks into another's", async () => {
    await api.post('/api/watchlist', { symbol: 'ENGROH' });
    await other.post('/api/watchlist', { symbol: 'LUCK' });

    const mine = await api.get('/api/watchlist');
    const theirs = await other.get('/api/watchlist');
    assert.deepEqual(mine.body.items.map((i) => i.symbol), ['ENGROH']);
    assert.deepEqual(theirs.body.items.map((i) => i.symbol), ['LUCK']);
  });

  test('rejects a nonsensical symbol', async () => {
    const res = await api.post('/api/watchlist', { symbol: '' });
    assert.equal(res.status, 400);
    const bad = await api.post('/api/watchlist', { symbol: 'NOT A SYMBOL!' });
    assert.equal(bad.status, 400);
  });
});
