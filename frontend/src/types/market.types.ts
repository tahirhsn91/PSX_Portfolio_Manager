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

export interface KSE100Data {
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
  getKSE100(): Promise<KSE100Data>;
  getSectorPerformance(): Promise<SectorPerformance[]>;
  getMarketStatus(): Promise<MarketStatus>;
  searchCompanies(query: string): Promise<PSXCompany[]>;
}
