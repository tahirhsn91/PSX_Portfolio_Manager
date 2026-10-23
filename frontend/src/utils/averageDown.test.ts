import { describe, expect, it } from 'vitest';
import {
  averageAfterBuy,
  averageCurve,
  clampFeePercent,
  costForShares,
  planAverage,
  sharesForBudget,
  whatIfScenarios,
  type AverageDownInput,
} from './averageDown';

const base: AverageDownInput = {
  shares: 15,
  averagePrice: 132.49,
  marketPrice: 121.29,
  target: 122,
  direction: 'down',
};

describe('planAverage', () => {
  it('solves the acceptance case: 222 shares, 26,926.38, new average 122.00', () => {
    const plan = planAverage(base);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.sharesExact).toBeCloseTo(221.6197, 3);
    expect(plan.sharesToBuy).toBe(222);
    expect(plan.sharesForTarget).toBe(222);
    expect(plan.grossCost).toBeCloseTo(26926.38, 2);
    expect(plan.fees).toBe(0);
    expect(plan.cashRequired).toBeCloseTo(26926.38, 2);
    expect(plan.totalShares).toBe(237);
    expect(plan.newAverage).toBeCloseTo(121.9989, 3);
    expect(Math.round(plan.newAverage * 100) / 100).toBe(122);
    expect(plan.newInvested).toBeCloseTo(28913.73, 2);
    expect(plan.averageReduction).toBeCloseTo(10.4911, 3);
    expect(plan.averageReductionPercent).toBeCloseTo(7.9184, 3);
    expect(plan.budgetCapped).toBe(false);
  });

  it('rounds the share count up, never down', () => {
    const plan = planAverage({ ...base, averagePrice: 130, target: 129, marketPrice: 121.29 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sharesExact).toBeGreaterThan(1);
    expect(plan.sharesToBuy).toBe(Math.ceil(plan.sharesExact - 1e-9));
  });

  it('rejects a target at or below the market price with the brief message', () => {
    const plan = planAverage({ ...base, target: 121.29 });
    expect(plan).toEqual({
      ok: false,
      reason: 'target-above-price',
      message:
        'Target average must be higher than the current market price. It is impossible to reach it by buying at this price.',
    });
  });

  it('rejects a target at or above the current average with the brief message', () => {
    const plan = planAverage({ ...base, target: 132.49 });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe('already-at-target');
    expect(plan.message).toBe('You are already at this average.');

    const higher = planAverage({ ...base, target: 135 });
    expect(higher.ok).toBe(false);
    if (higher.ok) return;
    expect(higher.message).toBe('Target must be lower than your current average.');
  });

  it('averages up when asked, with the mirrored validation', () => {
    const up = planAverage({
      shares: 100,
      averagePrice: 100,
      marketPrice: 120,
      target: 110,
      direction: 'up',
    });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.direction).toBe('up');
    expect(up.sharesToBuy).toBe(100);
    expect(up.newAverage).toBeCloseTo(110, 6);

    const tooLow = planAverage({
      shares: 100,
      averagePrice: 100,
      marketPrice: 120,
      target: 95,
      direction: 'up',
    });
    expect(tooLow.ok).toBe(false);
    if (tooLow.ok) return;
    expect(tooLow.message).toBe('Target must be higher than your current average.');
  });

  it('capitalises fees so the target still holds after charges', () => {
    const plan = planAverage({ ...base, feePercent: 0.15 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.sharesToBuy).toBe(298);
    expect(plan.grossCost).toBeCloseTo(36144.42, 2);
    expect(plan.fees).toBeCloseTo(54.22, 2);
    expect(plan.cashRequired).toBeCloseTo(36198.64, 2);
    expect(plan.newAverage).toBeCloseTo(122, 2);
  });

  it('caps the purchase at the budget and reports the best average it can buy', () => {
    const plan = planAverage({ ...base, budget: 10000 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.budgetCapped).toBe(true);
    expect(plan.sharesForTarget).toBe(222);
    expect(plan.sharesToBuy).toBe(82);
    expect(plan.cashRequired).toBeCloseTo(9945.78, 2);
    expect(plan.achievableAverage).toBeCloseTo(123.022, 3);
    expect(plan.targetGap).toBeCloseTo(1.022, 3);
    expect(plan.newAverage).toBeCloseTo(123.022, 3);
  });

  it('does not cap when the budget covers the purchase', () => {
    const plan = planAverage({ ...base, budget: 50000 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.budgetCapped).toBe(false);
    expect(plan.sharesToBuy).toBe(222);
    expect(plan.achievableAverage).toBeNull();
  });

  it('handles empty, zero and non-finite input without NaN', () => {
    expect(planAverage({ ...base, shares: 0 })).toMatchObject({ ok: false, reason: 'no-holding' });
    expect(planAverage({ ...base, target: 0 })).toMatchObject({ ok: false, reason: 'invalid-input' });
    expect(planAverage({ ...base, marketPrice: Number.NaN })).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
    expect(planAverage({ ...base, target: Number.POSITIVE_INFINITY })).toMatchObject({
      ok: false,
      reason: 'invalid-input',
    });
  });

  it('accepts two-decimal prices', () => {
    const plan = planAverage({ ...base, marketPrice: 121.3, target: 121.99 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(Number.isInteger(plan.sharesToBuy)).toBe(true);
    expect(plan.newAverage).toBeLessThanOrEqual(121.99 + 1e-9);
  });

  it('clamps silly fee percentages', () => {
    expect(clampFeePercent(-1)).toBe(0);
    expect(clampFeePercent(0.15)).toBe(0.15);
    expect(clampFeePercent(50)).toBe(10);
  });
});

describe('whatIfScenarios', () => {
  it('dedupes and sorts, and marks which rows reach the target', () => {
    const rows = whatIfScenarios(base, [200, 50, 100, 50, 222]);
    expect(rows.map((r) => r.shares)).toEqual([50, 100, 200, 222]);
    expect(rows[0].newAverage).toBeGreaterThan(rows.at(-1)!.newAverage);
    expect(rows.at(-1)!.reachesTarget).toBe(true);
    expect(rows[0].reachesTarget).toBe(false);
    expect(rows.at(-1)!.newAverage).toBeCloseTo(122, 2);
  });
});

describe('averageCurve', () => {
  it('starts at the current average and approaches the market price', () => {
    const points = averageCurve(base, 444, 8);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual({ shares: 0, average: 132.49 });
    expect(points.at(-1)!.average).toBeLessThan(points[0].average);
    expect(points.at(-1)!.average).toBeGreaterThan(121.29);
  });

  it('returns nothing for a non-positive span', () => {
    expect(averageCurve(base, 0)).toEqual([]);
  });
});

describe('averageAfterBuy', () => {
  it('blends fees into the new average', () => {
    expect(averageAfterBuy(15, 132.49, 121.29, 222)).toBeCloseTo(121.9989, 3);
    expect(averageAfterBuy(15, 132.49, 121.29, 222, 0.15)).toBeCloseTo(122.169, 3);
    expect(averageAfterBuy(15, 132.49, 121.29, 0)).toBe(132.49);
  });
});

describe('sharesForBudget', () => {
  it('buys whole shares and reports the change from PKR 1,000', () => {
    const plan = sharesForBudget({ budget: 1000, marketPrice: 121.29 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.shares).toBe(8);
    expect(plan.grossCost).toBeCloseTo(970.32, 2);
    expect(plan.fees).toBe(0);
    expect(plan.totalCost).toBeCloseTo(970.32, 2);
    expect(plan.remaining).toBeCloseTo(29.68, 2);
    expect(plan.shortfall).toBeNull();
  });

  it('never rounds up: 10 shares exactly consumes the budget', () => {
    const plan = sharesForBudget({ budget: 1212.9, marketPrice: 121.29 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.shares).toBe(10);
    expect(plan.remaining).toBeCloseTo(0, 2);
  });

  it('reports the shortfall when the budget buys no share', () => {
    const plan = sharesForBudget({ budget: 100, marketPrice: 121.29 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.shares).toBe(0);
    expect(plan.remaining).toBe(100);
    expect(plan.shortfall).toBeCloseTo(21.29, 2);
  });

  it('charges fees inside the budget, not on top of it', () => {
    const plan = sharesForBudget({ budget: 1000, marketPrice: 121.29, feePercent: 0.15 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.shares).toBe(8);
    expect(plan.fees).toBeCloseTo(1.46, 2);
    expect(plan.totalCost).toBeCloseTo(971.78, 2);
    expect(plan.remaining).toBeCloseTo(28.22, 2);
  });

  it('rejects zero and non-finite input', () => {
    expect(sharesForBudget({ budget: 0, marketPrice: 121.29 })).toMatchObject({ ok: false });
    expect(sharesForBudget({ budget: 1000, marketPrice: 0 })).toMatchObject({ ok: false });
    expect(sharesForBudget({ budget: Number.NaN, marketPrice: 121.29 })).toMatchObject({
      ok: false,
    });
  });
});

describe('costForShares', () => {
  it('prices 300 shares at the market price', () => {
    const cost = costForShares({ shares: 300, marketPrice: 121.29 });
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.shares).toBe(300);
    expect(cost.grossCost).toBeCloseTo(36387, 2);
    expect(cost.fees).toBe(0);
    expect(cost.totalCost).toBeCloseTo(36387, 2);
  });

  it('adds charges on top of the share cost', () => {
    const cost = costForShares({ shares: 300, marketPrice: 121.29, feePercent: 0.15 });
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.fees).toBeCloseTo(54.58, 2);
    expect(cost.totalCost).toBeCloseTo(36441.58, 2);
  });

  it('floors a fractional quantity to whole shares', () => {
    const cost = costForShares({ shares: 300.9, marketPrice: 121.29 });
    expect(cost.ok).toBe(true);
    if (!cost.ok) return;
    expect(cost.shares).toBe(300);
  });

  it('rejects zero, negative and non-finite input', () => {
    expect(costForShares({ shares: 0, marketPrice: 121.29 })).toMatchObject({ ok: false });
    expect(costForShares({ shares: -5, marketPrice: 121.29 })).toMatchObject({ ok: false });
    expect(costForShares({ shares: 300, marketPrice: 0 })).toMatchObject({ ok: false });
    expect(costForShares({ shares: Number.NaN, marketPrice: 121.29 })).toMatchObject({ ok: false });
    expect(costForShares({ shares: 0.4, marketPrice: 121.29 })).toMatchObject({ ok: false });
  });
});
