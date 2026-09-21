/**
 * PSX Scraper Provider — integrates with the custom PSX scraper API.
 *
 * The scraper runs locally (typically http://localhost:4001).
 * To avoid CORS issues the provider does NOT call the scraper directly from the
 * browser; instead it calls the backend proxy (http://localhost:4000/api/psx/*),
 * which in turn reaches the scraper via host.docker.internal:4001 inside Docker.
 *
 * URL flow:
 *   Browser → proxy (localhost:4000/api/psx/api/v1/...) → scraper (localhost:4001/api/v1/...)
 *
 * Configured via:
 *   VITE_PROXY_BASE_URL  — backend proxy URL  (default: http://localhost:4000)
 *   PSX_SCRAPER_URL      — scraper URL used by the backend  (default: host.docker.internal:4001)
 *
 * ── Data quality notes from live API probing ──────────────────────────────────
 * - `volume` can be negative in the live snapshot row (scraper bug) → Math.abs()
 * - `high` / `low` are null in historical rows  → fall back to `close`
 * - `close` === `currentPrice` in every row (scraper stores last known price as both)
 * - History is returned newest-first → reversed here so charts get oldest-first
 * - `previousClose` is derived as `currentPrice - change` (not in API response)
 * - Only tracked stocks return data; untracked symbols return 404
 *   → on 404 the provider auto-adds via POST /api/v1/stocks then returns a
 *     zeroed placeholder while the background sync job populates history
 * - The index is its own resource: `GET /api/v1/indices/KSE100` (+ `/history`),
 *   never `/api/v1/stocks/KSE100` — an index is not a listed company, so that route
 *   can only ever answer 404. `high`/`low` are null upstream (the index series has
 *   close/open/volume per day), so the index value is mirrored into them.
 *   When the scraper has no index API, `getKSE100()` resolves to `null` — never a
 *   fabricated aggregate — and stops probing for the rest of the page load.
 */

import type {
  IMarketDataProvider,
  StockQuote,
  StockDetail,
  HistoricalDataPoint,
  IndexData,
  CandleQuery,
  KSE100Data,
  SectorPerformance,
  MarketStatus,
  PSXCompany,
} from '@/types';
import { PSX_COMPANIES } from '@/constants';

// ── Raw API shapes ─────────────────────────────────────────────────────────────

interface ScraperPriceData {
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number | null;
  low: number | null;
  open: number | null;
  close: number;
  marketCap: number;
  lastTradeDate: string;
}

interface ScraperRatios {
  peRatio: number | null;
  pbRatio: number | null;
  dividendYield: number | null;
  beta: number | null;
  [key: string]: number | null | undefined;
}

interface ScraperFinancial {
  eps?: number | null;
  [key: string]: unknown;
}

interface ScraperDividend {
  amount?: number | null;
  date?: string | null;
  [key: string]: unknown;
}

interface ScraperStock {
  id: string;
  symbol: string;
  companyName: string;
  sector: string;
  price: ScraperPriceData;
  ratios: ScraperRatios;
  financials: ScraperFinancial[];
  dividends: ScraperDividend[];
  lastSync?: { status: string; [key: string]: unknown };
}

interface ScraperPriceRow {
  currentPrice: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
  lastTradeDate: string;
}

interface ScraperHistoryResponse {
  items: ScraperPriceRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * `/api/v1/stocks/:symbol/candles` — daily exchange-session candles, oldest first.
 *
 * `time` is the **session day in the exchange's timezone**, not a UTC timestamp. That is
 * why the comparison dates its points from here: `/history` rows carry a UTC timestamp,
 * which reads as the previous day for a session that closed late evening PKT.
 */
interface ScraperCandle {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

interface ScraperCandlesResponse {
  symbol: string;
  interval: string;
  range: string | null;
  count: number;
  from: string | null;
  to: string | null;
  items: ScraperCandle[];
}

/**
 * `/api/v1/indices/:symbol` (PSX_Scraper#16). `high`/`low` are always null — the
 * upstream index series carries close, open and volume per day only.
 */
interface ScraperIndexSummary {
  symbol: string;
  name: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  lastTradeDate: string | null;
}

interface ScraperListResponse {
  items: ScraperStock[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ScraperSearchItem {
  symbol: string;
  companyName: string;
  sector?: string;
  currentPrice?: number;
  [key: string]: unknown;
}

interface ScraperSearchResponse {
  results: ScraperSearchItem[];
}

// ── HTTP error ────────────────────────────────────────────────────────────────

class ScraperHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ScraperHttpError';
  }
}

/**
 * Session-scoped negative cache for the index endpoint, per index code.
 *
 * A scraper without `/api/v1/indices` answers 404 forever, and the index queries poll
 * every 60s — so without this, one missing endpoint produced a 404 per minute per
 * open tab. Per symbol, because an untracked index (the feed tracks KSE-100 only)
 * must not disable the ones it does serve. Module scope means it lives for one page
 * load: a reload re-probes, so the app starts showing an index the moment the
 * scraper tracks it, with no config to flip.
 */
const indexUnavailable = new Set<string>();

// ── Market status (derived from PKT clock) ────────────────────────────────────
// PSX trading hours: Monday–Friday, 09:30–15:30 PKT (UTC+5)

function deriveMarketStatus(): MarketStatus {
  const now = new Date();
  const pkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const day  = pkt.getDay();
  const mins = pkt.getHours() * 60 + pkt.getMinutes();
  const OPEN = 9 * 60 + 30;
  const CLOSE = 15 * 60 + 30;
  const isWeekday = day >= 1 && day <= 5;
  const isOpen    = isWeekday && mins >= OPEN && mins < CLOSE;

  let nextOpen: string | null  = null;
  let nextClose: string | null = null;

  if (isOpen) {
    const t = new Date(pkt);
    t.setHours(15, 30, 0, 0);
    nextClose = t.toISOString();
  } else {
    const t = new Date(pkt);
    if (isWeekday && mins < OPEN) {
      t.setHours(9, 30, 0, 0);
    } else {
      do { t.setDate(t.getDate() + 1); } while (t.getDay() === 0 || t.getDay() === 6);
      t.setHours(9, 30, 0, 0);
    }
    nextOpen = t.toISOString();
  }

  return { isOpen, nextOpen, nextClose, timezone: 'PKT' };
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapToStockQuote(stock: ScraperStock): StockQuote {
  const p      = stock.price ?? ({} as ScraperPriceData);
  const price  = p.currentPrice ?? 0;
  const change = p.change ?? 0;

  return {
    symbol:        stock.symbol,
    companyName:   stock.companyName ?? stock.symbol,
    currentPrice:  price,
    change,
    changePercent: p.changePercent ?? 0,
    open:          p.open          ?? price,
    high:          p.high          ?? price,
    low:           p.low           ?? price,
    previousClose: price - change,          // not in API — derived
    volume:        Math.abs(p.volume ?? 0), // can be negative (scraper bug)
    marketCap:     p.marketCap     ?? 0,
    sector:        stock.sector    ?? 'Unknown',
    lastUpdated:   p.lastTradeDate ?? new Date().toISOString(),
  };
}

function mapToHistoricalPoint(row: ScraperPriceRow): HistoricalDataPoint | null {
  const date  = row.lastTradeDate?.split('T')[0];
  if (!date) return null;

  const close = row.close ?? row.currentPrice ?? 0;
  if (close <= 0) return null;

  return {
    date,
    open:   row.open   ?? close,
    high:   row.high   ?? close, // null in historical rows — fall back to close
    low:    row.low    ?? close, // null in historical rows — fall back to close
    close,
    volume: Math.abs(row.volume ?? 0),
  };
}

/** Zeroed placeholder returned while the scraper syncs a newly-added stock. */
function placeholderQuote(symbol: string): StockQuote {
  return {
    symbol:        symbol.toUpperCase(),
    companyName:   symbol.toUpperCase(),
    currentPrice:  0,
    change:        0,
    changePercent: 0,
    open:          0,
    high:          0,
    low:           0,
    previousClose: 0,
    volume:        0,
    marketCap:     0,
    sector:        'Unknown',
    lastUpdated:   new Date().toISOString(),
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

/** How long the tracked-symbol list is reused before it's refetched. */
const TRACKED_CACHE_MS = 5 * 60_000;

/**
 * Scraper company names are the ticker prefixed onto the name
 * ("FFC Fauji Fertilizer Company Limited"). Drop that redundant prefix so the
 * autocomplete — and the form fields it fills — read like a company name.
 */
export function stripSymbolPrefix(name: string, symbol: string): string {
  const trimmed = (name ?? '').trim();
  const sym     = (symbol ?? '').trim();
  if (!trimmed || !sym || !trimmed.toLowerCase().startsWith(sym.toLowerCase())) return trimmed;
  const rest = trimmed.slice(sym.length).replace(/^[\s\-–—:]+/, '').trim();
  return rest || trimmed;
}

/**
 * Rank autocomplete candidates: exact symbol, symbol prefix, name prefix, then
 * substring, deduped by symbol (the best match for a symbol wins).
 */
export function rankCompanies(
  candidates: PSXCompany[],
  query: string,
  limit = 20,
): PSXCompany[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const best = new Map<string, { company: PSXCompany; score: number }>();
  for (const candidate of candidates) {
    const symbol = (candidate.symbol ?? '').trim();
    if (!symbol) continue;
    const sym  = symbol.toLowerCase();
    const name = (candidate.name ?? '').toLowerCase();

    let score: number;
    if (sym === q) score = 0;
    else if (sym.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (sym.includes(q)) score = 3;
    else if (name.includes(q)) score = 4;
    else continue;

    const seen = best.get(sym);
    if (!seen || score < seen.score) best.set(sym, { company: candidate, score });
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.company.symbol.localeCompare(b.company.symbol))
    .slice(0, limit)
    .map(entry => entry.company);
}

export class PSXScraperProvider implements IMarketDataProvider {
  /** Tracked-symbol list reuse, so typing in a search box doesn't refetch it. */
  private trackedCache: { at: number; rows: PSXCompany[] } | null = null;

  /**
   * @param proxyBase  Base URL of the backend proxy (e.g. http://localhost:4000).
   *                   All requests go to proxyBase/api/psx/api/v1/..., which the
   *                   backend proxy forwards to the PSX scraper.
   */
  constructor(private readonly proxyBase: string = 'http://localhost:4000') {}

  // ── HTTP helpers (proxy-based, no CORS concerns) ────────────────────────────

  private get base(): string {
    return `${this.proxyBase.replace(/\/$/, '')}/api/psx`;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as {
        message?: string; error?: { message?: string } | string;
      };
      const msg =
        (typeof body?.error === 'object' ? body.error?.message : body?.error as string | undefined) ??
        body?.message ??
        `HTTP ${res.status}`;
      throw new ScraperHttpError(res.status, `PSX Scraper: ${msg}`);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as {
        message?: string; error?: { message?: string } | string;
      };
      const msg =
        (typeof errBody?.error === 'object' ? errBody.error?.message : errBody?.error as string | undefined) ??
        errBody?.message ??
        `HTTP ${res.status}`;
      throw new ScraperHttpError(res.status, `PSX Scraper: ${msg}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Auto-track on 404 ───────────────────────────────────────────────────────

  private async ensureTracked(symbol: string): Promise<void> {
    try {
      await this.post('/api/v1/stocks', { symbol: symbol.toUpperCase() });
      console.info(`[psx-scraper] Auto-added "${symbol}" for tracking — data will sync in the background`);
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 409) return; // already tracked
      throw err;
    }
  }

  // ── IMarketDataProvider ─────────────────────────────────────────────────────

  async getMarketStatus(): Promise<MarketStatus> {
    return deriveMarketStatus();
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const sym = symbol.toUpperCase();
    try {
      const stock = await this.get<ScraperStock>(`/api/v1/stocks/${sym}`);
      return mapToStockQuote(stock);
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 404) {
        await this.ensureTracked(sym).catch(() => { /* best-effort */ });
        return placeholderQuote(sym);
      }
      throw err;
    }
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    if (!symbols.length) return [];
    const settled = await Promise.allSettled(symbols.map(s => this.getQuote(s)));
    return settled
      .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  async getStockDetail(symbol: string): Promise<StockDetail> {
    const sym = symbol.toUpperCase();

    let stock: ScraperStock;
    let history: ScraperHistoryResponse | null = null;

    try {
      [stock, history] = await Promise.all([
        this.get<ScraperStock>(`/api/v1/stocks/${sym}`),
        this.get<ScraperHistoryResponse>(`/api/v1/stocks/${sym}/history?range=1Y&limit=252`).catch(() => null),
      ]);
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 404) {
        await this.ensureTracked(sym).catch(() => { /* best-effort */ });
        return {
          ...placeholderQuote(sym),
          week52High: 0, week52Low: 0,
          peRatio: null, eps: null, bookValue: null,
          dividendYield: null, nextDividendDate: null, nextDividendAmount: null,
          beta: null, averageVolume: 0, description: '',
        };
      }
      throw err;
    }

    const base = mapToStockQuote(stock);
    const r    = stock.ratios     ?? ({} as ScraperRatios);
    const fin  = stock.financials?.[0] ?? {};
    const div  = stock.dividends?.[0]  ?? {};

    // Compute 52-week stats from history (history is newest-first)
    const closes = (history?.items ?? [])
      .map(row => row.close ?? row.currentPrice ?? 0)
      .filter(c => c > 0);

    const week52High = closes.length ? Math.max(...closes) : base.currentPrice;
    const week52Low  = closes.length ? Math.min(...closes) : base.currentPrice;

    // Average daily volume over the available history window
    const volumes = (history?.items ?? [])
      .map(row => Math.abs(row.volume ?? 0))
      .filter(v => v > 0);
    const averageVolume = volumes.length
      ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length)
      : 0;

    return {
      ...base,
      week52High,
      week52Low,
      peRatio:            r.peRatio ?? null,
      eps:                (fin.eps as number | null | undefined) ?? null,
      bookValue:          null,
      dividendYield:      r.dividendYield ?? null,  // already a percentage
      nextDividendDate:   (div.date as string | null | undefined) ?? null,
      nextDividendAmount: (div.amount as number | null | undefined) ?? null,
      beta:               r.beta ?? null,
      averageVolume,
      description:        '',
    };
  }

  async getHistoricalData(symbol: string, from: string, to: string): Promise<HistoricalDataPoint[]> {
    const sym = symbol.toUpperCase();
    const qs  = new URLSearchParams({ from, to, limit: '2000' }).toString();

    let data: ScraperHistoryResponse;
    try {
      data = await this.get<ScraperHistoryResponse>(`/api/v1/stocks/${sym}/history?${qs}`);
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 404) {
        await this.ensureTracked(sym).catch(() => { /* best-effort */ });
        return [];
      }
      throw err;
    }

    return (data.items ?? [])
      .reverse()                         // API: newest-first → charts need oldest-first
      .map(mapToHistoricalPoint)
      .filter((d): d is HistoricalDataPoint => d !== null);
  }

  /**
   * Daily candles for a symbol, oldest first — the feed's own chart series.
   *
   * Candle rows are stamped with the exchange session day (the scraper reads the trade
   * date in the exchange's timezone), so points don't drift the way `/history` rows do
   * when they're read as UTC. Open/high/low/volume can be null on a thin session; they
   * fall back to the close rather than a fabricated 0. A 404 means the feed doesn't hold
   * the symbol yet — we ask it to track it and report no history.
   */
  async getCandles(symbol: string, opts: CandleQuery = {}): Promise<HistoricalDataPoint[]> {
    const sym = symbol.toUpperCase();
    const params = new URLSearchParams();
    if (opts.range) params.set('range', opts.range);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);

    let data: ScraperCandlesResponse;
    try {
      data = await this.get<ScraperCandlesResponse>(`/api/v1/stocks/${sym}/candles?${params.toString()}`);
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 404) {
        await this.ensureTracked(sym).catch(() => { /* best-effort */ });
        return [];
      }
      throw err;
    }

    return (data.items ?? [])
      .map((candle) => ({
        date:  candle.time,
        open:  candle.open  ?? candle.close,
        high:  candle.high  ?? candle.close,
        low:   candle.low   ?? candle.close,
        close: candle.close,
        volume: candle.volume ?? 0,
      }))
      .filter((d) => Number.isFinite(d.close) && d.close > 0);
  }

  async getKSE100(): Promise<KSE100Data | null> {
    return this.getIndex('KSE100');
  }

  /**
   * Any PSX index, by its PSX code (KSE100, KSE30, ALLSHR, KMI30, …).
   *
   * The scraper exposes indices as their own resource (PSX_Scraper#16):
   * `/api/v1/indices/{code}` + `/history`, in the same envelope as stock history.
   * Never ask for an index on the stock routes — an index is not a listed company,
   * so `/api/v1/stocks/KSE100` can only ever answer 404.
   */
  async getIndex(symbol: string): Promise<IndexData | null> {
    const symbol_ = symbol.trim().toUpperCase();
    if (indexUnavailable.has(symbol_)) return null;

    try {
      const [summary, history] = await Promise.all([
        this.get<ScraperIndexSummary>(`/api/v1/indices/${symbol_}`),
        this.get<ScraperHistoryResponse>(`/api/v1/indices/${symbol_}/history?range=1Y&limit=252`).catch(() => null),
      ]);

      const value  = summary.value ?? 0;
      const change = summary.change ?? 0;

      const historicalData = (history?.items ?? [])
        .reverse()                         // API: newest-first → charts need oldest-first
        .map(mapToHistoricalPoint)
        .filter((d): d is HistoricalDataPoint => d !== null);

      return {
        value,
        change,
        changePercent: summary.changePercent ?? 0,
        open:          summary.open          ?? value,
        // The index series carries no high/low (upstream provides close/open/volume
        // per day only), so mirror the value rather than reporting a fake 0.
        high:          summary.high          ?? value,
        low:           summary.low           ?? value,
        previousClose: summary.previousClose ?? value - change,
        volume:        Math.abs(summary.volume ?? 0),
        lastUpdated:   summary.lastTradeDate ?? new Date().toISOString(),
        historicalData,
      };
    } catch (err) {
      if (err instanceof ScraperHttpError && err.status === 404) {
        // No such index resource: a scraper predating /api/v1/indices, or this code
        // not tracked by the feed. Negative-cache just this code for the page load and
        // report "unavailable" — a made-up number (the old market-cap aggregate) is
        // worse than no number.
        indexUnavailable.add(symbol_);
        console.warn(`[psx-scraper] ${symbol_} is not available from this scraper — index shown as unavailable`);
        return null;
      }
      // Anything else (scraper down, 5xx, bad payload) is a real failure and must
      // surface as an error rather than a silent null.
      throw err;
    }
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    let list: ScraperListResponse;
    try {
      list = await this.get<ScraperListResponse>('/api/v1/stocks?limit=200');
    } catch {
      return [];
    }

    const stocks = list.items ?? [];
    if (!stocks.length) return [];

    // Group by sector
    const bySector = new Map<string, ScraperStock[]>();
    for (const s of stocks) {
      const sector   = s.sector ?? 'Unknown';
      const existing = bySector.get(sector) ?? [];
      existing.push(s);
      bySector.set(sector, existing);
    }

    const result: SectorPerformance[] = [];
    for (const [sector, members] of bySector.entries()) {
      const prices      = members.map(s => s.price ?? ({} as ScraperPriceData));
      const avgChange   = prices.reduce((s, p) => s + (p.changePercent ?? 0), 0) / prices.length;
      const totalCap    = prices.reduce((s, p) => s + (p.marketCap ?? 0), 0);
      const sorted      = [...members].sort(
        (a, b) => (b.price?.changePercent ?? 0) - (a.price?.changePercent ?? 0),
      );

      result.push({
        sector,
        changePercent: avgChange,
        marketCap:     totalCap,
        stockCount:    members.length,
        topGainer:     sorted[0]?.symbol ?? '',
        topLoser:      sorted[sorted.length - 1]?.symbol ?? '',
      });
    }

    return result.sort((a, b) => b.changePercent - a.changePercent);
  }

  /**
   * Symbol/name search for the autocomplete fields.
   *
   * The scraper's `/api/v1/search` is the intended source, but it answers 500 for
   * every query (its raw SQL carries an unresolved `<<<<<<<` merge marker) and
   * this used to swallow that failure into an empty list — which is why typing a
   * ticker offered nothing at all. A query now merges three sources and depends
   * on none of them alone:
   *
   *   1. the scraper's search endpoint (first choice, while it works)
   *   2. the tracked-stock list behind /api/v1/stocks (live data, 24 symbols)
   *   3. the app's curated PSX_COMPANIES catalogue (59 names, incl. untracked)
   */
  async searchCompanies(query: string): Promise<PSXCompany[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const [scraped, tracked] = await Promise.all([
      this.searchViaScraper(trimmed),
      this.trackedCompanies(),
    ]);

    return rankCompanies([...scraped, ...tracked, ...PSX_COMPANIES], trimmed);
  }

  /** The scraper's own search — best effort, `[]` whenever it's unavailable. */
  private async searchViaScraper(query: string): Promise<PSXCompany[]> {
    try {
      const data = await this.get<ScraperSearchResponse>(
        `/api/v1/search?q=${encodeURIComponent(query)}&limit=20`,
      );
      return (data.results ?? []).map(r => ({
        symbol:       r.symbol      ?? '',
        name:         r.companyName ?? r.symbol ?? '',
        sector:       r.sector      ?? 'Unknown',
        marketCap:    0,  // not in search results
        listedShares: 0,  // not in search results
      }));
    } catch {
      return [];
    }
  }

  /** Tracked symbols as companies, reused briefly so typing stays cheap. */
  private async trackedCompanies(): Promise<PSXCompany[]> {
    const now = Date.now();
    if (this.trackedCache && now - this.trackedCache.at < TRACKED_CACHE_MS) {
      return this.trackedCache.rows;
    }

    try {
      const list = await this.get<ScraperListResponse>('/api/v1/stocks?limit=200');
      const rows = (list.items ?? []).map(s => ({
        symbol:       s.symbol,
        name:         stripSymbolPrefix(s.companyName ?? '', s.symbol),
        sector:       s.sector ?? 'Unknown',
        marketCap:    s.price?.marketCap ?? 0,
        listedShares: 0,
      }));
      this.trackedCache = { at: now, rows };
      return rows;
    } catch {
      // Serve the last good list rather than emptying the dropdown.
      return this.trackedCache?.rows ?? [];
    }
  }
}
