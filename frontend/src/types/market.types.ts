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
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap: number;
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
  week52High: number;
  week52Low: number;
  peRatio: number | null;
  eps: number | null;
  bookValue: number | null;
  dividendYield: number | null; // percentage
  nextDividendDate: string | null; // ISO date
  nextDividendAmount: number | null; // PKR per share
  beta: number | null;
  averageVolume: number;
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
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
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
  marketCap: number;
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
  getMarketStatus(): Promise<MarketStatus>;
  searchCompanies(query: string): Promise<PSXCompany[]>;
}