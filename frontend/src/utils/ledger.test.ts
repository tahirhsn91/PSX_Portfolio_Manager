import { describe, it, expect } from 'vitest';
import { replayLedger } from './calculations';

describe('replayLedger (weighted-average perpetual)', () => {
  it('a buy-only ledger holds its position with zero realized P/L', () => {
    const pos = replayLedger([{ date: '2026-01-01', shares: 100, pricePerShare: 50 }], []);
    expect(pos.shares).toBe(100);
    expect(pos.averagePurchasePrice).toBe(50);
    expect(pos.totalCostBasis).toBe(5000);
    expect(pos.realizedPL).toBe(0);
    expect(pos.totalFees).toBe(0);
  });

  it('a full sale realizes (sale - average) x quantity', () => {
    const pos = replayLedger(
      [{ date: '2026-01-01', shares: 100, pricePerShare: 50 }],
      [{ date: '2026-02-01', shares: 100, pricePerShare: 60, fees: 0 }]
    );
    expect(pos.shares).toBe(0);
    expect(pos.averagePurchasePrice).toBe(0);
    expect(pos.totalCostBasis).toBe(0);
    expect(pos.realizedPL).toBe(1000);
  });

  it('a partial sale keeps the remaining position at the same weighted average', () => {
    const pos = replayLedger(
      [
        { date: '2026-01-01', shares: 100, pricePerShare: 50 },
        { date: '2026-01-15', shares: 100, pricePerShare: 70 },
      ],
      [{ date: '2026-02-01', shares: 100, pricePerShare: 80, fees: 0 }]
    );
    // average after two buys = (100*50 + 100*70) / 200 = 60
    expect(pos.shares).toBe(100);
    expect(pos.averagePurchasePrice).toBe(60);
    expect(pos.totalCostBasis).toBe(6000);
    expect(pos.realizedPL).toBe(2000); // (80 - 60) * 100
  });

  it('fees reduce realized P/L and are not double-counted', () => {
    const pos = replayLedger(
      [{ date: '2026-01-01', shares: 100, pricePerShare: 50 }],
      [{ date: '2026-02-01', shares: 50, pricePerShare: 60, fees: 100 }]
    );
    expect(pos.shares).toBe(50);
    expect(pos.averagePurchasePrice).toBe(50);
    expect(pos.realizedPL).toBe(400); // (60 - 50) * 50 - 100
    expect(pos.totalFees).toBe(100);
  });

  it('replays chronologically: a sale uses the average at its own date', () => {
    const pos = replayLedger(
      [
        { date: '2026-01-01', shares: 100, pricePerShare: 50 },
        { date: '2026-03-01', shares: 100, pricePerShare: 70 },
      ],
      [{ date: '2026-02-01', shares: 50, pricePerShare: 60, fees: 0 }]
    );
    // Feb sale: average 50 -> realized (60-50)*50 = 500, leaving 50 shares at 2500 cost.
    // Mar buy: 100 @ 70 -> 150 shares at 9500 cost, average 63.33.
    expect(pos.shares).toBe(150);
    expect(pos.realizedPL).toBe(500);
    expect(pos.averagePurchasePrice).toBe(63.33);
  });

  it('clamps a sell larger than the shares owned (the server rejects it first)', () => {
    const pos = replayLedger(
      [{ date: '2026-01-01', shares: 100, pricePerShare: 50 }],
      [{ date: '2026-02-01', shares: 150, pricePerShare: 60, fees: 0 }]
    );
    expect(pos.shares).toBe(0);
    expect(pos.realizedPL).toBe(1000); // only the 100 owned were sold
  });
});
