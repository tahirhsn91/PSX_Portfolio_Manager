/**
 * Market Data Service — single access point for all market data.
 *
 * Architecture note: this service wraps any IMarketDataProvider.
 * To switch from mock to a real data feed:
 *   1. Implement IMarketDataProvider in a new file (e.g. psxApiProvider.ts)
 *   2. Swap the `provider` line below — zero UI changes required.
 */

import type {
  IMarketDataProvider,
  StockQuote,
  StockDetail,
  HistoricalDataPoint,
  KSE100Data,
  IndexData,
  CandleQuery,
  SectorPerformance,
  MarketStatus,
  PSXCompany,
} from '@/types';
import { MockMarketDataProvider } from './mockMarketData';
import { CapitalStakeMarketDataProvider } from './capitalStakeProvider';
import { YahooFinanceProvider } from './yahooFinanceProvider';
import { PSXScraperProvider } from './psxScraperProvider';

// ---------------------------------------------------------------------------
// Provider factory
//
// Controlled by the VITE_MARKET_PROVIDER env var:
//
//   "psx"          — Custom PSX Scraper API (best quality, self-hosted, free)
//                    Requires VITE_PSX_SCRAPER_URL pointing to the scraper.
//                    Only tracked symbols return data; untracked are auto-added.
//
//   "yahoo"        — Yahoo Finance (FREE, browser-direct, 15-min delayed)
//                    No API key needed. Coverage: all PSX-listed symbols.
//
//   "capitalstake" — Capital Stake API (paid; requires CAPITALSTAKE_API_KEY)
//
//   "mock"         — Deterministic seed data, no network calls (default)
//
// Recommended for production:
//   VITE_MARKET_PROVIDER=psx
//   VITE_PSX_SCRAPER_URL=http://localhost:4001
// ---------------------------------------------------------------------------

function createProvider(): IMarketDataProvider {
  const providerName = import.meta.env.VITE_MARKET_PROVIDER ?? 'mock';
  const proxyBase    = import.meta.env.VITE_PROXY_BASE_URL   ?? 'http://localhost:4000';
  const scraperBase  = import.meta.env.VITE_PSX_SCRAPER_URL  ?? 'http://localhost:4001';

  if (providerName === 'psx') {
    // PSX Scraper calls go through the backend proxy (proxyBase/api/psx/*) to avoid CORS issues.
    // The proxy forwards requests to the scraper via host.docker.internal inside Docker.
    // Only stocks tracked by the scraper return data; untracked symbols are auto-added
    // on first access and will populate after the background sync completes.
    console.info(`[market] Using PSX Scraper provider (via proxy: ${proxyBase}, scraper: ${scraperBase})`);
    return new PSXScraperProvider(proxyBase);
  }

  if (providerName === 'yahoo') {
    // Yahoo Finance is called directly from the browser — no proxy needed.
    // Yahoo Finance allows CORS from browsers; Docker/server IPs are blocked.
    console.info('[market] Using Yahoo Finance provider (browser-direct, 15-min delayed, no API key)');
    return new YahooFinanceProvider();
  }

  if (providerName === 'capitalstake') {
    console.info(`[market] Using Capital Stake live data provider (proxy: ${proxyBase})`);
    return new CapitalStakeMarketDataProvider(proxyBase);
  }

  console.info('[market] Using mock data provider (set VITE_MARKET_PROVIDER=psx for live PSX data)');
  return new MockMarketDataProvider();
}

class MarketDataService {
  private provider: IMarketDataProvider;

  constructor(provider: IMarketDataProvider) {
    this.provider = provider;
  }

  /** Hot-swap the data provider at runtime (e.g. when user connects a real API) */
  setProvider(provider: IMarketDataProvider): void {
    this.provider = provider;
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    return this.provider.getQuote(symbol.toUpperCase());
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols.length) return [];
    return this.provider.getQuotes(symbols.map((s) => s.toUpperCase()));
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    return this.provider.getStockDetail(symbol.toUpperCase());
  }

  async getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]> {
    return this.provider.getHistoricalData(symbol.toUpperCase(), from, to);
  }

  async getCandles(symbol: string, opts: CandleQuery = {}): Promise<HistoricalDataPoint[]> {
    return this.provider.getCandles(symbol, opts);
  }

  async getIndex(symbol: string): Promise<IndexData | null> {
    return this.provider.getIndex(symbol);
  }

  async getKSE100(): Promise<KSE100Data | null> {
    return this.provider.getKSE100();
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    return this.provider.getSectorPerformance();
  }

  /** The provider's most-active symbols — the Market overview's ranking source. */
  async getTopSymbols(limit = 20): Promise<string[]> {
    return this.provider.getTopSymbols(limit);
  }

  async getMarketStatus(): Promise<MarketStatus> {
    return this.provider.getMarketStatus();
  }

  async searchCompanies(query: string): Promise<PSXCompany[]> {
    return this.provider.searchCompanies(query);
  }
}

// Singleton instance — provider is chosen by VITE_MARKET_PROVIDER env var
export const marketDataService = new MarketDataService(createProvider());
