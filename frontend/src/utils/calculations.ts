/**
 * Financial calculation utilities.
 * Pure functions — no side effects, fully testable.
 */

import type { Holding, HoldingMetrics, PortfolioMetrics, Portfolio } from '@/types';
import type { StockQuote, HistoricalDataPoint } from '@/types';
import { CHART_COLORS } from '@/constants';

/**
 * Calculate metrics for a single holding given the current market quote
 */
/**
 * Can this quote be used to value a position?
 *
 * A quote is usable only when it exists, is flagged available and carries a
 * positive price. A 404 from the feed arrives as an explicitly unavailable quote
 * (and a failed request as `null`); both used to be treated as a price of 0 —
 * which read as "worth nothing" — or, when absent entirely, as the holding's own
 * cost, which read as "hasn't moved".
 */
export function isQuoteUsable(quote: StockQuote | null | undefined): quote is StockQuote {
  return !!quote && quote.priceAvailable !== false && Number.isFinite(quote.currentPrice) && quote.currentPrice > 0;
}

export function calculateHoldingMetrics(
  holding: Holding,
  quote: StockQuote | null,
  totalPortfolioValue: number
): HoldingMetrics {
  const costBasis = holding.shares * holding.averagePurchasePrice;
  const totalDividendIncome = holding.dividendsReceived.reduce((sum, d) => sum + d.totalAmount, 0);

  if (!isQuoteUsable(quote)) {
    // Facts only (cost, dividends). Everything price-derived is 0 and guarded by
    // `priceAvailable` at every render site and aggregate.
    return {
      holdingId: holding.id,
      priceAvailable: false,
      currentPrice: 0,
      currentValue: 0,
      costBasis,
      unrealizedPL: 0,
      unrealizedPLPercent: 0,
      todayChange: 0,
      todayChangePercent: 0,
      todayPL: 0,
      totalDividendIncome,
      totalReturn: 0,
      totalReturnPercent: 0,
      weightInPortfolio: 0,
    };
  }

  const currentPrice = quote.currentPrice;
  const currentValue = holding.shares * currentPrice;
  const unrealizedPL = currentValue - costBasis;
  const unrealizedPLPercent = costBasis !== 0 ? (unrealizedPL / costBasis) * 100 : 0;
  const todayChange = quote.change ?? 0;
  const todayChangePercent = quote.changePercent ?? 0;
  const todayPL = todayChange * holding.shares;
  const totalReturn = unrealizedPL + totalDividendIncome;
  const totalReturnPercent = costBasis !== 0 ? (totalReturn / costBasis) * 100 : 0;

  return {
    holdingId: holding.id,
    priceAvailable: true,
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
  const holdingMetrics = portfolio.holdings.map((h) => {
    const q = quotes[h.symbol] ?? null;
    return calculateHoldingMetrics(h, q, 0);   // weights need the priced total first
  });

  // The weight denominator counts only holdings the feed can price — an unpriced
  // holding used to be counted at cost, which diluted every other weight.
  const pricedMetrics = holdingMetrics.filter((m) => m.priceAvailable);
  const pricedTotal = pricedMetrics.reduce((s, m) => s + m.currentValue, 0);
  for (const m of pricedMetrics) {
    m.weightInPortfolio = pricedTotal !== 0 ? (m.currentValue / pricedTotal) * 100 : 0;
  }

  const unpricedMetrics = holdingMetrics.filter((m) => !m.priceAvailable);

  // Every figure below covers the priced holdings, so the on-screen arithmetic holds
  // (Current Value − Invested = P&L). The page says how many were left out.
  const totalInvestment = pricedMetrics.reduce((s, m) => s + m.costBasis, 0);
  const currentValue = pricedTotal;
  const totalPL = currentValue - totalInvestment;
  const totalPLPercent = totalInvestment !== 0 ? (totalPL / totalInvestment) * 100 : 0;
  const todayPL = holdingMetrics.reduce((s, m) => s + m.todayPL, 0);
  // Measured against the *previous* value, not today's: the feed reports every change
  // against its previous close (KSE-100: 830.43 on 171402.08 = 0.4845%), so dividing by
  // the current value understated the day's move and left the portfolio's percentage
  // incomparable with the index shown beside it.
  const todayPLPercent = currentValue - todayPL !== 0 ? (todayPL / (currentValue - todayPL)) * 100 : 0;
  const totalDividendIncome = pricedMetrics.reduce((s, m) => s + m.totalDividendIncome, 0);
  const totalReturn = totalPL + totalDividendIncome;
  const totalReturnPercent = totalInvestment !== 0 ? (totalReturn / totalInvestment) * 100 : 0;

  // Best / worst performer by unrealized P&L % — priced holdings only: an unpriced
  // holding would otherwise win "worst" with a fabricated return.
  const sorted = [...pricedMetrics].sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent);
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
    worstPerformer: worstHolder && pricedMetrics.length > 1
      ? { symbol: worstHolder.symbol, returnPercent: worstMetric.unrealizedPLPercent }
      : null,
    holdingMetrics,
    unpricedHoldings: unpricedMetrics.length,
    unpricedSymbols: portfolio.holdings
      .filter((h) => unpricedMetrics.some((m) => m.holdingId === h.id))
      .map((h) => h.symbol),
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

  // Carried through the aggregate so the dashboard can report the same caveat.
  const unpricedHoldings = metrics.reduce((s, m) => s + m.unpricedHoldings, 0);
  const unpricedSymbols = metrics.flatMap((m) => m.unpricedSymbols);

  return {
    totalInvestment,
    currentValue,
    totalPL,
    totalPLPercent: totalInvestment !== 0 ? (totalPL / totalInvestment) * 100 : 0,
    todayPL,
    // Same convention as the single-portfolio metrics.
    todayPLPercent: currentValue - todayPL !== 0 ? (todayPL / (currentValue - todayPL)) * 100 : 0,
    totalDividendIncome,
    totalReturn,
    totalReturnPercent: totalInvestment !== 0 ? (totalReturn / totalInvestment) * 100 : 0,
    unpricedHoldings,
    unpricedSymbols,
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
  const totalValue = metrics.reduce((s, m) => s + (m.priceAvailable ? m.currentValue : 0), 0);

  portfolio.holdings.forEach((h) => {
    const m = metrics.find((metric) => metric.holdingId === h.id);
    // Unpriced holdings are skipped rather than added as 0: a zero-value sector
    // would put a 0% slice (and its legend entry) on the chart.
    if (m?.priceAvailable) {
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

/**
 * Build per-holding allocation data from portfolio holdings + metrics.
 *
 * The counterpart to buildSectorAllocation: same shape, but keyed by holding
 * instead of sector, so the Charts tab can show "how much of the portfolio is
 * this position" alongside "how much of the portfolio is this sector".
 *
 * Values come from the metrics the page already loads (`currentValue` is
 * shares × the latest quote), so this adds no fetching. The percentage is the
 * same number the holdings table prints as Weight
 * (`HoldingMetrics.weightInPortfolio`), computed here from the same total so the
 * pie and the table can't diverge if one ever gains a filter.
 */
export function buildHoldingAllocation(
  portfolio: Portfolio,
  metrics: HoldingMetrics[]
): { name: string; symbol: string; value: number; percent: number; color: string }[] {
  const totalValue = metrics.reduce((s, m) => s + (m.priceAvailable ? m.currentValue : 0), 0);

  return portfolio.holdings
    .map((h) => {
      const m = metrics.find((metric) => metric.holdingId === h.id);
      // Same rule as the sector pie: an unpriced holding has no share to draw.
      return m?.priceAvailable ? { symbol: h.symbol, name: h.symbol, value: m.currentValue } : null;
    })
    .filter((entry): entry is { symbol: string; name: string; value: number } => entry !== null)
    .sort((a, b) => b.value - a.value)
    // CHART_COLORS rather than another local literal: the first eight entries are
    // the same colours buildSectorAllocation uses, so holdings keep the sector
    // chart's palette without a third copy of it. (Slices past the eighth wrap,
    // which is already true of the sector chart past its tenth.)
    .map((entry, i) => ({
      ...entry,
      percent: totalValue !== 0 ? (entry.value / totalValue) * 100 : 0,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
}

/**
 * Value of a portfolio per day, priced from each holding's own price history.
 *
 * This is what makes a real "portfolio vs KSE-100" line possible — the chart used
 * to plot the index against itself, so the two lines sat on top of each other.
 *
 * - `shares × that day's close`, summed across the holdings **owned on that day**
 *   (a purchase date after the date excludes the holding — you can't have owned
 *   it yet).
 * - A symbol with no print on a given day carries its last known close forward,
 *   because the scraper's history is patchy (some symbols only have a month of
 *   rows), and strict same-day matching would drop most of the window.
 * - Days where nothing could be priced are omitted rather than reported as zero.
 */
export function buildPortfolioValueSeries(
  holdings: Pick<Holding, 'symbol' | 'shares' | 'purchaseDate'>[],
  histories: Record<string, HistoricalDataPoint[]>,
): HistoricalDataPoint[] {
  const closesBySymbol = new Map<string, Map<string, number>>();
  const dates = new Set<string>();
  for (const [symbol, points] of Object.entries(histories)) {
    const byDate = new Map<string, number>();
    for (const point of points) {
      if (!point?.date || !Number.isFinite(point.close) || point.close <= 0) continue;
      byDate.set(point.date, point.close);
      dates.add(point.date);
    }
    closesBySymbol.set(symbol.toUpperCase(), byDate);
  }

  const lastClose = new Map<string, number>();
  const series: HistoricalDataPoint[] = [];

  for (const date of [...dates].sort()) {
    for (const [symbol, byDate] of closesBySymbol) {
      const close = byDate.get(date);
      if (close !== undefined) lastClose.set(symbol, close);
    }

    let value = 0;
    for (const holding of holdings) {
      if (holding.purchaseDate && holding.purchaseDate > date) continue;
      const close = lastClose.get(holding.symbol.toUpperCase());
      if (close === undefined) continue;
      value += holding.shares * close;
    }

    if (value > 0) {
      series.push({ date, open: value, high: value, low: value, close: value, volume: 0 });
    }
  }

  return series;
}