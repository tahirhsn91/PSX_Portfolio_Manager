import type { ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent } from '@/utils';
import { cn } from '@/lib/utils';
import type { HistoricalDataPoint } from '@/types';

/** Selectable comparison periods. `days` sizes the history fetch, `sessions` the plot. */
export const COMPARISON_RANGES = [
  { key: '1M', label: '1M', sessions: 22, days: 60 },
  { key: '3M', label: '3M', sessions: 65, days: 130 },
  { key: '6M', label: '6M', sessions: 130, days: 220 },
  { key: '1Y', label: '1Y', sessions: 252, days: 420 },
] as const;

export type ComparisonRange = (typeof COMPARISON_RANGES)[number]['key'];

export function rangeConfig(range: ComparisonRange) {
  return COMPARISON_RANGES.find((r) => r.key === range) ?? COMPARISON_RANGES[1];
}

/** Whatever the portfolio is measured against: an index, or another stock. */
export interface ComparisonBenchmark {
  /** Provider symbol, e.g. `KSE100` or `HBL`. */
  id: string;
  /** What the user sees, e.g. `KSE-100 Index` or `HBL — Habib Bank Limited`. */
  label: string;
  /** The benchmark's own value/price history. */
  series: HistoricalDataPoint[];
  kind: 'index' | 'stock';
}

interface BenchmarkComparisonChartProps {
  /** The portfolio's own value over time — build it with `buildPortfolioValueSeries`. */
  portfolioData: HistoricalDataPoint[];
  benchmark: ComparisonBenchmark;
  /** Card heading. Pass the portfolio's name ("Demo vs KSE-100") where there's one. */
  title?: string;
  /** Name drawn on the portfolio line; defaults to "Portfolio". */
  portfolioLabel?: string;
  range: ComparisonRange;
  onRangeChange: (range: ComparisonRange) => void;
  /** The benchmark picker, owned by the page (index list + stock search). */
  benchmarkSelector?: ReactNode;
  portfolioLoading?: boolean;
  benchmarkLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}%` : '—'}
        </p>
      ))}
    </div>
  );
};

export interface ComparisonPoint {
  date: string;
  portfolio: number | null;
  benchmark: number | null;
}

/**
 * Line the portfolio and the benchmark up **by date**, each normalised to % return
 * from the first session in the window.
 *
 * Pairing the two arrays positionally (the last N points of each) draws a
 * confident-looking line even when the two series cover different days. Each
 * series carries its last known value forward across gaps (the feed's history is
 * patchy). Days a series can't cover at all stay `null`, so its line simply
 * begins later instead of pretending to start at zero.
 */
export function alignReturnsByDate(
  portfolioData: HistoricalDataPoint[],
  benchmarkData: HistoricalDataPoint[],
  maxPoints = 65,
): {
  points: ComparisonPoint[];
  portfolioReturnPercent: number;
  benchmarkReturnPercent: number;
  /** Sessions actually plotted, vs the number the range asked for. */
  sessions: number;
  requestedSessions: number;
} {
  const sortedPortfolio = [...portfolioData].sort((a, b) => a.date.localeCompare(b.date));
  const sortedBenchmark = [...benchmarkData].sort((a, b) => a.date.localeCompare(b.date));

  // The window runs from the portfolio's first session (before it was bought there is no
  // portfolio) to the *earlier* of the two series' last real sessions — so nothing is measured
  // against the other side's forward-filled tail. The index feed currently stops on 15 Sep
  // while stock quotes run to the 21st; without this the last four sessions would show the
  // benchmark standing still and hand the portfolio a badge it hadn't earned.
  const lastReal = (rows: HistoricalDataPoint[]) => rows[rows.length - 1]?.date ?? '';
  const portfolioLast = lastReal(sortedPortfolio);
  const benchmarkLast = lastReal(sortedBenchmark);
  const endDate = portfolioLast && benchmarkLast
    ? (portfolioLast < benchmarkLast ? portfolioLast : benchmarkLast)
    : (portfolioLast || benchmarkLast);

  const startDate = sortedPortfolio[0]?.date ?? sortedBenchmark[0]?.date ?? '';
  const requested = [...new Set([...sortedPortfolio, ...sortedBenchmark].map((p) => p.date))]
    .filter((date) => date >= startDate && (!endDate || date <= endDate))
    .sort()
    .slice(-maxPoints);

  if (requested.length === 0) {
    return { points: [], portfolioReturnPercent: 0, benchmarkReturnPercent: 0, sessions: 0, requestedSessions: maxPoints };
  }

  /** Walk a series in date order, yielding its last known close at or before `date`. */
  const cursor = (sorted: HistoricalDataPoint[]) => {
    let i = 0;
    let last: number | null = null;
    return (date: string): number | null => {
      while (i < sorted.length && sorted[i].date <= date) {
        const close = sorted[i].close;
        if (Number.isFinite(close) && close > 0) last = close;
        i += 1;
      }
      return last;
    };
  };

  const portfolioAt = cursor(sortedPortfolio);
  const benchmarkAt = cursor(sortedBenchmark);
  // Cursors must be walked in ascending date order, so read the whole window first.
  const portfolioValues = requested.map((date) => portfolioAt(date));
  const benchmarkValues = requested.map((date) => benchmarkAt(date));

  const firstPortfolio = portfolioValues.findIndex((v) => v !== null);
  const firstBenchmark = benchmarkValues.findIndex((v) => v !== null);
  if (firstPortfolio === -1 || firstBenchmark === -1) {
    return { points: [], portfolioReturnPercent: 0, benchmarkReturnPercent: 0, sessions: 0, requestedSessions: maxPoints };
  }

  // Compare like for like: begin where **both** series have a value, so the two
  // lines start at 0% on the same session and the returns cover the same window.
  // The feed's history depth varies per symbol (some only have the last few days),
  // so this is often later than the range's nominal start.
  const offset = Math.max(firstPortfolio, firstBenchmark);
  const dates = requested.slice(offset);
  const pValues = portfolioValues.slice(offset);
  const bValues = benchmarkValues.slice(offset);

  // …and it *ends* at the last session both series cover. A benchmark whose feed has gone
  // quiet (the index series currently stops 15 Sep while quotes run to 21 Sep) must not be
  // compared against a fresher portfolio as though the extra sessions counted: the badge and
  // both return boxes measure the same window, which is what the header states.
  let lastBoth = dates.length - 1;
  while (lastBoth >= 0 && (pValues[lastBoth] === null || bValues[lastBoth] === null)) lastBoth -= 1;
  if (lastBoth < 0) {
    return { points: [], portfolioReturnPercent: 0, benchmarkReturnPercent: 0, sessions: 0, requestedSessions: maxPoints };
  }

  const windowDates = dates.slice(0, lastBoth + 1);
  const windowP = pValues.slice(0, lastBoth + 1);
  const windowB = bValues.slice(0, lastBoth + 1);
  // Both are non-null at the offset, so each series has a base on the same first session.
  const portfolioBase = windowP[0];
  const benchmarkBase = windowB[0];

  const points: ComparisonPoint[] = windowDates.map((date, i) => {
    const p = windowP[i];
    const b = windowB[i];
    return {
      date: format(new Date(`${date}T00:00:00`), 'MMM dd'),
      portfolio: p !== null && portfolioBase ? +((p / portfolioBase - 1) * 100).toFixed(2) : null,
      benchmark: b !== null && benchmarkBase ? +((b / benchmarkBase - 1) * 100).toFixed(2) : null,
    };
  });

  const last = points[points.length - 1];
  return {
    points,
    portfolioReturnPercent: last?.portfolio ?? 0,
    benchmarkReturnPercent: last?.benchmark ?? 0,
    sessions: points.length,
    requestedSessions: maxPoints,
  };
}

export function BenchmarkComparisonChart({
  portfolioData, benchmark,
  title = 'Portfolio vs benchmark',
  portfolioLabel = 'Portfolio',
  range, onRangeChange,
  benchmarkSelector,
  portfolioLoading, benchmarkLoading,
}: BenchmarkComparisonChartProps) {
  const { points, portfolioReturnPercent, benchmarkReturnPercent, sessions, requestedSessions } = alignReturnsByDate(
    portfolioData, benchmark.series, rangeConfig(range).sessions,
  );

  const hasPortfolioLine = points.some((p) => p.portfolio !== null);
  const hasBenchmarkLine = points.some((p) => p.benchmark !== null);
  const hasData = hasPortfolioLine && hasBenchmarkLine;
  const isLoading = (portfolioLoading || benchmarkLoading) && !hasData;
  const limitedByHistory = hasData && sessions < requestedSessions;
  const outperformance = portfolioReturnPercent - benchmarkReturnPercent;

  // Why nothing can be plotted — the fix differs per cause, so say which it is.
  const emptyReason = portfolioData.length === 0
    ? 'No portfolio history to plot yet — add a holding with a purchase date and the portfolio line appears as soon as its prices are in.'
    : benchmark.series.length === 0
      ? benchmark.kind === 'index'
        ? `The data feed does not track ${benchmark.label} yet, so there is nothing to compare against.`
        : `${benchmark.label} has no history for this period, so there is nothing to compare against yet.`
      : `${benchmark.label} has no trading session in common with this portfolio in the selected period — try a longer range.`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              {hasData
                ? `${range} — return ${points[0]?.date} → ${points[points.length - 1]?.date}, both lines normalised to 0% there${limitedByHistory ? ' (shorter than the range: that is all the feed holds)' : ''}`
                : 'Normalised return comparison'}
            </CardDescription>
          </div>
          {hasData && (
            <Badge variant={outperformance >= 0 ? 'profit' : 'loss'}>
              {outperformance >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(outperformance))} vs {benchmark.kind === 'index' ? 'index' : 'stock'}
            </Badge>
          )}
        </div>

        {/* Benchmark + period controls */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Comparing with</span>
            <span className="font-medium text-foreground">{benchmark.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {benchmarkSelector}
            <div className="flex items-center gap-0.5 rounded-md border p-0.5" role="group" aria-label="Comparison period">
              {COMPARISON_RANGES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onRangeChange(option.key)}
                  aria-pressed={option.key === range}
                  className={cn(
                    'rounded px-2 py-1 text-xs font-medium transition-colors',
                    option.key === range
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {hasData && (
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div className="rounded-md bg-muted/40 p-2 text-center">
              <p className="truncate text-xs text-muted-foreground" title={`${portfolioLabel} Return`}>
                {portfolioLabel} Return
              </p>
              <p className={`font-bold ${portfolioReturnPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(portfolioReturnPercent)}
              </p>
            </div>
            <div className="rounded-md bg-muted/40 p-2 text-center">
              <p className="truncate text-xs text-muted-foreground" title={`${benchmark.label} Return`}>
                {benchmark.label} Return
              </p>
              <p className={`font-bold ${benchmarkReturnPercent >= 0 ? 'text-profit' : 'text-loss'}`}>
                {formatPercent(benchmarkReturnPercent)}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading comparison…</p>
        ) : hasData ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval="preserveStartEnd" className="fill-muted-foreground" />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} className="fill-muted-foreground" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="portfolio" name={portfolioLabel} stroke="#00a651" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchmark" name={benchmark.label} stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {emptyReason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
