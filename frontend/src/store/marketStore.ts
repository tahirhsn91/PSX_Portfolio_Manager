import { create } from 'zustand';
import type { StockQuote, KSE100Data, SectorPerformance, MarketStatus } from '@/types';
import { CACHE_TTL } from '@/constants';

interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // epoch ms
}

function isStale<T>(entry: CacheEntry<T> | undefined, ttl: number): boolean {
  if (!entry) return true;
  return Date.now() - entry.fetchedAt > ttl;
}

interface MarketState {
  // Cached quotes keyed by symbol
  quotes: Record<string, CacheEntry<StockQuote>>;
  kse100: CacheEntry<KSE100Data> | null;
  sectorPerformance: CacheEntry<SectorPerformance[]> | null;
  marketStatus: MarketStatus | null;

  // Loading / error state
  loadingSymbols: Set<string>;
  errors: Record<string, string>;

  // Actions
  setQuote: (quote: StockQuote) => void;
  setQuotes: (quotes: StockQuote[]) => void;
  setKSE100: (data: KSE100Data) => void;
  setSectorPerformance: (data: SectorPerformance[]) => void;
  setMarketStatus: (status: MarketStatus) => void;
  setLoading: (symbol: string, loading: boolean) => void;
  setError: (symbol: string, error: string) => void;
  clearError: (symbol: string) => void;

  // Staleness checks
  isQuoteStale: (symbol: string) => boolean;
  isKSE100Stale: () => boolean;
  isSectorStale: () => boolean;

  // Computed getters
  getQuote: (symbol: string) => StockQuote | null;
}

export const useMarketStore = create<MarketState>()((set, get) => ({
  quotes: {},
  kse100: null,
  sectorPerformance: null,
  marketStatus: null,
  loadingSymbols: new Set(),
  errors: {},

  setQuote: (quote) =>
    set((state) => ({
      quotes: {
        ...state.quotes,
        [quote.symbol]: { data: quote, fetchedAt: Date.now() },
      },
    })),

  setQuotes: (quotes) => {
    const now = Date.now();
    set((state) => ({
      quotes: {
        ...state.quotes,
        ...Object.fromEntries(quotes.map((q) => [q.symbol, { data: q, fetchedAt: now }])),
      },
    }));
  },

  setKSE100: (data) => set({ kse100: { data, fetchedAt: Date.now() } }),

  setSectorPerformance: (data) =>
    set({ sectorPerformance: { data, fetchedAt: Date.now() } }),

  setMarketStatus: (status) => set({ marketStatus: status }),

  setLoading: (symbol, loading) =>
    set((state) => {
      const next = new Set(state.loadingSymbols);
      loading ? next.add(symbol) : next.delete(symbol);
      return { loadingSymbols: next };
    }),

  setError: (symbol, error) =>
    set((state) => ({ errors: { ...state.errors, [symbol]: error } })),

  clearError: (symbol) =>
    set((state) => {
      const { [symbol]: _removed, ...rest } = state.errors;
      return { errors: rest };
    }),

  isQuoteStale: (symbol) => isStale(get().quotes[symbol], CACHE_TTL.QUOTE),
  isKSE100Stale: () => isStale(get().kse100 ?? undefined, CACHE_TTL.KSE100),
  isSectorStale: () => isStale(get().sectorPerformance ?? undefined, CACHE_TTL.SECTOR),

  getQuote: (symbol) => get().quotes[symbol]?.data ?? null,
}));
