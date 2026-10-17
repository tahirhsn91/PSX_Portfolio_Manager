import { describe, it, expect } from 'vitest';
import { replayLedger, calculateHoldingMetrics } from './calculations';
import type { Holding, StockQuote } from '@/types';

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

describe('calculateHoldingMetrics flows realized P/L into the total return', () => {
  const quote: StockQuote = {
    symbol: 'TEST',
    companyName: 'Test Co',
    currentPrice: 90,
    change: 1,
    changePercent: 1.12,
    open: null,
    high: null,
    low: null,
    previousClose: null,
    volume: null,
    marketCap: null,
    sector: 'Tech',
    lastUpdated: '2026-03-01T00:00:00.000Z',
    priceAvailable: true,
  };

  // 200 bought at a 60 average, then 100 sold at 80 → realized (80-60)*100 = 2000.
  // 100 remain, now priced at 90 → unrealized 100*(90-60) = 3000.
  const holding: Holding = {
    id: 'h1',
    portfolioId: 'p1',
    companyName: 'Test Co',
    symbol: 'TEST',
    sector: 'Tech',
    shares: 100,
    averagePurchasePrice: 60,
    purchaseDate: '2026-01-01',
    dividendsReceived: [],
    buys: [
      { id: 'b1', holdingId: 'h1', date: '2026-01-01', shares: 100, pricePerShare: 50, totalCost: 5000, kind: 'opening' },
      { id: 'b2', holdingId: 'h1', date: '2026-01-15', shares: 100, pricePerShare: 70, totalCost: 7000, kind: 'buy' },
    ],
    sells: [
      { id: 's1', holdingId: 'h1', date: '2026-02-01', shares: 100, pricePerShare: 80, fees: 0 },
    ],
  };

  it('reports realized P/L separately and inside the total return', () => {
    const m = calculateHoldingMetrics(holding, quote, 9000);
    expect(m.realizedPL).toBe(2000);
    expect(m.unrealizedPL).toBe(3000);
    expect(m.totalReturn).toBe(5000); // realized + unrealized + 0 dividends
  });

  it('keeps realized P/L even when the quote is unavailable', () => {
    const m = calculateHoldingMetrics(holding, { ...quote, priceAvailable: false }, 0);
    expect(m.realizedPL).toBe(2000);
    expect(m.priceAvailable).toBe(false);
  });
});
