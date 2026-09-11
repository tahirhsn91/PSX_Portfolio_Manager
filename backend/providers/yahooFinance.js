/**
 * Yahoo Finance provider for PSX (Pakistan Stock Exchange) data.
 *
 * Uses Yahoo Finance's public v8 chart and v1 search APIs directly — no package,
 * no API key. Browser-like headers bypass the server-side rate limit that blocks
 * plain wget/axios requests.
 *
 * PSX stocks: SYMBOL.KA  (e.g. ENGRO.KA, HBL.KA, LUCK.KA)
 * KSE-100 index: ^KSE
 *
 * Data is 15-min delayed (standard Yahoo Finance free feed).
 */

'use strict';

const fetch = require('node-fetch');

// ── Constants ─────────────────────────────────────────────────────────────────

const YF_BASE = 'https://query1.finance.yahoo.com';

// Browser-like headers — required to bypass Yahoo's server-IP rate limit
const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Symbol helpers ────────────────────────────────────────────────────────────

function toYF(psxSymbol) {
  if (psxSymbol.startsWith('^') || psxSymbol.includes('.')) return psxSymbol;
  return `${psxSymbol}.KA`;
}

function fromYF(yfSymbol) {
  return yfSymbol.replace(/\.KA$/i, '');
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function yfGet(path) {
  const url = `${YF_BASE}${path}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const err = new Error(`Yahoo Finance HTTP ${res.status}: ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Fetch the v8 chart endpoint.
 * Use range= for relative windows ('2d', '1mo', '1y'), OR period1/period2 for
 * absolute date ranges (Unix seconds).  Don't mix them.
 */
async function fetchChart(yfSymbol, params = {}) {
  const qs = new URLSearchParams({ interval: '1d', ...params }).toString();
  const json = await yfGet(`/v8/finance/chart/${encodeURIComponent(yfSymbol)}?${qs}`);
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${yfSymbol}`);
  return result;
}

// ── Market status (derived from PKT clock) ────────────────────────────────────
// PSX trading hours: Monday–Friday, 09:30–15:30 PKT (UTC+5)

function getMarketStatus() {
  const now = new Date();
  const pkt = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const day     = pkt.getDay();
  const minutes = pkt.getHours() * 60 + pkt.getMinutes();
  const OPEN = 9 * 60 + 30, CLOSE = 15 * 60 + 30;
  const isWeekday = day >= 1 && day <= 5;
  const isOpen    = isWeekday && minutes >= OPEN && minutes < CLOSE;

  let nextOpen = null, nextClose = null;
  if (isOpen) {
    const t = new Date(pkt); t.setHours(15, 30, 0, 0);
    nextClose = t.toISOString();
  } else {
    const t = new Date(pkt);
    if (isWeekday && minutes < OPEN) {
      t.setHours(9, 30, 0, 0);
    } else {
      do { t.setDate(t.getDate() + 1); } while (t.getDay() === 0 || t.getDay() === 6);
      t.setHours(9, 30, 0, 0);
    }
    nextOpen = t.toISOString();
  }
  return { isOpen, nextOpen, nextClose, timezone: 'PKT' };
}

// ── Quote mapping ─────────────────────────────────────────────────────────────

function mapMeta(psxSymbol, meta) {
  const price    = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
  const change   = price - prevClose;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
  const ts = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  return {
    symbol:        psxSymbol.toUpperCase(),
    companyName:   meta.longName || meta.shortName || psxSymbol,
    currentPrice:  price,
    change:        meta.regularMarketChange ?? change,
    changePercent: meta.regularMarketChangePercent ?? changePct,
    open:          meta.regularMarketOpen  ?? price,
    high:          meta.regularMarketDayHigh ?? price,
    low:           meta.regularMarketDayLow  ?? price,
    previousClose: prevClose,
    volume:        meta.regularMarketVolume ?? 0,
    marketCap:     meta.marketCap ?? 0,
    sector:        meta.sector    || 'Unknown',
    lastUpdated:   ts,
  };
}

// ── Quote ─────────────────────────────────────────────────────────────────────

async function getQuote(psxSymbol) {
  const chart = await fetchChart(toYF(psxSymbol), { range: '5d' });
  return mapMeta(psxSymbol, chart.meta);
}

async function getQuotes(psxSymbols) {
  // Batch via v7/finance/quote (one request for all symbols)
  try {
    const syms = psxSymbols.map(toYF).join(',');
    const json = await yfGet(`/v7/finance/quote?symbols=${encodeURIComponent(syms)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,regularMarketVolume,marketCap,longName,shortName,sector`);
    const results = json.quoteResponse?.result ?? [];
    if (results.length > 0) {
      return results.map(q => mapMeta(fromYF(q.symbol), q));
    }
  } catch {
    // fall through to individual calls
  }
  // Fallback: individual chart calls in parallel
  const settled = await Promise.allSettled(psxSymbols.map(s => getQuote(s)));
  return settled.filter(r => r.status === 'fulfilled').map(r => r.value);
}

// ── Stock detail ──────────────────────────────────────────────────────────────

async function getStockDetail(psxSymbol) {
  // Fetch 1 year of chart data — meta has 52-week fields
  const chart = await fetchChart(toYF(psxSymbol), { range: '1y' });
  const meta  = chart.meta;
  const base  = mapMeta(psxSymbol, meta);

  return {
    ...base,
    week52High:        meta.fiftyTwoWeekHigh         ?? 0,
    week52Low:         meta.fiftyTwoWeekLow           ?? 0,
    peRatio:           meta.trailingPE                ?? null,
    eps:               meta.epsTrailingTwelveMonths   ?? null,
    bookValue:         meta.bookValue                 ?? null,
    dividendYield:     meta.dividendYield != null ? meta.dividendYield * 100 : null,
    nextDividendDate:  null,
    nextDividendAmount: meta.dividendRate             ?? null,
    beta:              meta.beta                      ?? null,
    averageVolume:     meta.averageDailyVolume3Month  ?? meta.averageDailyVolume10Day ?? 0,
    description:       '',
  };
}

// ── Historical data ───────────────────────────────────────────────────────────

async function getHistoricalData(psxSymbol, from, to) {
  const p1 = Math.floor(new Date(from).getTime() / 1000);
  const p2 = Math.floor(new Date(to).getTime()   / 1000);

  const chart = await fetchChart(toYF(psxSymbol), { period1: p1, period2: p2 });

  const timestamps = chart.timestamp || [];
  const ohlcv      = chart.indicators?.quote?.[0] || {};

  return timestamps
    .map((ts, i) => ({
      date:   new Date(ts * 1000).toISOString().split('T')[0],
      open:   ohlcv.open?.[i]   ?? 0,
      high:   ohlcv.high?.[i]   ?? 0,
      low:    ohlcv.low?.[i]    ?? 0,
      close:  ohlcv.close?.[i]  ?? 0,
      volume: ohlcv.volume?.[i] ?? 0,
    }))
    .filter(d => d.close > 0); // remove null/holiday rows
}

// ── KSE-100 ───────────────────────────────────────────────────────────────────

async function getKSE100() {
  const p1 = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
  const p2 = Math.floor(Date.now() / 1000);

  const chart = await fetchChart('^KSE', { period1: p1, period2: p2 });
  const meta  = chart.meta;

  const timestamps = chart.timestamp || [];
  const ohlcv      = chart.indicators?.quote?.[0] || {};

  const price    = meta.regularMarketPrice ?? 0;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;

  return {
    value:         price,
    change:        meta.regularMarketChange ?? (price - prevClose),
    changePercent: meta.regularMarketChangePercent ?? (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0),
    open:          meta.regularMarketOpen     ?? price,
    high:          meta.regularMarketDayHigh  ?? price,
    low:           meta.regularMarketDayLow   ?? price,
    previousClose: prevClose,
    volume:        meta.regularMarketVolume   ?? 0,
    lastUpdated:   meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
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

// ── Sector performance ────────────────────────────────────────────────────────

const SECTORS = [
  { sector: 'Commercial Banks',      symbols: ['HBL', 'UBL', 'MCB', 'ABL', 'BAFL'] },
  { sector: 'Oil & Gas Exploration', symbols: ['OGDC', 'PPL', 'POL', 'MARI'] },
  { sector: 'Fertilizer',            symbols: ['ENGRO', 'FFC', 'FFBL', 'FATIMA'] },
  { sector: 'Cement',                symbols: ['LUCK', 'DGKC', 'CHCC', 'FCCL'] },
  { sector: 'Power Generation',      symbols: ['HUBC', 'KAPCO', 'KEL', 'NCPL'] },
  { sector: 'Oil & Gas Marketing',   symbols: ['PSO', 'APL', 'SHEL'] },
  { sector: 'Technology',            symbols: ['SYS', 'TRG', 'NETSOL'] },
  { sector: 'Textile',               symbols: ['NML', 'NCL', 'GATM'] },
];

async function getSectorPerformance() {
  const results = [];
  for (const { sector, symbols } of SECTORS) {
    try {
      const quotes = await getQuotes(symbols);
      if (!quotes.length) continue;
      const avgChange  = quotes.reduce((s, q) => s + q.changePercent, 0) / quotes.length;
      const totalCap   = quotes.reduce((s, q) => s + q.marketCap, 0);
      const sorted     = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
      results.push({
        sector,
        changePercent: avgChange,
        marketCap:     totalCap,
        stockCount:    quotes.length,
        topGainer:     sorted[0]?.symbol ?? '',
        topLoser:      sorted[sorted.length - 1]?.symbol ?? '',
      });
    } catch (err) {
      console.warn(`[yf] sector "${sector}" skipped: ${err.message}`);
    }
  }
  return results;
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchCompanies(query) {
  const json = await yfGet(
    `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true`,
  );
  return (json.quotes || [])
    .filter(r => r.exchange === 'KAR' || (r.symbol || '').toUpperCase().endsWith('.KA'))
    .slice(0, 20)
    .map(r => ({
      symbol:       fromYF(r.symbol || ''),
      name:         r.longname || r.shortname || r.symbol || '',
      sector:       r.sector  || 'Unknown',
      marketCap:    0,
      listedShares: 0,
    }));
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  getQuote,
  getQuotes,
  getStockDetail,
  getHistoricalData,
  getKSE100,
  getSectorPerformance,
  getMarketStatus,
  searchCompanies,
};
