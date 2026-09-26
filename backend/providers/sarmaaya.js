/**
 * Sarmaaya.pk provider — the PSX tape as sarmaaya publishes it.
 *
 * Why this exists: the Market page's movers and its full list were ranked from the
 * PSX Scraper feed, whose tracked list is served alphabetically in three pages that
 * take ~10–16s each. The page therefore sat empty for ~30s — and stayed empty if any
 * one of those pages failed, because the provider swallows the error and returns [].
 * sarmaaya answers the whole market in two sub-second calls.
 *
 * What it reads (the public endpoints sarmaaya's own web client calls; robots.txt
 * allows crawling everything except one plan page):
 *
 *   GET beta-restapi.sarmaaya.pk/api/stocks/listing?page=1&limit=1000
 *              &valuation=Large Cap Stocks
 *        → 505 listed symbols: name, close, change, changePercent, session date.
 *          The `valuation` filter is the site's own "Large Cap Stocks" screen and is what
 *          makes each row carry `market_cap`; without it the same rows come back without
 *          the field. Measured: 0.67s median either way, and all 505 rows carry a value.
 *   GET beta-restapi.sarmaaya.pk/api/stocks/ticker?index=ALLSHR
 *        → 484 traded symbols: price, change, changePercentage, volume
 *
 * The two agree on price and change for every symbol they share (checked in the
 * verification harness), so the join is a plain symbol lookup: names and prices from
 * the listing, volume from the ticker — the listing publishes no volume, and the
 * ticker publishes no company name.
 *
 * Nothing is invented here. A field the source does not send (market cap, for one)
 * stays null and renders as an em dash upstream.
 *
 *   GET /api/sarmaaya/market   → one snapshot: gainers, losers, active + provenance
 */

'use strict';

const fetch = require('node-fetch');

// ── Constants ─────────────────────────────────────────────────────────────────

const API_BASE      = 'https://beta-restapi.sarmaaya.pk/api';
const SITE_URL      = 'https://sarmaaya.pk/stocks';
const API_HOST      = 'beta-restapi.sarmaaya.pk';

/** Same browser-like headers the site's own client sends. */
const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** How long a snapshot is served before the next request refreshes it. */
const TTL_MS = 60_000;
/** Upstream budget per call — the source answers in ~0.5s; 8s is already generous. */
const TIMEOUT_MS = 8_000;
/**
 * The listing's own "Large Cap Stocks" screen. Requested purely because it is the only
 * form of the listing that includes `market_cap` on every row.
 */
const VALUATION_FILTER = 'Large Cap Stocks';
/** The headline index whose session levels ride the snapshot. */
const INDEX_CODE = 'KSE100';
/** The broadest index the site publishes tickers for: 484 of the 505 listed symbols. */
const TICKER_INDEX = 'ALLSHR';
/** How many movers a snapshot keeps — the most any caller can ask for. */
const MAX_MOVERS = 50;

/** A finite number, or null. The source omits fields and sends nulls; neither is a zero. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function sarmaayaGet(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: HEADERS, timeout: TIMEOUT_MS });

  if (!res.ok) {
    const err = new Error(`sarmaaya.pk HTTP ${res.status} for ${path}`);
    err.status = res.status >= 500 ? 503 : 502;
    err.upstreamStatus = res.status;
    throw err;
  }

  let json;
  try {
    json = await res.json();
  } catch {
    const err = new Error(`sarmaaya.pk returned a non-JSON body for ${path}`);
    err.status = 502;
    throw err;
  }

  // The envelope is `{ success, message, response }`. A 200 with success:false is a
  // failure, and treating it as data would publish a shape the consumer cannot read.
  if (!json || json.success !== true || json.response == null) {
    const err = new Error(`sarmaaya.pk answered success:${json && json.success} for ${path}`);
    err.status = 502;
    throw err;
  }

  return json.response;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Join the two endpoints into the rows the Market page needs.
 * Both are keyed by PSX symbol; the listing decides the universe (a listed symbol
 * with no ticker row simply has no traded volume yet).
 */
async function fetchSnapshot() {
  const [listing, tickers, index] = await Promise.all([
    sarmaayaGet(`/stocks/listing?page=1&limit=1000&valuation=${encodeURIComponent(VALUATION_FILTER)}`),
    sarmaayaGet(`/stocks/ticker?index=${encodeURIComponent(TICKER_INDEX)}`),
    // The index's own session levels: close, high, low, volume, previous close. sarmaaya
    // publishes no *opening* level for an index anywhere — its index namespace has no
    // OHLC route, and /indices/price-history is daily closes only. Optional, so a
    // failure here costs the levels and not the lists.
    sarmaayaGet(`/indices/overview/${INDEX_CODE}`).catch(() => null),
  ]);

  const listed = Array.isArray(listing?.data) ? listing.data : [];
  const traded = Array.isArray(tickers) ? tickers : [];

  if (!listed.length) {
    const err = new Error('sarmaaya.pk listed no symbols');
    err.status = 502;
    throw err;
  }

  const bySymbol = new Map(listed.map((r) => [r.symbol, r]));
  const volumeBy = new Map(traded.filter((t) => t.symbol).map((t) => [t.symbol, t]));

  const rows = [];
  for (const [symbol, l] of bySymbol) {
    const t = volumeBy.get(symbol);
    rows.push({
      symbol,
      name:          l.name ?? symbol,
      price:         t?.price ?? l.close ?? null,
      change:        t?.change ?? l.change ?? null,
      changePercent: t?.changePercentage ?? l.changePercent ?? null,
      volume:        t?.volume ?? null,
      isShariah:     l.isShariah ?? t?.isShariah ?? null,
      // PKR. Null when the row has none, so the UI renders an em dash rather than a zero.
      // Cross-checked against the price: market_cap / close gives a whole share count
      // (OGDC 1,360,125,597,216 / 316.24 = 4,300,928,400 shares).
      marketCap:     num(l.market_cap),
    });
  }

  // The session the numbers belong to — the ticker's own date, not the clock: a
  // Saturday request returns Friday's session, which is the point.
  const sessionDate = (traded[0]?.date ?? listed[0]?.date ?? null)?.slice(0, 10) ?? null;

  // Null when the optional call failed or answered nothing — the banner then shows the
  // feed's own index reading, and its em dashes, rather than mixing the two.
  const levels = index && typeof index === 'object'
    ? {
        code:          index.symbol ?? INDEX_CODE,
        name:          index.name ?? 'KSE-100 Index',
        close:         num(index.close),
        change:        num(index.change),
        // Percent units, like every other row here: 0.16 means +0.16%.
        changePercent: num(index.changePercent),
        high:          num(index.high),
        low:           num(index.low),
        volume:        num(index.volume),
        previousClose: num(index.prevClose),
        updatedAt:     index.updatedAt ?? null,
        // The way sarmaaya timestamps a tape: its own session, not the clock's.
        sessionDate:   typeof index.updatedAt === 'string' ? index.updatedAt.slice(0, 10) : null,
      }
    : null;

  return { rows, sessionDate, listedCount: listed.length, tradedCount: traded.length, levels };
}

/** Sort a copy — never the array the caller handed us. */
function buildPayload(snapshot) {
  const { rows, sessionDate, listedCount, tradedCount, levels } = snapshot;

  // Only scrips that actually traded take part. A symbol with no ticker row has no
  // volume — it did not trade this session — and its day change is whatever the
  // listing last carried, which is where a corporate action (a capital reduction, a
  // face-value split) shows up as a −64.71% "biggest loser". That is not a market
  // move and it does not belong at the top of a movers list.
  const traded = rows.filter((r) => num(r.volume) !== null);
  if (traded.length !== tradedCount) {
    console.warn(`[sarmaaya] ${tradedCount - traded.length} of the ticker's symbols are not in the listing — dropped from the join`);
  }
  const priced = traded.filter((r) => num(r.changePercent) !== null);
  const gainers = priced.filter((r) => r.changePercent > 0).sort((a, b) => b.changePercent - a.changePercent);
  const losers  = priced.filter((r) => r.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent);
  const active  = [...traded].sort((a, b) => (num(b.volume) ?? -1) - (num(a.volume) ?? -1));

  return {
    source: {
      name:        'sarmaaya.pk',
      url:         SITE_URL,
      apiHost:     API_HOST,
      fetchedAt:   new Date().toISOString(),
      sessionDate,
    },
    // Counted over the traded set, so gainers + losers + flat === traded: the numbers
    // the caption prints add up to the universe it names.
    counts: {
      listed:   listedCount,
      traded:   traded.length,
      gainers:  gainers.length,
      losers:   losers.length,
      flat:     priced.length - gainers.length - losers.length,
      returned: active.length,
    },
    // The snapshot keeps the fullest movers the route can serve (see MAX_MOVERS);
    // the route trims to what the caller asked for, so one cached snapshot answers
    // every limit without refetching upstream.
    gainers: gainers.slice(0, MAX_MOVERS),
    losers:  losers.slice(0, MAX_MOVERS),
    active,
    // The KSE-100 banner's levels, from the same snapshot as the lists.
    index: levels,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cache = null;      // { at, payload }
let inflight = null;   // single-flight: a burst of readers starts one upstream pair

/**
 * The Market page's snapshot.
 *
 * Cached for {@link TTL_MS} with a single in-flight refresh, so N readers cost one
 * pair of upstream calls. If an upstream fails while a snapshot exists, the stale
 * one is served flagged `source.stale` rather than leaving the page empty — the
 * consumer says so instead of pretending the numbers are current.
 */
async function getMarket() {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.payload;
  if (inflight) return inflight;

  inflight = fetchSnapshot()
    .then((snapshot) => {
      cache = { at: Date.now(), payload: buildPayload(snapshot) };
      return cache.payload;
    })
    .catch((err) => {
      if (cache) {
        console.error(
          `[sarmaaya] refresh failed (${err.message}) — serving the ${Math.round((now - cache.at) / 1000)}s-old snapshot`,
        );
        return { ...cache.payload, source: { ...cache.payload.source, stale: true, staleReason: err.message } };
      }
      throw err;
    })
    .finally(() => { inflight = null; });

  return inflight;
}

/** Exposed for the verification harness — never called by a route. */
function clearCache() { cache = null; }

module.exports = { getMarket, clearCache, TICKER_INDEX, MAX_MOVERS, API_BASE, SITE_URL };
