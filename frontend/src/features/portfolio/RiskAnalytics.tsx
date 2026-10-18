/**
 * Portfolio risk analytics (issue #95).
 *
 * Historical, method-documented metrics: max drawdown, annualized volatility,
 * Sharpe ratio, beta vs KSE-100, and pairwise correlations between holdings.
 * Every value is computed over ~1 year of daily closes (or less where history
 * is shorter); a metric shows "N/A" when the sample is too small to be
 * meaningful — never a fabricated number.
 */

import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { marketDataService } from '@/services';
import {
  toReturns,
  maxDrawdown,
  annualizedVolatility,
  sharpeRatio,
  beta,
  correlation,
} from '@/utils/riskAnalytics';
import type { Holding, HistoricalDataPoint } from '@/types';

const LOOKBACK_DAYS = 365;

interface Dated {
  date: string;
  value: number;
}

/** Close series as {date, value}, sorted oldest→newest so returns are chronological. */
function toDated(hist: HistoricalDataPoint[]): Dated[] {
  return hist
    .map((p) => ({ date: p.date, value: p.close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Align two dated series on their common dates, in `a`'s order. */
function align(a: Dated[], b: Dated[]): { x: number[]; y: number[] } {
  const bMap = new Map(b.map((p) => [p.date, p.value]));
  const x: number[] = [];
  const y: number[] = [];
  for (const p of a) {
    const v = bMap.get(p.date);
    if (v !== undefined) {
      x.push(p.value);
      y.push(v);
    }
  }
  return { x, y };
}

const pct = (x: number | null): string => (x == null ? 'N/A' : `${(x * 100).toFixed(2)}%`);
const num = (x: number | null): string => (x == null ? 'N/A' : x.toFixed(2));

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

export function RiskAnalytics({ holdings }: { holdings: Holding[] }) {
  const symbols = useMemo(() => holdings.map((h) => h.symbol), [holdings]);
  const from = useMemo(() => format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd'), []);
  const to = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const histories = useQueries({
    queries: symbols.map((sym) => ({
      queryKey: ['riskHistory', sym, from, to],
      queryFn: () => marketDataService.getHistoricalData(sym, from, to),
      staleTime: 6 * 60 * 60 * 1000,
      enabled: symbols.length > 0,
    })),
  });

  const kse = useQuery({
    queryKey: ['kse100History'],
    queryFn: () => marketDataService.getKSE100(),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const isLoading = histories.some((h) => h.isLoading) || kse.isLoading;

  const metrics = useMemo(() => {
    const loaded = symbols.map((sym, i) => ({
      sym,
      shares: holdings[i].shares,
      dated: toDated(histories[i]?.data ?? []),
    }));

    // Portfolio value series: Σ shares × close per date, across holdings that have a price that day.
    const byDate = new Map<string, number>();
    for (const h of loaded) {
      for (const p of h.dated) byDate.set(p.date, (byDate.get(p.date) ?? 0) + h.shares * p.value);
    }
    const valueSeries: Dated[] = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));
    const portfolioReturns = toReturns(valueSeries.map((p) => p.value));

    // Beta vs KSE-100 on their common dates.
    const kseDated = toDated(kse.data?.historicalData ?? []);
    const { x: pv, y: kv } = align(valueSeries, kseDated);

    const pairs: { a: string; b: string; value: number | null }[] = [];
    for (let i = 0; i < loaded.length; i++) {
      for (let j = i + 1; j < loaded.length; j++) {
        const { x, y } = align(loaded[i].dated, loaded[j].dated);
        pairs.push({
          a: loaded[i].sym,
          b: loaded[j].sym,
          value: correlation(toReturns(x), toReturns(y)),
        });
      }
    }

    return {
      drawdown: maxDrawdown(valueSeries.map((p) => p.value)),
      volatility: annualizedVolatility(portfolioReturns),
      sharpe: sharpeRatio(portfolioReturns),
      beta: beta(toReturns(pv), toReturns(kv)),
      correlations: pairs,
      samples: portfolioReturns.length,
    };
  }, [histories, kse.data, holdings, symbols]);

  if (symbols.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk analytics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Historical metrics over ~{LOOKBACK_DAYS} days of daily closes
          {isLoading ? ' — loading…' : ` (${metrics.samples} trading-day returns)`}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Max drawdown"
            value={pct(metrics.drawdown)}
            hint="Largest peak-to-trough decline"
          />
          <Metric
            label="Volatility (annualized)"
            value={pct(metrics.volatility)}
            hint="σ of daily returns × √252"
          />
          <Metric
            label="Sharpe ratio"
            value={num(metrics.sharpe)}
            hint="Excess over 13% risk-free, annualized"
          />
          <Metric
            label="Beta vs KSE-100"
            value={num(metrics.beta)}
            hint="Covariance / index variance"
          />
        </div>

        {metrics.correlations.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium">Correlation between holdings</div>
            <ul className="space-y-1">
              {metrics.correlations.map((c) => (
                <li key={`${c.a}-${c.b}`} className="flex justify-between text-sm">
                  <span className="font-mono">
                    {c.a} ↔ {c.b}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{num(c.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Methods: returns are simple daily closes; volatility, Sharpe, beta and correlation use
          the sample (n−1) estimator; beta and correlation require date-aligned series of at least
          20 returns. "N/A" means the sample was too small or the series had no variance. All
          figures are historical — they describe the past, not a forecast.
        </p>
      </CardContent>
    </Card>
  );
}
