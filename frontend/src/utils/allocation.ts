import type { Holding, HoldingMetrics } from '@/types';

export interface SectorAllocation {
  name: string;
  value: number;
  percent: number;
}

/**
 * "Where your money is", split by sector.
 *
 * The split is by **money**, not by how many holdings a sector happens to contain:
 * five small Fertilizer positions must not outweigh one large Cement position.
 *
 * A priced holding contributes its current value; an unpriced one contributes its
 * cost basis (a fact the metrics still carry, and better than dropping the position);
 * a holding the metrics have not reached yet falls back to shares × average purchase
 * price — so the card has a real split on its first paint rather than an empty pie.
 * Rows are sorted largest first, so the biggest commitment leads the chart.
 */
export function allocationBySector(
  holdings: readonly Holding[],
  metrics: readonly HoldingMetrics[],
): SectorAllocation[] {
  const byHolding = new Map(metrics.map((metric) => [metric.holdingId, metric] as const));
  const totals = new Map<string, number>();

  for (const holding of holdings) {
    const metric = byHolding.get(holding.id);
    const value = metric
      ? metric.priceAvailable
        ? metric.currentValue
        : metric.costBasis
      : holding.shares * holding.averagePurchasePrice;

    if (!Number.isFinite(value) || value <= 0) continue;
    totals.set(holding.sector, (totals.get(holding.sector) ?? 0) + value);
  }

  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return [...totals.entries()]
    .map(([name, value]) => ({
      name,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
