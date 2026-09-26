/**
 * Market data types.
 * Designed to be provider-agnostic — replace the data service without touching these types.
 */

export interface StockQuote {
  symbol: string;
  companyName: string;
  currentPrice: number; // PKR
  change: number; // absolute change from previous close
  changePercent: number;
  /**
   * Null where the feed does not publish the field. The scraper's payload omits
   * `open` for most stocks and `marketCap` for all of them, and no provider may
   * substitute a number: a mirrored price or a coerced 0 reads as real data
   * ("PKR 0.00" for a market cap the exchange never sent).
   */
  open: number | null;
  high: number | null;
  low: number | null;
  /** Derived from sent values where the feed omits it; null when there is no quote
   *  to derive it from (0 would print as a real "Rs 0.00" previous close). */
  previousClose: number | null;
  /** Null where the feed reports none (an unavailable symbol) — 0 would read as
   *  "no trades today" rather than "not reported". */
  volume: number | null;
  marketCap: number | null;
  sector: string;
  lastUpdated: string; // ISO timestamp
  /**
   * False when the feed cannot price this symbol (unknown or renamed ticker, or a
   * quote request that failed). Every numeric field above is then meaningless and
   * must never be rendered — the UI shows "unavailable" instead. Absent means
   * available, so providers that always price a symbol need no change.
   */
  priceAvailable?: boolean;
}

export interface StockDetail extends StockQuote {
  /** Null where the feed publishes no range or average (an untracked symbol, or one
   *  with no history) — a 0 would draw a range bar from zero and read as data. */
  week52High: number | null;
  week52Low: number | null;
  peRatio: number | null;
  eps: number | null;
  bookValue: number | null;
  dividendYield: number | null; // percentage
  nextDividendDate: string | null; // ISO date
  nextDividendAmount: number | null; // PKR per share
  beta: number | null;
  averageVolume: number | null;
  description: string;
}

export interface HistoricalDataPoint {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A market index reading plus its daily series — any PSX index, not just KSE-100. */
export interface IndexData {
  value: number;
  change: number;
  changePercent: number;
  /** Null where the feed's index summary omits them — it publishes value, change,
   *  changePercent and previousClose only. */
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number;
  volume: number | null;
  lastUpdated: string;
  historicalData: HistoricalDataPoint[];
}

/** The headline index's shape; kept as an alias so existing consumers read unchanged. */
export type KSE100Data = IndexData;

/** Range presets the feed's chart endpoints accept (its own range control's list). */
export type CandleRange = '1W' | '1M' | '6M' | '1Y' | '2Y' | '3Y' | '5Y' | 'MAX';

/**
 * Which sessions to ask for. `range` is a preset the feed resolves itself; `from`/`to`
 * are explicit bounds (the feed treats `to` as exclusive).
 */
export interface CandleQuery {
  range?: CandleRange;
  from?: string;
  to?: string;
}

export interface SectorPerformance {
  sector: string;
  changePercent: number;
  /** Null when no member of the sector has a published market cap — the feed sends
   *  none for any symbol, so this is null rather than a measured-looking 0. */
  marketCap: number | null;
  stockCount: number;
  topGainer: string;
  topLoser: string;
}

export interface MarketStatus {
  isOpen: boolean;
  nextOpen: string | null;
  nextClose: string | null;
  timezone: 'PKT'; // Pakistan Standard Time
}

export interface PSXCompany {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  listedShares: number;
}

// Market data provider interface — swap implementations without changing consumers
export interface IMarketDataProvider {
  getQuote(symbol: string): Promise<StockQuote>;
  getQuotes(symbols: string[]): Promise<StockQuote[]>;
  getStockDetail(symbol: string): Promise<StockDetail>;
  getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]>;
  /** Daily candles — the feed's own chart series, stamped with the exchange session day. */
  getCandles(symbol: string, opts?: CandleQuery): Promise<HistoricalDataPoint[]>;
  /** `null` means "this index isn't available from this provider" — consumers must handle it. */
  getIndex(symbol: string): Promise<IndexData | null>;
  /** The headline index. Convenience wrapper over `getIndex('KSE100')`. */
  getKSE100(): Promise<KSE100Data | null>;
  getSectorPerformance(): Promise<SectorPerformance[]>;
  /**
   * The provider's most-active tracked symbols, in the provider's own order — the
   * Market overview's list. A provider with no activity data returns its declared
   * universe rather than a fabricated ranking.
   */
  getTopSymbols(limit?: number): Promise<string[]>;
  getMarketStatus(): Promise<MarketStatus>;
  searchCompanies(query: string): Promise<PSXCompany[]>;
}

// ── sarmaaya.pk (a second source, for the Market page's lists) ────────────────

/**
 * One row of sarmaaya.pk's PSX tape — price, change, volume and market capitalisation,
 * for the session the source names.
 */
export interface SarmaayaRow {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  isShariah: boolean | null;
  /** PKR, as the source publishes it. Null when the row has none — never 0. */
  marketCap: number | null;
}

/** Where a snapshot came from, and which session its numbers belong to. */
export interface SarmaayaSource {
  name: string;
  url: string;
  apiHost: string;
  fetchedAt: string;
  /** The exchange session the numbers are from — not the clock: a Saturday read is Friday's. */
  sessionDate: string | null;
  /** True when an upstream refresh failed and an older snapshot is being served. */
  stale?: boolean;
  staleReason?: string;
}

export interface SarmaayaMarketSnapshot {
  source: SarmaayaSource;
  counts: {
    listed: number;
    traded: number;
    gainers: number;
    losers: number;
    flat: number;
    returned: number;
  };
  gainers: SarmaayaRow[];
  losers: SarmaayaRow[];
  /** Every symbol with a traded volume, most-traded first. */
  active: SarmaayaRow[];
}
