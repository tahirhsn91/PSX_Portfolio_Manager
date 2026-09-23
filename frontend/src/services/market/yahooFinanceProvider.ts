/**
 * Yahoo Finance provider — browser-side direct implementation.
 *
 * Calls Yahoo Finance public APIs directly from the browser.
 * No backend proxy needed — Yahoo Finance allows CORS from browsers
 * and there is no API key to protect.
 *
 * Yahoo Finance blocks server-side (Docker/cloud) IPs, but browser
 * requests (with real Chrome TLS fingerprint) are accepted.
 *
 * PSX stocks:   SYMBOL.KA  (ENGRO.KA, HBL.KA, LUCK.KA …)
 * KSE-100 idx:  ^KSE
 * Data:         15-min delayed
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

const YF_BASE = 'https://query1.finance.yahoo.com';

// ── Symbol helpers ────────────────────────────────────────────────────────────

function toYF(sym: string): string {
  if (sym.startsWith('^') || sym.includes('.')) return sym;
  return `${sym}.KA`;
}

function fromYF(sym: string): string {
  return sym.replace(/\.KA$/i, '');
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function yfGet<T>(path: string): Promise<T> {
  const res = await fetch(`${YF_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Yahoo Finance: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface ChartResult {
  meta: Record<string, unknown>;
  timestamp?: number[];
  indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> };
}

async function fetchChart(yfSymbol: string, params: Record<string, string | number> = {}): Promise<ChartResult> {
  const qs = new URLSearchParams({ interval: '1d', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }).toString();
  const json = await yfGet<{ chart: { result: ChartResult[] } }>(`/v8/finance/chart/${encodeURIComponent(yfSymbol)}?${qs}`);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${yfSymbol}`);
  return result;
}

// ── Market status (derived from PKT clock) ────────────────────────────────────
// PSX hours: Monday–Friday, 09:30–15:30 PKT (UTC+5)

function deriveMarketStatus(): MarketStatus {
  const now = new Date();
  const pkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const day = pkt.getDay();
  const mins = pkt.getHours() * 60 + pkt.getMinutes();
  const OPEN = 9 * 60 + 30, CLOSE = 15 * 60 + 30;
  const isWeekday = day >= 1 && day <= 5;
  const isOpen = isWeekday && mins >= OPEN && mins < CLOSE;

  let nextOpen: string | null = null;
  let nextClose: string | null = null;

  if (isOpen) {
    const t = new Date(pkt); t.setHours(15, 30, 0, 0);
    nextClose = t.toISOString();
  } else {
    const t = new Date(pkt);
    if (isWeekday && mins < OPEN) { t.setHours(9, 30, 0, 0); }
    else { do { t.setDate(t.getDate() + 1); } while (t.getDay() === 0 || t.getDay() === 6); t.setHours(9, 30, 0, 0); }
    nextOpen = t.toISOString();
  }

  return { isOpen, nextOpen, nextClose, timezone: 'PKT' };
}

// ── Meta → StockQuote mapping ─────────────────────────────────────────────────

function mapMeta(psxSymbol: string, meta: Record<string, unknown>): StockQuote {
  const price     = (meta.regularMarketPrice as number) ?? 0;
  const prevClose = (meta.chartPreviousClose as number) ?? (meta.previousClose as number) ?? price;
  const change    = price - prevClose;
  const ts = meta.regularMarketTime
    ? new Date((meta.regularMarketTime as number) * 1000).toISOString()
    : new Date().toISOString();

  return {
    symbol:        psxSymbol.toUpperCase(),
    companyName:   (meta.longName as string) || (meta.shortName as string) || psxSymbol,
    currentPrice:  price,
    change:        (meta.regularMarketChange as number) ?? change,
    changePercent: (meta.regularMarketChangePercent as number) ?? (prevClose > 0 ? (change / prevClose) * 100 : 0),
    open:          (meta.regularMarketOpen as number)    ?? price,
    high:          (meta.regularMarketDayHigh as number) ?? price,
    low:           (meta.regularMarketDayLow as number)  ?? price,
    previousClose: prevClose,
    volume:        (meta.regularMarketVolume as number)  ?? 0,
    marketCap:     (meta.marketCap as number)            ?? 0,
    sector:        (meta.sector as string)               || 'Unknown',
    lastUpdated:   ts,
  };
}

// ── PSX blue-chips for sector aggregation ─────────────────────────────────────

const SECTORS: Array<{ sector: string; symbols: string[] }> = [
  { sector: 'Commercial Banks',      symbols: ['HBL', 'UBL', 'MCB', 'ABL', 'BAFL'] },
  { sector: 'Oil & Gas Exploration', symbols: ['OGDC', 'PPL', 'POL', 'MARI'] },
  { sector: 'Fertilizer',            symbols: ['ENGRO', 'FFC', 'FFBL', 'FATIMA'] },
  { sector: 'Cement',                symbols: ['LUCK', 'DGKC', 'CHCC', 'FCCL'] },
  { sector: 'Power Generation',      symbols: ['HUBC', 'KAPCO', 'KEL', 'NCPL'] },
  { sector: 'Oil & Gas Marketing',   symbols: ['PSO', 'APL', 'SHEL'] },
  { sector: 'Technology',            symbols: ['SYS', 'TRG', 'NETSOL'] },
  { sector: 'Textile',               symbols: ['NML', 'NCL', 'GATM'] },
];

// ── Provider class ────────────────────────────────────────────────────────────

// No constructor args — this provider is browser-direct (no proxy URL needed)
export class YahooFinanceProvider implements IMarketDataProvider {

  async getMarketStatus(): Promise<MarketStatus> {
    return deriveMarketStatus();
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const chart = await fetchChart(toYF(symbol), { range: '5d' });
    return mapMeta(symbol, chart.meta);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols.length) return [];
    // Try batch v7 quote endpoint first
    try {
      const syms = symbols.map(toYF).join(',');
      const json = await yfGet<{ quoteResponse: { result: Record<string, unknown>[] } }>(
        `/v7/finance/quote?symbols=${encodeURIComponent(syms)}`
      );
      const results = json.quoteResponse?.result ?? [];
      if (results.length > 0) {
        return results.map(q => mapMeta(fromYF(q.symbol as string), q));
      }
    } catch {
      // fall through to individual chart calls
    }
    const settled = await Promise.allSettled(symbols.map(s => this.getQuote(s)));
    return settled.filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled').map(r => r.value);
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    const chart = await fetchChart(toYF(symbol), { range: '1y' });
    const meta  = chart.meta;
    const base  = mapMeta(symbol, meta);

    return {
      ...base,
      week52High:         (meta.fiftyTwoWeekHigh as number)        ?? 0,
      week52Low:          (meta.fiftyTwoWeekLow as number)         ?? 0,
      peRatio:            (meta.trailingPE as number)              ?? null,
      eps:                (meta.epsTrailingTwelveMonths as number) ?? null,
      bookValue:          (meta.bookValue as number)               ?? null,
      dividendYield:      (meta.dividendYield as number) != null
                            ? (meta.dividendYield as number) * 100 : null,
      nextDividendDate:   null,
      nextDividendAmount: (meta.dividendRate as number)            ?? null,
      beta:               (meta.beta as number)                    ?? null,
      averageVolume:      (meta.averageDailyVolume3Month as number)
                            ?? (meta.averageDailyVolume10Day as number) ?? 0,
      description:        '',
    };
  }

  async getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]> {
    const p1 = Math.floor(new Date(from).getTime() / 1000);
    const p2 = Math.floor(new Date(to).getTime()   / 1000);

    const chart = await fetchChart(toYF(symbol), { period1: p1, period2: p2 });

    const timestamps = chart.timestamp ?? [];
    const ohlcv      = chart.indicators?.quote?.[0] ?? {};

    return timestamps
      .map((ts, i) => ({
        date:   new Date(ts * 1000).toISOString().split('T')[0],
        open:   ohlcv.open?.[i]   ?? 0,
        high:   ohlcv.high?.[i]   ?? 0,
        low:    ohlcv.low?.[i]    ?? 0,
        close:  ohlcv.close?.[i]  ?? 0,
        volume: ohlcv.volume?.[i] ?? 0,
      }))
      .filter(d => d.close > 0);
  }

  /**
   * Yahoo only carries the headline PSX index, so other index codes resolve to
   * `null` and the app renders "not tracked" for them.
   */
  async getIndex(symbol: string): Promise<IndexData | null> {
    return symbol.trim().toUpperCase() === 'KSE100' ? this.getKSE100() : null;
  }

  /**
   * No candle route in this provider: its daily history is the same series, so serve
   * candles from it using the requested bounds (a year back by default).
   */
  async getCandles(symbol: string, opts: CandleQuery = {}): Promise<HistoricalDataPoint[]> {
    const to = opts.to ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const from = opts.from ?? new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    return this.getHistoricalData(symbol, from, to);
  }

  async getKSE100(): Promise<KSE100Data> {
    const p1 = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
    const p2 = Math.floor(Date.now() / 1000);

    const chart = await fetchChart('^KSE', { period1: p1, period2: p2 });
    const meta  = chart.meta;

    const price     = (meta.regularMarketPrice as number) ?? 0;
    const prevClose = (meta.chartPreviousClose as number) ?? (meta.previousClose as number) ?? price;
    const timestamps = chart.timestamp ?? [];
    const ohlcv      = chart.indicators?.quote?.[0] ?? {};

    return {
      value:         price,
      change:        (meta.regularMarketChange as number)        ?? (price - prevClose),
      changePercent: (meta.regularMarketChangePercent as number) ?? (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0),
      open:          (meta.regularMarketOpen as number)          ?? price,
      high:          (meta.regularMarketDayHigh as number)       ?? price,
      low:           (meta.regularMarketDayLow as number)        ?? price,
      previousClose: prevClose,
      volume:        (meta.regularMarketVolume as number)        ?? 0,
      lastUpdated:   meta.regularMarketTime
        ? new Date((meta.regularMarketTime as number) * 1000).toISOString()
        : new Date().toISOString(),
      historicalData: timestamps
        .map((ts, i) => ({
          date:   new Date(ts * 1000).toISOString().split('T')[0],
          open:   ohlcv.open?.[i]   ?? 0,
          high:   ohlcv.high?.[i]   ?? 0,
          low:    ohlcv.low?.[i]    ?? 0,
          close:  ohlcv.close?.[i]  ?? 0,
          volume: ohlcv.volume?.[i] ?? 0,
        }))
        .filter(d => d.close > 0),
    };
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    const results: SectorPerformance[] = [];

    for (const { sector, symbols } of SECTORS) {
      try {
        const quotes = await this.getQuotes(symbols);
        if (!quotes.length) continue;

        const avgChange = quotes.reduce((s, q) => s + q.changePercent, 0) / quotes.length;
        // A quote whose market cap is unknown contributes nothing to the total
        // rather than being counted as zero (the field is nullable on StockQuote).
        const totalCap  = quotes.reduce((s, q) => s + (q.marketCap ?? 0), 0);
        const sorted    = [...quotes].sort((a, b) => b.changePercent - a.changePercent);

        results.push({
          sector,
          changePercent: avgChange,
          marketCap:     totalCap,
          stockCount:    quotes.length,
          topGainer:     sorted[0]?.symbol ?? '',
          topLoser:      sorted[sorted.length - 1]?.symbol ?? '',
        });
      } catch {
        // skip sector on error
      }
    }

    return results;
  }

  async searchCompanies(query: string): Promise<PSXCompany[]> {
    const json = await yfGet<{ quotes?: Array<Record<string, unknown>> }>(
      `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true`
    );

    return (json.quotes ?? [])
      .filter(r => r.exchange === 'KAR' || String(r.symbol ?? '').toUpperCase().endsWith('.KA'))
      .slice(0, 20)
      .map(r => ({
        symbol:       fromYF(String(r.symbol ?? '')),
        name:         String(r.longname ?? r.shortname ?? r.symbol ?? ''),
        sector:       String(r.sector ?? 'Unknown'),
        marketCap:    0,
        listedShares: 0,
      }));
  }
}
