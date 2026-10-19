/**
 * Pins how "Where your money is" divides the pie.
 *
 * The regression this guards: the split used to be the COUNT of holdings per
 * sector, so five small positions outweighed one large one. The percentage is a
 * share of money, so it has to be weighted by value.
 */

import { describe, expect, it } from 'vitest';
import { allocationBySector } from './allocation';
import type { Holding, HoldingMetrics } from '@/types';

const holding = (
  over: Pick<Holding, 'id' | 'sector' | 'shares' | 'averagePurchasePrice'> & { symbol?: string },
): Holding => ({
  id: over.id,
  portfolioId: 'p1',
  companyName: over.symbol ?? 'Company',
  symbol: over.symbol ?? 'X',
  sector: over.sector,
  shares: over.shares,
  averagePurchasePrice: over.averagePurchasePrice,
  purchaseDate: '2026-01-01',
  dividendsReceived: [],
  buys: [],
});

const metric = (over: Partial<HoldingMetrics> & Pick<HoldingMetrics, 'holdingId'>): HoldingMetrics => ({
  priceAvailable: true,
  currentPrice: 0,
  currentValue: 0,
  costBasis: 0,
  realizedPL: 0,
  unrealizedPL: 0,
  unrealizedPLPercent: 0,
  todayChange: 0,
  todayChangePercent: 0,
  todayPL: 0,
  totalDividendIncome: 0,
  totalReturn: 0,
  totalReturnPercent: 0,
  weightInPortfolio: 0,
  ...over,
});

describe('allocationBySector', () => {
  it('weights by money, not by the number of holdings', () => {
    const holdings = [
      ...Array.from({ length: 5 }, (_, i) =>
        holding({ id: `f${i}`, sector: 'Fertilizer', shares: 1, averagePurchasePrice: 1_000 }),
      ),
      holding({ id: 'cement', sector: 'Cement', shares: 1, averagePurchasePrice: 20_000 }),
    ];

    const result = allocationBySector(holdings, []);

    // 5 × 1,000 = 5,000 Fertilizer vs 20,000 Cement → 20% / 80%.
    expect(result.map((row) => row.name)).toEqual(['Cement', 'Fertilizer']);
    expect(result[0].percent).toBeCloseTo(80, 5);
    expect(result[1].percent).toBeCloseTo(20, 5);
    expect(result[0].value).toBe(20_000);
  });

  it('uses the priced current value when the feed has a price', () => {
    const result = allocationBySector(
      [holding({ id: 'h1', sector: 'Cement', shares: 10, averagePurchasePrice: 100 })],
      [metric({ holdingId: 'h1', priceAvailable: true, currentValue: 1_500, costBasis: 1_000 })],
    );

    expect(result[0].value).toBe(1_500);
  });

  it('falls back to cost basis when the feed cannot price a holding', () => {
    const result = allocationBySector(
      [holding({ id: 'h1', sector: 'Cement', shares: 10, averagePurchasePrice: 100 })],
      [metric({ holdingId: 'h1', priceAvailable: false, currentValue: 0, costBasis: 1_000 })],
    );

    expect(result[0].value).toBe(1_000);
  });

  it('falls back to shares × average price before the metrics arrive', () => {
    const result = allocationBySector(
      [holding({ id: 'h1', sector: 'Cement', shares: 12, averagePurchasePrice: 250 })],
      [],
    );

    expect(result[0].value).toBe(3_000);
  });

  it('sums percentages to 100 and sorts the largest sector first', () => {
    const holdings = [
      holding({ id: 'a', sector: 'A', shares: 1, averagePurchasePrice: 100 }),
      holding({ id: 'b', sector: 'B', shares: 1, averagePurchasePrice: 300 }),
      holding({ id: 'c', sector: 'C', shares: 1, averagePurchasePrice: 600 }),
    ];

    const result = allocationBySector(holdings, []);

    expect(result.map((row) => row.name)).toEqual(['C', 'B', 'A']);
    expect(result.reduce((sum, row) => sum + row.percent, 0)).toBeCloseTo(100, 5);
  });

  it('drops a position worth nothing', () => {
    const result = allocationBySector(
      [
        holding({ id: 'a', sector: 'Cement', shares: 1, averagePurchasePrice: 0 }),
        holding({ id: 'b', sector: 'Fertilizer', shares: 1, averagePurchasePrice: 100 }),
      ],
      [],
    );

    expect(result.map((row) => row.name)).toEqual(['Fertilizer']);
  });
});
