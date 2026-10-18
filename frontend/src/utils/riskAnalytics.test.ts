/**
 * Risk analytics (issue #95) — unit tests for the pure math.
 *
 * Every metric must be historical and honest: insufficient data yields null
 * ("N/A"), never a fabricated number.
 */

import { describe, it, expect } from 'vitest';
import {
  toReturns,
  maxDrawdown,
  annualizedVolatility,
  beta,
  sharpeRatio,
  correlation,
} from './riskAnalytics';

const series = (n: number, fn: (i: number) => number) => Array.from({ length: n }, (_, i) => fn(i));

describe('toReturns', () => {
  it('computes daily simple returns', () => {
    const r = toReturns([100, 110, 99]);
    expect(r.length).toBe(2);
    expect(r[0]).toBeCloseTo(0.1);
    expect(r[1]).toBeCloseTo(-0.1);
  });

  it('skips non-positive prices (no division by zero)', () => {
    // 50→0 skipped, 0→60 skipped, 60→66 = 10%.
    const r = toReturns([50, 0, 60, 66]);
    expect(r.length).toBe(1);
    expect(r[0]).toBeCloseTo(0.1);
  });
});

describe('maxDrawdown', () => {
  it('finds the deepest peak-to-trough decline as a negative fraction', () => {
    expect(maxDrawdown([100, 120, 90, 110])).toBeCloseTo(-0.25);
  });

  it('is zero when the series never declines', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it('returns null with fewer than two prices', () => {
    expect(maxDrawdown([100])).toBeNull();
    expect(maxDrawdown([])).toBeNull();
  });
});

describe('annualizedVolatility', () => {
  it('is zero for flat returns', () => {
    expect(annualizedVolatility(series(20, () => 0.01))).toBeCloseTo(0);
  });

  it('returns null with too few samples', () => {
    expect(annualizedVolatility(series(19, (i) => 0.001 * i))).toBeNull();
  });
});

describe('beta', () => {
  it('is 1 when the stock moves exactly like the market', () => {
    const mkt = series(25, (i) => 0.01 * Math.sin(i));
    expect(beta(mkt, mkt)).toBeCloseTo(1);
  });

  it('returns null on a length mismatch or short sample', () => {
    expect(beta(series(5, () => 0.01), series(5, () => 0.01))).toBeNull();
    expect(beta(series(25, () => 0.01), series(24, () => 0.01))).toBeNull();
  });

  it('returns null when the market has no variance', () => {
    const stock = series(25, (i) => 0.01 * i);
    expect(beta(stock, series(25, () => 0.02))).toBeNull();
  });
});

describe('sharpeRatio', () => {
  it('is null for flat returns (zero volatility)', () => {
    expect(sharpeRatio(series(20, () => 0.01))).toBeNull();
  });

  it('returns null with too few samples', () => {
    expect(sharpeRatio(series(19, (i) => 0.001 * i))).toBeNull();
  });

  it('is positive when returns beat the risk-free rate', () => {
    const r = series(25, (i) => (i % 2 === 0 ? 0.01 : 0.008));
    expect(sharpeRatio(r)).toBeGreaterThan(0);
  });
});

describe('correlation', () => {
  it('is 1 for identical series and −1 for the inverse', () => {
    const a = series(25, (i) => 0.01 * i);
    expect(correlation(a, a)).toBeCloseTo(1);
    expect(correlation(a, a.map((x) => -x))).toBeCloseTo(-1);
  });

  it('returns null on a short, mismatched, or flat series', () => {
    expect(correlation(series(19, (i) => 0.01 * i), series(19, (i) => 0.01 * i))).toBeNull();
    expect(correlation(series(25, (i) => 0.01 * i), series(24, (i) => 0.01 * i))).toBeNull();
    expect(correlation(series(25, () => 0.01), series(25, () => 0.01))).toBeNull();
  });
});
