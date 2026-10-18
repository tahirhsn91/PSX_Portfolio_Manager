/**
 * Price alerts (issue #94).
 *
 * Definitions only: create, list, pause (active toggle), edit, delete — keyed
 * to the account. Evaluation is client-side, so the backend never stores a
 * "triggered" state; it only records what the user asked to be told about.
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

describe('alerts', () => {
  test('creates and lists a price alert, uppercasing the symbol', async () => {
    const created = await api.post('/api/alerts', { symbol: 'engroh', kind: 'price', direction: 'above', threshold: 400 });
    assert.equal(created.status, 201);
    assert.equal(created.body.alert.symbol, 'ENGROH');
    assert.equal(created.body.alert.kind, 'price');
    assert.equal(created.body.alert.active, true);

    const list = await api.get('/api/alerts');
    assert.equal(list.status, 200);
    assert.equal(list.body.alerts.length, 1);
    assert.equal(list.body.alerts[0].threshold, 400);
  });

  test('rejects an invalid kind, direction, and threshold', async () => {
    const badKind = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'nonsense', direction: 'above', threshold: 1 });
    assert.equal(badKind.status, 400);

    const badDirection = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'sideways', threshold: 1 });
    assert.equal(badDirection.status, 400);

    const badThreshold = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'above', threshold: 0 });
    assert.equal(badThreshold.status, 400);

    const badSymbol = await api.post('/api/alerts', { symbol: '', kind: 'price', direction: 'above', threshold: 1 });
    assert.equal(badSymbol.status, 400);
  });

  test('pauses and edits an alert via PATCH', async () => {
    const created = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'above', threshold: 400 });
    const id = created.body.alert.id;

    const paused = await api.patch(`/api/alerts/${id}`, { active: false });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.alert.active, false);

    const moved = await api.patch(`/api/alerts/${id}`, { threshold: 500, direction: 'below' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.alert.threshold, 500);
    assert.equal(moved.body.alert.direction, 'below');
    // active stays untouched when not provided
    assert.equal(moved.body.alert.active, false);
  });

  test('deletes an alert', async () => {
    const created = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'above', threshold: 400 });
    const removed = await api.call('DELETE', `/api/alerts/${created.body.alert.id}`);
    assert.equal(removed.status, 204);

    const list = await api.get('/api/alerts');
    assert.equal(list.body.alerts.length, 0);
  });

  test("one account's alerts never leak into another's", async () => {
    await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'above', threshold: 400 });
    await other.post('/api/alerts', { symbol: 'LUCK', kind: 'percent', direction: 'above', threshold: 5 });

    const mine = await api.get('/api/alerts');
    const theirs = await other.get('/api/alerts');
    assert.deepEqual(mine.body.alerts.map((a) => a.symbol), ['ENGROH']);
    assert.deepEqual(theirs.body.alerts.map((a) => a.symbol), ['LUCK']);
  });

  test('returns 404 when editing or deleting someone else\'s alert', async () => {
    const created = await api.post('/api/alerts', { symbol: 'ENGROH', kind: 'price', direction: 'above', threshold: 400 });
    const patched = await other.patch(`/api/alerts/${created.body.alert.id}`, { active: false });
    assert.equal(patched.status, 404);
    const removed = await other.call('DELETE', `/api/alerts/${created.body.alert.id}`);
    assert.equal(removed.status, 404);
  });
});
