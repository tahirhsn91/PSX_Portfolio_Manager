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

/**
 * A row of the list route (`/api/v1/stocks`) — **flattened**, unlike
 * `/api/v1/stocks/:symbol`: price fields sit on the item itself and there is no
 * `price` object and no absolute `change`. Reading `s.price.changePercent` off these
 * (as the sector aggregation did) yields `undefined`, which coerced to 0 and made
 * every sector report a 0.00% move.
 */
interface ScraperListItem {
  id?: string;
  symbol: string;
  companyName?: string;
  sector?: string;
  currentPrice?: number | null;
  changePercent?: number | null;
  volume?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  /** Not in the payload today (no symbol has a market cap); typed so it flows in
   *  the day the feed adds it, and `null` when absent rather than 0. */
  marketCap?: number | null;
  lastTradeDate?: string | null;
  lastSyncedAt?: string | null;
}

interface ScraperListResponse {
  items: ScraperListItem[];
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

/** The list route serves 200 rows a page; this bounds the walk if `totalPages` lies. */
const MAX_LIST_PAGES = 5;

/**
 * How long one walk of the tracked list is reused. The walk costs seconds on the feed
 * (its later pages take ~10s each), and the Market page asks for the same list twice
 * — once to rank the overview, once to average the sectors — so it is done once.
 */
const TRACKED_LIST_CACHE_MS = 60_000;

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
    // The feed omits open for most symbols and marketCap for every one of them.
    // Mirroring the price into them (the old behaviour) stated the close as the
    // day's high, low and open, and `?? 0` printed a market cap of zero.
    open:          p.open          ?? null,
    high:          p.high          ?? null,
    low:           p.low           ?? null,
    previousClose: price - change,          // not in API — derived
    // Can be negative upstream, but never invented: absent stays absent.
    volume:        p.volume == null ? null : Math.abs(p.volume),
    marketCap:     p.marketCap     ?? null,
    sector:        stock.sector    ?? 'Unknown',
    // No `?? now` fallback: stamping a quote with the current time claims the feed
    // just refreshed it. An empty string means "no timestamp from the feed", which
    // the session-day helper and RangeBar both treat as unknown.
    lastUpdated:   p.lastTradeDate ?? '',
    // A tracked symbol the feed serves without a usable price is unavailable, not
    // free: a 0 would flow into the holding's value and its return.
    priceAvailable: Number.isFinite(price) && price > 0,
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

/**
 * Returned while the feed has no such symbol (404 — untracked, or a ticker PSX has
 * renamed). It is explicitly NOT a quote: `priceAvailable: false`, and no timestamp,
 * because stamping "now" made an unknown symbol look like fresh data. Every consumer
 * branches on the flag; the zeros are never rendered.
 */
/**
 * The quote for a symbol the feed will not price.
 *
 * Every field it does not know is null, not 0: these values reach the screen, and the
 * page for an unavailable symbol used to state "Open Rs 0.00 / Previous Close Rs 0.00
 * / Day High Rs 0.00" — four numbers the exchange never sent. `priceAvailable: false`
 * is what the UI keys off; the nulls make a stray 0 impossible.
 */
function unavailableQuote(symbol: string): StockQuote {
  return {
    symbol:        symbol.toUpperCase(),
    companyName:   symbol.toUpperCase(),
    currentPrice:  0,
    change:        0,
    changePercent: 0,
    open:          null,
    high:          null,
    low:           null,
    previousClose: null,
    volume:        null,
    marketCap:     null,
    sector:        'Unknown',
    lastUpdated:   '',
    priceAvailable: false,
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
  /** Shared walk of the tracked list (see fetchAllTracked). */
  private trackedListCache: { at: number; items: ScraperListItem[] } | null = null;
  /** In-flight roster refresh, so a burst of keystrokes only starts one. */
  private trackedFetch: Promise<PSXCompany[]> | null = null;

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
        return unavailableQuote(sym);
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
          ...unavailableQuote(sym),
          // Nulls, not zeros: a 0 52-week range draws a bar from zero and "0"
          // average volume reads as a measured figure.
          week52High: null, week52Low: null,
          peRatio: null, eps: null, bookValue: null,
          dividendYield: null, nextDividendDate: null, nextDividendAmount: null,
          beta: null, averageVolume: null, description: '',
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
        // The index summary publishes value/change/changePercent/previousClose and
        // nothing else. Mirroring the value into open/high/low (the old behaviour)
        // stated the index's level as its own day high and low; the banner shows
        // "—" for what the feed did not send.
        open:          summary.open          ?? null,
        high:          summary.high          ?? null,
        low:           summary.low           ?? null,
        previousClose: summary.previousClose ?? value - change,
        volume:        summary.volume == null ? null : Math.abs(summary.volume),
        lastUpdated:   summary.lastTradeDate ?? '',
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

  /**
   * The feed's whole tracked list.
   *
   * The list route is served **alphabetically and paginated** (508 symbols, 200 a
   * page), so a single `limit=200` request returns A–F only. Ranking or averaging
   * that page looked plausible and was really a statement about the first fifth of
   * the market, so every whole-market read walks the pages.
   */
  private async fetchAllTracked(): Promise<ScraperListItem[]> {
    const now = Date.now();
    if (this.trackedListCache && now - this.trackedListCache.at < TRACKED_LIST_CACHE_MS) {
      return this.trackedListCache.items;
    }

    const pageSize = 200;
    const first = await this.get<ScraperListResponse>(`/api/v1/stocks?limit=${pageSize}&page=1`);
    const items = [...(first.items ?? [])];
    const totalPages = Math.min(first.totalPages ?? 1, MAX_LIST_PAGES);

    if (totalPages > 1) {
      // Fetched together, not one after another: the feed takes ~10s on its later
      // pages and this walk gates the Market page's list.
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          this.get<ScraperListResponse>(`/api/v1/stocks?limit=${pageSize}&page=${i + 2}`).catch(() => null),
        ),
      );
      for (const res of rest) items.push(...(res?.items ?? []));
    }

    this.trackedListCache = { at: now, items };
    return items;
  }

  /**
   * The feed's own most-traded tracked symbols, by volume.
   *
   * The Market overview used to rank a *bundled* catalogue by hardcoded market caps
   * (the feed publishes none), so its order was fiction that never changed. This
   * ranks what the feed actually traded, and falls back to an empty list — never to
   * the catalogue — so a caller can see the ranking is unavailable.
   */
  async getTopSymbols(limit = 20): Promise<string[]> {
    try {
      return (await this.fetchAllTracked())
        .filter((s) => Number.isFinite(s.currentPrice) && (s.currentPrice ?? 0) > 0)
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
        .slice(0, limit)
        .map((s) => s.symbol);
    } catch {
      return [];
    }
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    let stocks: ScraperListItem[];
    try {
      stocks = await this.fetchAllTracked();
    } catch {
      return [];
    }
    if (!stocks.length) return [];

    // Only members the feed prices take part in an average: averaging in a symbol
    // with no price would drag every sector's move toward zero.
    const priced = stocks.filter((s) => Number.isFinite(s.currentPrice) && (s.currentPrice ?? 0) > 0);
    if (!priced.length) return [];

    // Group by sector
    const bySector = new Map<string, ScraperListItem[]>();
    for (const s of priced) {
      const sector   = s.sector ?? 'Unknown';
      const existing = bySector.get(sector) ?? [];
      existing.push(s);
      bySector.set(sector, existing);
    }

    const result: SectorPerformance[] = [];
    for (const [sector, members] of bySector.entries()) {
      const changes     = members.map(s => s.changePercent).filter((c): c is number => typeof c === 'number');
      const avgChange   = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : 0;
      // The feed publishes no market cap for any symbol, so a sector total is null
      // rather than a sum of zeros pretending to be measured.
      const caps        = members.map(s => s.marketCap).filter((c): c is number => typeof c === 'number');
      const totalCap    = caps.length ? caps.reduce((a, b) => a + b, 0) : null;
      const sorted      = [...members].sort(
        (a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0),
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
   * Three sources, none of them load-bearing on its own:
   *
   *   1. the scraper's own `/api/v1/search` — ~10 ms once warm, the intended source
   *   2. the tracked-stock roster behind `/api/v1/stocks`
   *   3. the app's curated `PSX_COMPANIES` catalogue (59 names, incl. untracked ones), local
   *
   * The roster is the slow one — `GET /api/v1/stocks?limit=200` measures 4–11 s on the current
   * scraper — so this deliberately never *waits* on it: it's merged only when already cached,
   * and a miss starts a background refresh for the next search. Awaiting it (which the earlier
   * version did whenever its 5-minute cache lapsed) made a search take that long.
   */
  async searchCompanies(query: string): Promise<PSXCompany[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const tracked = this.cachedTrackedCompanies();
    const scraped = await this.searchViaScraper(trimmed);
    this.refreshTrackedInBackground();

    return rankCompanies([...scraped, ...tracked, ...PSX_COMPANIES], trimmed);
  }

  /** The roster we already hold — `[]` rather than a request when the cache has lapsed. */
  private cachedTrackedCompanies(): PSXCompany[] {
    const cache = this.trackedCache;
    return cache && Date.now() - cache.at < TRACKED_CACHE_MS ? cache.rows : [];
  }

  /** Refresh the roster for later searches without making the caller wait for it. */
  private refreshTrackedInBackground(): void {
    if (this.trackedFetch || this.cachedTrackedCompanies().length > 0) return;
    this.trackedFetch = this.trackedCompanies()
      .catch(() => [] as PSXCompany[])
      .finally(() => { this.trackedFetch = null; });
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
      const rows = (await this.fetchAllTracked()).map(s => ({
        symbol:       s.symbol,
        name:         stripSymbolPrefix(s.companyName ?? '', s.symbol),
        sector:       s.sector ?? 'Unknown',
        // Carried for the search list's shape only: the feed publishes no market cap
        // for any symbol, and the catalogue's own figures are used when it compiles
        // this list, never as a number shown to the user.
        marketCap:    s.marketCap ?? 0,
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