/**
 * Alert evaluation (issue #94) — the pure condition check behind useAlertEngine.
 */

import { describe, it, expect } from 'vitest';
import { isTriggered } from './useAlertEngine';
import type { Alert, StockQuote } from '@/types';

const alert = (overrides: Partial<Alert>): Alert => ({
  id: 'a1',
  symbol: 'ENGROH',
  kind: 'price',
  direction: 'above',
  threshold: 400,
  active: true,
  createdAt: '2026-10-18T00:00:00.000Z',
  ...overrides,
});

const quote = (overrides: Partial<StockQuote>): StockQuote => ({
  symbol: 'ENGROH',
  companyName: 'Engro Holdings',
  currentPrice: 395,
  change: 5,
  changePercent: 1.28,
  open: 390,
  high: 396,
  low: 389,
  previousClose: 390,
  volume: 100000,
  marketCap: null,
  sector: 'Energy',
  lastUpdated: '2026-10-18T00:00:00.000Z',
  priceAvailable: true,
  ...overrides,
});

describe('isTriggered', () => {
  it('fires a price "above" alert only at or past the level', () => {
    const a = alert({ kind: 'price', direction: 'above', threshold: 400 });
    expect(isTriggered(a, quote({ currentPrice: 399.9 }))).toBe(false);
    expect(isTriggered(a, quote({ currentPrice: 400 }))).toBe(true);
    expect(isTriggered(a, quote({ currentPrice: 401 }))).toBe(true);
  });

  it('fires a price "below" alert only at or under the level', () => {
    const a = alert({ kind: 'price', direction: 'below', threshold: 300 });
    expect(isTriggered(a, quote({ currentPrice: 301 }))).toBe(false);
    expect(isTriggered(a, quote({ currentPrice: 300 }))).toBe(true);
    expect(isTriggered(a, quote({ currentPrice: 299 }))).toBe(true);
  });

  it('fires a percent "above" alert on a move at or past the threshold', () => {
    const a = alert({ kind: 'percent', direction: 'above', threshold: 5 });
    expect(isTriggered(a, quote({ changePercent: 4.9 }))).toBe(false);
    expect(isTriggered(a, quote({ changePercent: 5 }))).toBe(true);
  });

  it('fires a percent "below" alert on a fall of at least the threshold', () => {
    const a = alert({ kind: 'percent', direction: 'below', threshold: 5 });
    expect(isTriggered(a, quote({ changePercent: -4.9 }))).toBe(false);
    expect(isTriggered(a, quote({ changePercent: -5 }))).toBe(true);
    expect(isTriggered(a, quote({ changePercent: -6 }))).toBe(true);
  });

  it('never fires on an unavailable or missing quote', () => {
    const a = alert({ kind: 'price', direction: 'above', threshold: 400 });
    expect(isTriggered(a, quote({ priceAvailable: false }))).toBe(false);
    expect(isTriggered(a, undefined)).toBe(false);
  });
});
