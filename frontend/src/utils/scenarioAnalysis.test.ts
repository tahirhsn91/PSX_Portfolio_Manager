/**
 * Scenario analysis (issue #96) — the what-if arithmetic.
 */

import { describe, it, expect } from 'vitest';
import { scenarioAnalysis, DEFAULT_SCENARIOS } from './scenarioAnalysis';

describe('scenarioAnalysis', () => {
  it('applies a uniform percentage change to every priced holding', () => {
    const result = scenarioAnalysis(
      [{ currentValue: 1000, costBasis: 800 }],
      [0.1],
    );
    expect(result[0].marketValue).toBeCloseTo(1100);
    expect(result[0].profitLoss).toBeCloseTo(300);
  });

  it('sums across holdings and keeps cost basis separate', () => {
    const result = scenarioAnalysis(
      [
        { currentValue: 1000, costBasis: 900 },
        { currentValue: 500, costBasis: 600 },
      ],
      [-0.2],
    );
    // Value 1500 → 1200; cost 1500 → P/L −300.
    expect(result[0].marketValue).toBeCloseTo(1200);
    expect(result[0].profitLoss).toBeCloseTo(-300);
  });

  it('returns a row per requested change, in order', () => {
    const result = scenarioAnalysis([{ currentValue: 100, costBasis: 100 }], [-0.2, 0.05]);
    expect(result.map((r) => r.change)).toEqual([-0.2, 0.05]);
    expect(result[0].marketValue).toBeCloseTo(80);
    expect(result[1].marketValue).toBeCloseTo(105);
  });

  it('returns zeros when there are no priced holdings', () => {
    const result = scenarioAnalysis([], DEFAULT_SCENARIOS);
    expect(result.every((r) => r.marketValue === 0 && r.profitLoss === 0)).toBe(true);
  });
});
