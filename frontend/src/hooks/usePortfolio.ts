/**
 * Portfolio hooks — computed metrics derived from store + live market data.
 */

import { useMemo } from 'react';
import { usePortfolioStore, useMarketStore } from '@/store';
import { calculatePortfolioMetrics, calculateHoldingMetrics } from '@/utils';
import { useStockQuotes } from './useMarketData';
import type { PortfolioMetrics, HoldingMetrics } from '@/types';

/** Get all portfolio metrics with live prices */
export function usePortfolioMetrics(portfolioId: string | undefined): {
  metrics: PortfolioMetrics | null;
  isLoading: boolean;
} {
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
  const symbols = useMemo(() => portfolio?.holdings.map((h) => h.symbol) ?? [], [portfolio]);
  const { isLoading } = useStockQuotes(symbols);
  const quotes = useMarketStore((s) => s.quotes);

  const metrics = useMemo(() => {
    if (!portfolio) return null;
    const quotesMap = Object.fromEntries(
      Object.entries(quotes).map(([sym, entry]) => [sym, entry.data])
    );
    return calculatePortfolioMetrics(portfolio, quotesMap);
  }, [portfolio, quotes]);

  return { metrics, isLoading };
}

/** Get metrics for all portfolios combined */
export function useAllPortfoliosMetrics() {
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const allSymbols = useMemo(
    () => [...new Set(portfolios.flatMap((p) => p.holdings.map((h) => h.symbol)))],
    [portfolios]
  );
  const { isLoading } = useStockQuotes(allSymbols);
  const quotes = useMarketStore((s) => s.quotes);

  const metricsPerPortfolio = useMemo(() => {
    const quotesMap = Object.fromEntries(
      Object.entries(quotes).map(([sym, entry]) => [sym, entry.data])
    );
    return portfolios.map((p) => calculatePortfolioMetrics(p, quotesMap));
  }, [portfolios, quotes]);

  const aggregate = useMemo(() => {
    const totalInvestment = metricsPerPortfolio.reduce((s, m) => s + m.totalInvestment, 0);
    const currentValue = metricsPerPortfolio.reduce((s, m) => s + m.currentValue, 0);
    const totalPL = currentValue - totalInvestment;
    const todayPL = metricsPerPortfolio.reduce((s, m) => s + m.todayPL, 0);
    const totalDividendIncome = metricsPerPortfolio.reduce((s, m) => s + m.totalDividendIncome, 0);
    return {
      totalInvestment,
      currentValue,
      totalPL,
      totalPLPercent: totalInvestment !== 0 ? (totalPL / totalInvestment) * 100 : 0,
      todayPL,
      todayPLPercent: currentValue !== 0 ? (todayPL / currentValue) * 100 : 0,
      totalDividendIncome,
      totalReturn: totalPL + totalDividendIncome,
      totalReturnPercent: totalInvestment !== 0 ? ((totalPL + totalDividendIncome) / totalInvestment) * 100 : 0,
    };
  }, [metricsPerPortfolio]);

  return { metricsPerPortfolio, aggregate, isLoading };
}

/** Get metrics for a single holding */
export function useHoldingMetrics(portfolioId: string, holdingId: string): HoldingMetrics | null {
  const holding = usePortfolioStore((s) =>
    s.portfolios.find((p) => p.id === portfolioId)?.holdings.find((h) => h.id === holdingId)
  );
  const portfolio = usePortfolioStore((s) => s.portfolios.find((p) => p.id === portfolioId));
  const quotes = useMarketStore((s) => s.quotes);

  return useMemo(() => {
    if (!holding || !portfolio) return null;
    const quotesMap = Object.fromEntries(Object.entries(quotes).map(([sym, e]) => [sym, e.data]));
    const roughTotal = portfolio.holdings.reduce((s, h) => {
      const q = quotesMap[h.symbol];
      return s + h.shares * (q?.currentPrice ?? h.averagePurchasePrice);
    }, 0);
    return calculateHoldingMetrics(holding, quotesMap[holding.symbol] ?? null, roughTotal);
  }, [holding, portfolio, quotes]);
}
