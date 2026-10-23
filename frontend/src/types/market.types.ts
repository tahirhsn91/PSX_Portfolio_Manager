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

/** One row of the account's personal watchlist — a symbol tracked, not owned. */
export interface WatchlistItem {
  id: string;
  symbol: string;
  addedAt: string; // ISO timestamp
}

/** How often price has bounced off a level. 'strong' | 'moderate' | 'weak'. */
export type SupportResistanceStrength = 'strong' | 'moderate' | 'weak';

/** A support or resistance level derived from a symbol's own price history (§12). */
export interface SupportResistanceLevel {
  price: number;
  strength: SupportResistanceStrength;
  type: 'support' | 'resistance';
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
/**
 * One row of the market-wide sector board.
 *
 * `changePercent` is the feed's own average move for the sector that session.
 * Only the PSX scraper serves this board; providers without one omit
 * `getSectorPerformance`, and the service returns an empty list for them.
 */
export interface SectorPerformance {
  sector: string;
  changePercent: number;
  /** Number of stocks in the sector. */
  stockCount: number;
  /** Total market capitalisation, in PKR. */
  marketCap: number;
  advancers: number;
  decliners: number;
}

/**
 * One announced cash dividend from the market feed.
 *
 * Only `announcementDate` is reliably published: the ex-date, book closure and
 * payment date are null unless the feed carries them, and `status` is the feed's
 * own word ("unknown" when it does not say). Consumers must not infer a payment
 * date from the announcement.
 */
export interface DividendAnnouncement {
  symbol: string;
  companyName: string;
  amountPerShare: number;
  /** ISO date (yyyy-mm-dd) the announcement is dated. */
  announcementDate: string;
  exDate: string | null;
  bookClosure: string | null;
  paymentDate: string | null;
  status: string;
  price: number | null;
  yieldTtm: number | null;
}

/** Window for the dividend ledger. `from`/`to` compare against the announcement date. */
export interface DividendQuery {
  from?: string;
  to?: string;
  symbol?: string;
}

/** Window for an index's own history. The feed treats `to` as exclusive. */
export interface IndexHistoryQuery {
  from?: string;
  to?: string;
}

export interface IMarketDataProvider {
  getQuote(symbol: string): Promise<StockQuote>;
  getQuotes(symbols: string[]): Promise<StockQuote[]>;
  getStockDetail(symbol: string): Promise<StockDetail>;
  getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]>;
  /** Daily candles — the feed's own chart series, stamped with the exchange session day. */
  getCandles(symbol: string, opts?: CandleQuery): Promise<HistoricalDataPoint[]>;
  /** `null` means "this index isn't available from this provider" — consumers must handle it. */
  getIndex(symbol: string, opts?: IndexHistoryQuery): Promise<IndexData | null>;
  /** The headline index. Convenience wrapper over `getIndex('KSE100')`. */
  getKSE100(opts?: IndexHistoryQuery): Promise<KSE100Data | null>;
  getMarketStatus(): Promise<MarketStatus>;
  searchCompanies(query: string): Promise<PSXCompany[]>;
  /** Market-wide sector board. Optional: only providers with one implement it. */
  getSectorPerformance?(): Promise<SectorPerformance[]>;
  /** The dividend ledger. Optional: only the PSX scraper serves one. */
  getDividendLedger?(query: DividendQuery): Promise<DividendAnnouncement[]>;
}
