/**
 * Capital Stake Market Data Provider
 *
 * Implements IMarketDataProvider backed by the Capital Stake REST API,
 * which is the data engine behind the official PSX Data Portal (dps.psx.com.pk).
 *
 * All requests go through the local proxy server (server/index.js) so the
 * API key stays server-side and CORS is handled automatically.
 *
 * API docs  : https://www.capitalstake.com/docs/rest/api/stocks/intro
 * API base  : https://csapis.com/3.0/  (accessed via proxy → /api/cs/*)
 *
 * Endpoint mapping (Capital Stake → this provider):
 *   GET /market/quote/{symbol}            → getQuote()
 *   GET /market/quotes?symbols=A,B        → getQuotes()
 *   GET /company/profile/{symbol} +
 *       /market/key-metrics/{symbol}      → getStockDetail()
 *   GET /eod/{symbol}?from=&to=           → getHistoricalData()
 *   GET /market/index/KSE100 +
 *       /eod/KSE100                       → getKSE100()
 *   GET /sectors                          → getSectorPerformance()
 *   GET /market/status                    → getMarketStatus()
 *   GET /market/stocks?search={q}         → searchCompanies()
 */

import type {
  IMarketDataProvider,
  StockQuote,
  StockDetail,
  HistoricalDataPoint,
  KSE100Data,
  IndexData,
  SectorPerformance,
  MarketStatus,
  PSXCompany,
} from '@/types';

// ---------------------------------------------------------------------------
// Raw Capital Stake response shapes
// (partial — only fields we actually consume)
// ---------------------------------------------------------------------------

interface CSQuote {
  symbol: string;
  company?: string;
  name?: string;
  ldcp?: number;          // last day closing price
  current?: number;       // current / last traded price
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  change?: number;
  change_p?: number;      // change percent
  market_cap?: number;
  sector?: string;
  timestamp?: string;
}

interface CSCompanyProfile {
  symbol: string;
  company?: string;
  name?: string;
  sector?: string;
  description?: string;
  listed_shares?: number;
  market_cap?: number;
  week_52_high?: number;
  week_52_low?: number;
  pe_ratio?: number;
  eps?: number;
  book_value?: number;
  dividend_yield?: number;
  beta?: number;
  avg_volume?: number;
  next_dividend_date?: string;
  next_dividend_amount?: number;
}

interface CSKeyMetrics {
  pe_ratio?: number;
  eps?: number;
  book_value?: number;
  dividend_yield?: number;
  beta?: number;
  avg_volume?: number;
  week_52_high?: number;
  week_52_low?: number;
}

interface CSEODBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CSIndexData {
  index?: string;
  name?: string;
  value?: number;
  change?: number;
  change_p?: number;
  open?: number;
  high?: number;
  low?: number;
  prev_close?: number;
  volume?: number;
  timestamp?: string;
}

interface CSSector {
  sector: string;
  change_p?: number;
  market_cap?: number;
  stock_count?: number;
  top_gainer?: string;
  top_loser?: string;
}

interface CSMarketStatus {
  is_open: boolean;
  next_open?: string;
  next_close?: string;
}

interface CSStock {
  symbol: string;
  company?: string;
  name?: string;
  sector?: string;
  market_cap?: number;
  listed_shares?: number;
}

// ---------------------------------------------------------------------------
// Helper — call the proxy
// ---------------------------------------------------------------------------

export class CapitalStakeMarketDataProvider implements IMarketDataProvider {
  private readonly proxyBase: string;

  constructor(proxyBase: string = import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:4000') {
    this.proxyBase = proxyBase.replace(/\/$/, '');
  }

  // ── Internal fetch helper ──────────────────────────────────────────────────

  private async cs<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.proxyBase}/api/cs/${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Capital Stake API error ${res.status} on ${path}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── IMarketDataProvider implementation ────────────────────────────────────

  async getQuote(symbol: string): Promise<StockQuote> {
    // Docs: GET /market/quote/{symbol}
    const data = await this.cs<CSQuote>(`market/quote/${symbol}`);
    return mapQuote(data);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    // Docs: GET /market/quotes?symbols=ENGRO,LUCK,...
    const data = await this.cs<CSQuote[]>('market/quotes', {
      symbols: symbols.join(','),
    });
    return (Array.isArray(data) ? data : [data]).map(mapQuote);
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    // Docs: GET /company/profile/{symbol} (detailed) + /market/key-metrics/{symbol}
    const [profile, metrics] = await Promise.allSettled([
      this.cs<CSCompanyProfile>(`company/profile/${symbol}`),
      this.cs<CSKeyMetrics>(`market/key-metrics/${symbol}`),
    ]);

    const p = profile.status === 'fulfilled' ? profile.value : {} as CSCompanyProfile;
    const m = metrics.status === 'fulfilled' ? metrics.value : {} as CSKeyMetrics;

    // We still need a base quote for live price
    let quote: StockQuote;
    try {
      quote = await this.getQuote(symbol);
    } catch {
      // Fallback: synthesise quote from profile data if quote endpoint fails
      quote = {
        symbol,
        companyName: p.company ?? p.name ?? symbol,
        currentPrice: 0,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        previousClose: 0,
        volume: 0,
        marketCap: p.market_cap ?? 0,
        sector: p.sector ?? '',
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      ...quote,
      week52High: m.week_52_high ?? p.week_52_high ?? 0,
      week52Low: m.week_52_low ?? p.week_52_low ?? 0,
      peRatio: m.pe_ratio ?? p.pe_ratio ?? null,
      eps: m.eps ?? p.eps ?? null,
      bookValue: m.book_value ?? p.book_value ?? null,
      dividendYield: m.dividend_yield ?? p.dividend_yield ?? null,
      nextDividendDate: p.next_dividend_date ?? null,
      nextDividendAmount: p.next_dividend_amount ?? null,
      beta: m.beta ?? p.beta ?? null,
      averageVolume: m.avg_volume ?? p.avg_volume ?? 0,
      description: p.description ?? '',
    };
  }

  async getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]> {
    // Docs: GET /eod/{symbol}?from=YYYY-MM-DD&to=YYYY-MM-DD (unadjusted)
    const data = await this.cs<CSEODBar[]>(`eod/${symbol}`, { from, to });
    const bars = Array.isArray(data) ? data : [];
    return bars.map((b) => ({
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
  }

  /**
   * This provider only serves the headline index, so any other PSX index code is
   * reported as unavailable (`null`) and the app renders "not tracked" for it.
   */
  async getIndex(symbol: string): Promise<IndexData | null> {
    return symbol.trim().toUpperCase() === 'KSE100' ? this.getKSE100() : null;
  }

  async getKSE100(): Promise<KSE100Data> {
    // Docs: GET /market/index/KSE100 + GET /eod/KSE100?from=&to= for history
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const fromDate = oneYearAgo.toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const [indexData, histData] = await Promise.allSettled([
      this.cs<CSIndexData>('market/index/KSE100'),
      this.cs<CSEODBar[]>('eod/KSE100', { from: fromDate, to: toDate }),
    ]);

    const idx = indexData.status === 'fulfilled' ? indexData.value : {} as CSIndexData;
    const hist = histData.status === 'fulfilled' && Array.isArray(histData.value)
      ? histData.value
      : [];

    return {
      value: idx.value ?? 0,
      change: idx.change ?? 0,
      changePercent: idx.change_p ?? 0,
      open: idx.open ?? 0,
      high: idx.high ?? 0,
      low: idx.low ?? 0,
      previousClose: idx.prev_close ?? 0,
      volume: idx.volume ?? 0,
      lastUpdated: idx.timestamp ?? new Date().toISOString(),
      historicalData: hist.map((b) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
    };
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    // Docs: GET /sectors or GET /sector/overview
    const data = await this.cs<CSSector[]>('sectors');
    const sectors = Array.isArray(data) ? data : [];
    return sectors.map((s) => ({
      sector: s.sector,
      changePercent: s.change_p ?? 0,
      marketCap: s.market_cap ?? 0,
      stockCount: s.stock_count ?? 0,
      topGainer: s.top_gainer ?? '',
      topLoser: s.top_loser ?? '',
    }));
  }

  async getMarketStatus(): Promise<MarketStatus> {
    // Docs: GET /market/status
    const data = await this.cs<CSMarketStatus>('market/status');
    return {
      isOpen: Boolean(data?.is_open),
      nextOpen: data?.next_open ?? null,
      nextClose: data?.next_close ?? null,
      timezone: 'PKT',
    };
  }

  async searchCompanies(query: string): Promise<PSXCompany[]> {
    // Docs: GET /market/stocks?search={query}
    const data = await this.cs<CSStock[]>('market/stocks', { search: query });
    const stocks = Array.isArray(data) ? data : [];
    return stocks.map((s) => ({
      symbol: s.symbol,
      name: s.company ?? s.name ?? s.symbol,
      sector: s.sector ?? '',
      marketCap: s.market_cap ?? 0,
      listedShares: s.listed_shares ?? 0,
    }));
  }
}

// ---------------------------------------------------------------------------
// Mapping helper — CSQuote → StockQuote
// ---------------------------------------------------------------------------

function mapQuote(q: CSQuote): StockQuote {
  const currentPrice = q.current ?? q.ldcp ?? 0;
  const prevClose = q.ldcp ?? 0;
  const change = q.change ?? (currentPrice - prevClose);
  const changePercent = q.change_p ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);

  return {
    symbol: q.symbol ?? '',
    companyName: q.company ?? q.name ?? q.symbol ?? '',
    currentPrice,
    change,
    changePercent,
    open: q.open ?? 0,
    high: q.high ?? 0,
    low: q.low ?? 0,
    previousClose: prevClose,
    volume: q.volume ?? 0,
    marketCap: q.market_cap ?? 0,
    sector: q.sector ?? '',
    lastUpdated: q.timestamp ?? new Date().toISOString(),
  };
}
