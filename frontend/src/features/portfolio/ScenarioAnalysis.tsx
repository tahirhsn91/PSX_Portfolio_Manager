/**
 * Scenario analysis (issue #96).
 *
 * A what-if table: apply ±5/10/20% to every priced holding and show the
 * resulting market value and P/L. Hypothetical arithmetic on today's prices —
 * labelled as such, never a forecast.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { scenarioAnalysis, DEFAULT_SCENARIOS } from '@/utils/scenarioAnalysis';
import { formatCurrency } from '@/utils';
import type { HoldingMetrics } from '@/types';

const pctLabel = (c: number): string => (c >= 0 ? `+${Math.round(c * 100)}%` : `${Math.round(c * 100)}%`);

export function ScenarioAnalysis({ holdingMetrics }: { holdingMetrics: HoldingMetrics[] }) {
  const priced = useMemo(() => holdingMetrics.filter((h) => h.priceAvailable), [holdingMetrics]);

  const scenarios = useMemo(
    () =>
      scenarioAnalysis(
        priced.map((h) => ({ currentValue: h.currentValue, costBasis: h.costBasis })),
        DEFAULT_SCENARIOS,
      ),
    [priced],
  );

  if (priced.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scenario analysis</CardTitle>
        <p className="text-xs text-muted-foreground">
          Hypothetical: a uniform price move on every priced holding. Arithmetic on today's
          prices, not a forecast or prediction.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {scenarios.map((s) => {
            const pl = s.profitLoss;
            const plText = pl >= 0 ? `+${formatCurrency(pl)}` : formatCurrency(pl);
            return (
              <li key={s.change} className="flex items-center justify-between gap-3 py-2">
                <span className="font-mono text-sm font-medium">{pctLabel(s.change)}</span>
                <div className="text-right">
                  <span className="block font-mono text-sm tabular-nums">
                    {formatCurrency(s.marketValue)}
                  </span>
                  <span
                    className={`block text-xs tabular-nums ${pl >= 0 ? 'text-profit' : 'text-loss'}`}
                  >
                    {plText} P/L
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
