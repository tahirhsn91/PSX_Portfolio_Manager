import { describe, expect, it } from 'vitest';
import type { HistoricalDataPoint } from '@/types';
import { buildPortfolioValueSeries } from './calculations';

const points = (rows: [string, number][]) =>
  rows.map(([date, close]) => ({ date, open: close, high: close, low: close, close, volume: 0 })) as HistoricalDataPoint[];

describe('buildPortfolioValueSeries', () => {
  const holdings = [{ symbol: 'EFERT', shares: 10, purchaseDate: '2026-01-02' }];
  const histories = {
    EFERT: points([
      ['2025-12-31', 100],
      ['2026-01-02', 110],
      ['2026-01-05', 121],
    ]),
  };

  it('starts at the purchase date for actual account history', () => {
    const series = buildPortfolioValueSeries(holdings, histories);

    expect(series.map((p) => p.date)).toEqual(['2026-01-02', '2026-01-05']);
    expect(series[0].close).toBe(1100);
  });

  it('prices the current basket back across the window when asked', () => {
    const series = buildPortfolioValueSeries(holdings, histories, { ignorePurchaseDates: true });

    expect(series.map((p) => p.date)).toEqual(['2025-12-31', '2026-01-02', '2026-01-05']);
    expect(series[0].close).toBe(1000);
  });
});
