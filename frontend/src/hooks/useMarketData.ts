/**
 * Market data hooks using TanStack Query for caching, deduplication, and background refresh.
 */

import { useQuery } from '@tanstack/react-query';
import { marketDataService } from '@/services';
import { useMarketStore } from '@/store';
import { useEffect } from 'react';

export const MARKET_QUERY_KEYS = {
  quote: (symbol: string) => ['market', 'quote', symbol] as const,
  quotes: (symbols: string[]) => ['market', 'quotes', ...symbols.sort()] as const,
  detail: (symbol: string) => ['market', 'detail', symbol] as const,
  historical: (symbol: string, from: string, to: string) => ['market', 'historical', symbol, from, to] as const,
  kse100: () => ['market', 'kse100'] as const,
  index: (symbol: string) => ['market', 'index', symbol.toUpperCase()] as const,
  sector: () => ['market', 'sector'] as const,
  status: () => ['market', 'status'] as const,
  search: (query: string) => ['market', 'search', query] as const,
} as const;

/** Fetch and cache a single stock quote */
export function useStockQuote(symbol: string | undefined) {
  const setQuote = useMarketStore((s) => s.setQuote);
  const query = useQuery({
    queryKey: symbol ? MARKET_QUERY_KEYS.quote(symbol) : ['disabled'],
    queryFn: () => marketDataService.getQuote(symbol!),
    enabled: !!symbol,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (query.data) setQuote(query.data);
  }, [query.data, setQuote]);

  return query;
}

/** Fetch multiple quotes in a single call */
export function useStockQuotes(symbols: string[]) {
  const setQuotes = useMarketStore((s) => s.setQuotes);
  const query = useQuery({
    queryKey: MARKET_QUERY_KEYS.quotes(symbols),
    queryFn: () => marketDataService.getQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (query.data) setQuotes(query.data);
  }, [query.data, setQuotes]);

  return query;
}

/** Fetch full stock details (richer data, longer cache) */
export function useStockDetail(symbol: string | undefined) {
  return useQuery({
    queryKey: symbol ? MARKET_QUERY_KEYS.detail(symbol) : ['disabled'],
    queryFn: () => marketDataService.getStockDetail(symbol!),
    enabled: !!symbol,
    staleTime: 300_000,
  });
}

/** Fetch historical OHLCV data */
export function useHistoricalData(symbol: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: symbol ? MARKET_QUERY_KEYS.historical(symbol, from, to) : ['disabled'],
    queryFn: () => marketDataService.getHistoricalData(symbol!, from, to),
    enabled: !!symbol && !!from && !!to,
    staleTime: 3_600_000, // 1 hour
  });
}

/** Fetch KSE100 index. Resolves to null when the provider has no index to offer. */
export function useKSE100() {
  const setKSE100 = useMarketStore((s) => s.setKSE100);
  const query = useQuery({
    queryKey: MARKET_QUERY_KEYS.kse100(),
    queryFn: () => marketDataService.getKSE100(),
    staleTime: 60_000,
    // No index available (provider returned null) → stop polling for it. The provider
    // short-circuits those calls anyway; this just stops re-running the query.
    refetchInterval: (q) => (q.state.data ? 60_000 : false),
  });

  useEffect(() => {
    if (query.data) setKSE100(query.data);
  }, [query.data, setKSE100]);

  return query;
}

/**
 * Fetch any PSX index by code (KSE100, KSE30, ALLSHR, KMI30, …).
 *
 * Resolves to `null` when the feed does not track that index yet — callers render
 * "not tracked", never a substituted number.
 */
export function useIndex(symbol: string | undefined) {
  return useQuery({
    queryKey: symbol ? MARKET_QUERY_KEYS.index(symbol) : ['disabled'],
    queryFn: () => marketDataService.getIndex(symbol!),
    enabled: !!symbol,
    staleTime: 60_000,
    // Null means "the feed doesn't track this one" — polling wouldn't change that.
    refetchInterval: (q) => (q.state.data ? 60_000 : false),
  });
}

/** Fetch sector performance */
export function useSectorPerformance() {
  return useQuery({
    queryKey: MARKET_QUERY_KEYS.sector(),
    queryFn: () => marketDataService.getSectorPerformance(),
    staleTime: 300_000,
  });
}

/** Fetch market open/close status */
export function useMarketStatus() {
  return useQuery({
    queryKey: MARKET_QUERY_KEYS.status(),
    queryFn: () => marketDataService.getMarketStatus(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Search companies by name or symbol */
export function useCompanySearch(query: string) {
  return useQuery({
    queryKey: MARKET_QUERY_KEYS.search(query),
    queryFn: () => marketDataService.searchCompanies(query),
    enabled: query.length >= 1,
    staleTime: 300_000,
  });
}
