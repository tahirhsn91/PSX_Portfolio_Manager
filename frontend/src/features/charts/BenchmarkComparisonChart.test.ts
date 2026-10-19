import { describe, expect, it } from 'vitest';
import type { HistoricalDataPoint } from '@/types';
import { alignReturnsByDate, rangeWindow } from './BenchmarkComparisonChart';

const series = (rows: [string, number][]) =>
  rows.map(([date, close]) => ({ date, close })) as HistoricalDataPoint[];

const everySession = (from: string, count: number) => {
  const start = new Date(`${from}T00:00:00Z`);
  const rows: [string, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    rows.push([day.toISOString().slice(0, 10), 100 + i]);
  }
  return rows;
};

describe('alignReturnsByDate', () => {
  it('normalises both lines to 0% on the same first session', () => {
    const result = alignReturnsByDate(
      series([
        ['2026-01-05', 100],
        ['2026-01-06', 110],
      ]),
      series([
        ['2026-01-05', 200],
        ['2026-01-06', 210],
      ]),
    );

    expect(result.sessions).toBe(2);
    expect(result.points[0]).toMatchObject({ date: 'Jan 05', portfolio: 0, benchmark: 0 });
    expect(result.points[1].portfolio).toBe(10);
    expect(result.points[1].benchmark).toBe(5);
    expect(result.portfolioReturnPercent).toBe(10);
    expect(result.benchmarkReturnPercent).toBe(5);
    expect(result.limitedBy).toBeNull();
  });

  it('starts where both series exist when the benchmark begins later', () => {
    const result = alignReturnsByDate(
      series([
        ['2026-01-05', 100],
        ['2026-01-06', 101],
        ['2026-01-07', 102],
      ]),
      series([
        ['2026-01-06', 200],
        ['2026-01-07', 204],
      ]),
    );

    // Jan 5 has no benchmark value, so the window begins on Jan 6 for both sides.
    expect(result.points[0].date).toBe('Jan 06');
    expect(result.points[0].portfolio).toBe(0);
    expect(result.sessions).toBe(2);
    expect(result.limitedBy).toBe('benchmark');
  });

  it('names the portfolio as the limit when it begins after the benchmark', () => {
    const result = alignReturnsByDate(
      series([
        ['2026-01-06', 100],
        ['2026-01-07', 103],
      ]),
      series([
        ['2026-01-05', 200],
        ['2026-01-06', 202],
        ['2026-01-07', 204],
      ]),
    );

    expect(result.points[0].date).toBe('Jan 06');
    expect(result.limitedBy).toBe('portfolio');
  });

  it('labels a cross-year window with the year so 1Y does not read as 11 months', () => {
    const result = alignReturnsByDate(
      series([
        ['2025-10-28', 100],
        ['2026-10-19', 120],
      ]),
      series([
        ['2025-10-28', 100],
        ['2026-10-19', 105],
      ]),
    );

    expect(result.points[0].date).toBe("Oct '25");
    expect(result.points[1].date).toBe("Oct '26");
    expect(result.points[0].iso).toBe('2025-10-28');
  });

  it('caps a long series at the sessions the range asks for', () => {
    const rows = everySession('2024-01-01', 300);
    const result = alignReturnsByDate(series(rows), series(rows), 252);

    expect(result.sessions).toBe(252);
    expect(result.requestedSessions).toBe(252);
  });

  it('names the portfolio as the limit even when the fetch window starts at the purchase', () => {
    const result = alignReturnsByDate(
      series([
        ['2026-07-31', 100],
        ['2026-08-03', 101],
      ]),
      series([
        ['2026-07-31', 200],
        ['2026-08-03', 202],
      ]),
      252,
      '2026-04-20',
    );

    expect(result.limitedBy).toBe('portfolio');
  });

  it('names the benchmark when its history begins after the range start', () => {
    const result = alignReturnsByDate(
      series([
        ['2016-10-21', 100],
        ['2026-10-19', 180],
      ]),
      series([
        ['2018-09-18', 200],
        ['2026-10-19', 300],
      ]),
      2520,
      '2016-10-21',
    );

    expect(result.limitedBy).toBe('benchmark');
  });

  it('returns nothing when the two series never share a session', () => {
    const result = alignReturnsByDate(
      series([['2026-01-05', 100]]),
      series([['2025-01-05', 200]]),
    );

    expect(result.points).toEqual([]);
    expect(result.sessions).toBe(0);
  });
});

describe('rangeWindow', () => {
  it('starts YTD on 1 January, not New Year’s Eve', () => {
    const { from, to } = rangeWindow('YTD');
    const year = new Date().getFullYear();

    expect(from).toBe(`${year}-01-01`);
    // `to` is exclusive: tomorrow, so today's session is included.
    expect(new Date(`${to}T00:00:00`).getTime()).toBeGreaterThan(Date.now());
  });

  it('gives fixed ranges a window at least as long as the range', () => {
    const { from } = rangeWindow('1M');
    const days = (Date.now() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(59);
  });
});
