/**
 * Financial calculation utilities.
 * Pure functions — no side effects, fully testable.
 */

import type { Holding, HoldingMetrics, PortfolioMetrics, Portfolio } from '@/types';
import type { StockQuote } from '@/types';

/**
 * Calculate metrics for a single holding given the current market quote
 */
export function calculateHoldingMetrics(
  holding: Holding,
  quote: StockQuote | null,
  totalPortfolioValue: number
): HoldingMetrics {
  const currentPrice = quote?.currentPrice ?? holding.averagePurchasePrice;
  const costBasis = holding.shares * holding.averagePurchasePrice;
  const currentValue = holding.shares * currentPrice;
  const unrealizedPL = currentValue - costBasis;
  const unrealizedPLPercent = costBasis !== 0 ? (unrealizedPL / costBasis) * 100 : 0;
  const todayChange = quote?.change ?? 0;
  const todayChangePercent = quote?.changePercent ?? 0;
  const todayPL = todayChange * holding.shares;
  const totalDividendIncome = holding.dividendsReceived.reduce((sum, d) => sum + d.totalAmount, 0);
  const totalReturn = unrealizedPL + totalDividendIncome;
  const totalReturnPercent = costBasis !== 0 ? (totalReturn / costBasis) * 100 : 0;

  return {
    holdingId: holding.id,
    currentPrice,
    currentValue,
    costBasis,
    unrealizedPL,
    unrealizedPLPercent,
    todayChange,
    todayChangePercent,
    todayPL,
    totalDividendIncome,
    totalReturn,
    totalReturnPercent,
    weightInPortfolio: totalPortfolioValue !== 0 ? (currentValue / totalPortfolioValue) * 100 : 0,
  };
}

/**
 * Calculate aggregate portfolio metrics from individual holding metrics
 */
export function calculatePortfolioMetrics(
  portfolio: Portfolio,
  quotes: Record<string, StockQuote | null>
): PortfolioMetrics {
  // First pass: get current value for weight calculation
  const roughValues = portfolio.holdings.map((h) => {
    const q = quotes[h.symbol] ?? null;
    return h.shares * (q?.currentPrice ?? h.averagePurchasePrice);
  });
  const roughTotal = roughValues.reduce((s, v) => s + v, 0);

  // Second pass: full metrics
  const holdingMetrics = portfolio.holdings.map((h) =>
    calculateHoldingMetrics(h, quotes[h.symbol] ?? null, roughTotal)
  );

  const totalInvestment = holdingMetrics.reduce((s, m) => s + m.costBasis, 0);
  const currentValue = holdingMetrics.reduce((s, m) => s + m.currentValue, 0);
  const totalPL = currentValue - totalInvestment;
  const totalPLPercent = totalInvestment !== 0 ? (totalPL / totalInvestment) * 100 : 0;
  const todayPL = holdingMetrics.reduce((s, m) => s + m.todayPL, 0);
  const todayPLPercent = currentValue !== 0 ? (todayPL / currentValue) * 100 : 0;
  const totalDividendIncome = holdingMetrics.reduce((s, m) => s + m.totalDividendIncome, 0);
  const totalReturn = totalPL + totalDividendIncome;
  const totalReturnPercent = totalInvestment !== 0 ? (totalReturn / totalInvestment) * 100 : 0;

  // Best / worst performer by unrealized P&L %
  const sorted = [...holdingMetrics].sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent);
  const bestMetric = sorted[0];
  const worstMetric = sorted[sorted.length - 1];
  const bestHolder = portfolio.holdings.find((h) => h.id === bestMetric?.holdingId);
  const worstHolder = portfolio.holdings.find((h) => h.id === worstMetric?.holdingId);

  return {
    portfolioId: portfolio.id,
    totalInvestment,
    currentValue,
    totalPL,
    totalPLPercent,
    todayPL,
    todayPLPercent,
    totalDividendIncome,
    totalReturn,
    totalReturnPercent,
    bestPerformer: bestHolder
      ? { symbol: bestHolder.symbol, returnPercent: bestMetric.unrealizedPLPercent }
      : null,
    worstPerformer: worstHolder && portfolio.holdings.length > 1
      ? { symbol: worstHolder.symbol, returnPercent: worstMetric.unrealizedPLPercent }
      : null,
    holdingMetrics,
  };
}

/**
 * Calculate portfolio return vs KSE100 over a period
 */
export function calculateVsKSE100(
  portfolioReturnPercent: number,
  kse100ReturnPercent: number
): { outperformance: number; isOutperforming: boolean } {
  const outperformance = portfolioReturnPercent - kse100ReturnPercent;
  return { outperformance, isOutperforming: outperformance > 0 };
}

/**
 * Aggregate metrics across multiple portfolios
 */
export function aggregatePortfolioMetrics(metrics: PortfolioMetrics[]): Omit<PortfolioMetrics, 'portfolioId' | 'holdingMetrics' | 'bestPerformer' | 'worstPerformer'> {
  const totalInvestment = metrics.reduce((s, m) => s + m.totalInvestment, 0);
  const currentValue = metrics.reduce((s, m) => s + m.currentValue, 0);
  const totalPL = currentValue - totalInvestment;
  const todayPL = metrics.reduce((s, m) => s + m.todayPL, 0);
  const totalDividendIncome = metrics.reduce((s, m) => s + m.totalDividendIncome, 0);
  const totalReturn = totalPL + totalDividendIncome;

  return {
    totalInvestment,
    currentValue,
    totalPL,
    totalPLPercent: totalInvestment !== 0 ? (totalPL / totalInvestment) * 100 : 0,
    todayPL,
    todayPLPercent: currentValue !== 0 ? (todayPL / currentValue) * 100 : 0,
    totalDividendIncome,
    totalReturn,
    totalReturnPercent: totalInvestment !== 0 ? (totalReturn / totalInvestment) * 100 : 0,
  };
}

/**
 * Build sector allocation data from portfolio holdings + metrics
 */
export function buildSectorAllocation(
  portfolio: Portfolio,
  metrics: HoldingMetrics[]
): { sector: string; value: number; percent: number; color: string }[] {
  const sectorMap = new Map<string, number>();
  const totalValue = metrics.reduce((s, m) => s + m.currentValue, 0);

  portfolio.holdings.forEach((h) => {
    const m = metrics.find((m) => m.holdingId === h.id);
    if (m) {
      sectorMap.set(h.sector, (sectorMap.get(h.sector) ?? 0) + m.currentValue);
    }
  });

  const colors = ['#00a651','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4'];
  return Array.from(sectorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sector, value], i) => ({
      sector,
      value,
      percent: totalValue !== 0 ? (value / totalValue) * 100 : 0,
      color: colors[i % colors.length],
    }));
}
