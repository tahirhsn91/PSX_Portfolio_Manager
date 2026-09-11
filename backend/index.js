/**
 * PSX Portfolio Manager — Market Data Proxy
 *
 * Two data providers available:
 *
 *   1. Yahoo Finance  (default — FREE, no API key)
 *      Routes: GET /api/yf/*
 *      Powered by `yahoo-finance2` npm package.
 *      Pakistani stocks use the .KA suffix (ENGRO.KA, HBL.KA …)
 *      Data is 15-min delayed.
 *
 *   2. Capital Stake  (paid — set CAPITALSTAKE_API_KEY to activate)
 *      Routes: GET /api/cs/*  → passthrough to https://csapis.com/3.0/*
 *      Real-time PSX data.
 *
 * Environment variables:
 *   PROXY_PORT             — port to listen on (default: 4000)
 *   ALLOWED_ORIGIN         — CORS origin (default: http://localhost:3000)
 *   CAPITALSTAKE_API_KEY   — only needed for the /api/cs/* routes
 *
 * Routes:
 *   GET /health                    — liveness probe
 *   GET /api/yf/quote/:symbol      — single quote
 *   GET /api/yf/quotes             — batch quotes (?symbols=A,B,C)
 *   GET /api/yf/detail/:symbol     — full stock detail
 *   GET /api/yf/historical/:symbol — OHLCV history (?from=YYYY-MM-DD&to=YYYY-MM-DD)
 *   GET /api/yf/kse100             — KSE-100 index + 1-year history
 *   GET /api/yf/sectors            — sector performance
 *   GET /api/yf/market-status      — is PSX open right now?
 *   GET /api/yf/search             — company search (?q=query)
 *   GET /api/cs/*                  — Capital Stake passthrough (requires API key)
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const yf      = require('./providers/yahooFinance');

const app = express();

// ── Configuration ─────────────────────────────────────────────────────────────

const PORT           = parseInt(process.env.PROXY_PORT || '4000', 10);
const CS_BASE_URL    = 'https://csapis.com/3.0';
const CS_API_KEY     = process.env.CAPITALSTAKE_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
// PSX Scraper URL — use host.docker.internal on Docker Desktop (Windows/Mac).
// Override via PSX_SCRAPER_URL env var if the scraper is on a different host.
const PSX_SCRAPER_URL = (process.env.PSX_SCRAPER_URL || 'http://host.docker.internal:4001').replace(/\/$/, '');

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'HEAD', 'POST'],  // POST needed for PSX scraper auto-add endpoint
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleError(res, err, context = '') {
  console.error(`[proxy] error${context ? ' (' + context + ')' : ''}: ${err.message}`);
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ error: 'provider_error', message: err.message });
}

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    providers: {
      psxScraper:   `proxy → ${PSX_SCRAPER_URL}`,
      yahooFinance: 'active (no key required)',
      capitalStake: CS_API_KEY ? 'configured' : 'not configured',
    },
    timestamp: new Date().toISOString(),
  });
});

// ── Yahoo Finance routes ──────────────────────────────────────────────────────

// GET /api/yf/market-status
app.get('/api/yf/market-status', (_req, res) => {
  try {
    res.json(yf.getMarketStatus());
  } catch (err) {
    handleError(res, err, 'market-status');
  }
});

// GET /api/yf/quote/:symbol
app.get('/api/yf/quote/:symbol', async (req, res) => {
  try {
    const data = await yf.getQuote(req.params.symbol.toUpperCase());
    res.json(data);
  } catch (err) {
    handleError(res, err, `quote/${req.params.symbol}`);
  }
});

// GET /api/yf/quotes?symbols=ENGRO,HBL,LUCK
app.get('/api/yf/quotes', async (req, res) => {
  const raw = req.query.symbols || '';
  const symbols = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) {
    return res.status(400).json({ error: 'missing_param', message: 'symbols query param is required' });
  }
  try {
    const data = await yf.getQuotes(symbols);
    res.json(data);
  } catch (err) {
    handleError(res, err, 'quotes');
  }
});

// GET /api/yf/detail/:symbol
app.get('/api/yf/detail/:symbol', async (req, res) => {
  try {
    const data = await yf.getStockDetail(req.params.symbol.toUpperCase());
    res.json(data);
  } catch (err) {
    handleError(res, err, `detail/${req.params.symbol}`);
  }
});

// GET /api/yf/historical/:symbol?from=2024-01-01&to=2025-01-01
app.get('/api/yf/historical/:symbol', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: 'missing_param', message: '"from" and "to" query params are required (YYYY-MM-DD)' });
  }
  try {
    const data = await yf.getHistoricalData(req.params.symbol.toUpperCase(), from, to);
    res.json(data);
  } catch (err) {
    handleError(res, err, `historical/${req.params.symbol}`);
  }
});

// GET /api/yf/kse100
app.get('/api/yf/kse100', async (_req, res) => {
  try {
    const data = await yf.getKSE100();
    res.json(data);
  } catch (err) {
    handleError(res, err, 'kse100');
  }
});

// GET /api/yf/sectors
app.get('/api/yf/sectors', async (_req, res) => {
  try {
    const data = await yf.getSectorPerformance();
    res.json(data);
  } catch (err) {
    handleError(res, err, 'sectors');
  }
});

// GET /api/yf/search?q=engro
app.get('/api/yf/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'missing_param', message: '"q" query param is required' });
  }
  try {
    const data = await yf.searchCompanies(q);
    res.json(data);
  } catch (err) {
    handleError(res, err, `search?q=${q}`);
  }
});

// ── PSX Scraper proxy ─────────────────────────────────────────────────────────
//
// Forwards /api/psx/* → PSX_SCRAPER_URL/* (default: http://host.docker.internal:4001)
//
// This proxy exists to avoid CORS issues — the scraper doesn't need CORS headers
// because the browser only talks to this proxy (same origin as the frontend requests
// via http://localhost:4000).
//
// Route mapping example:
//   GET  /api/psx/api/v1/stocks/FFC  →  GET  http://host.docker.internal:4001/api/v1/stocks/FFC
//   POST /api/psx/api/v1/stocks      →  POST http://host.docker.internal:4001/api/v1/stocks
//   GET  /api/psx/api/v1/search?q=ff →  GET  http://host.docker.internal:4001/api/v1/search?q=ff

app.all('/api/psx/*', async (req, res) => {
  // req.params[0] = everything after /api/psx/
  const subpath = '/' + req.params[0];
  const qs = new URLSearchParams(req.query).toString();
  const url = `${PSX_SCRAPER_URL}${subpath}${qs ? '?' + qs : ''}`;

  console.log(`[psx] → ${req.method} ${url}`);

  try {
    const fetchOpts = {
      method: req.method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    };
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(url, fetchOpts);
    const body = await upstream.text();
    res.status(upstream.status)
       .set('Content-Type', 'application/json')
       .send(body);
  } catch (err) {
    const isConnErr = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT';
    if (isConnErr) {
      console.error(`[psx] Cannot reach scraper at ${PSX_SCRAPER_URL}: ${err.message}`);
      res.status(503).json({
        error: 'scraper_unavailable',
        message: `Cannot reach PSX Scraper at ${PSX_SCRAPER_URL}. Is it running?`,
      });
    } else {
      handleError(res, err, `psx${subpath}`);
    }
  }
});

// ── Capital Stake passthrough (kept for paid users) ───────────────────────────

app.get('/api/cs/*', async (req, res) => {
  if (!CS_API_KEY) {
    return res.status(503).json({
      error: 'no_api_key',
      message: 'CAPITALSTAKE_API_KEY is not configured. Use /api/yf/* routes instead (Yahoo Finance, free).',
    });
  }

  const csPath     = req.params[0];
  const qs         = new URLSearchParams(req.query).toString();
  const upstream   = `${CS_BASE_URL}/${csPath}${qs ? `?${qs}` : ''}`;

  console.log(`[cs] → GET ${upstream}`);

  try {
    const upstream_res = await fetch(upstream, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CS_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    const body = await upstream_res.text();
    res.status(upstream_res.status).set('Content-Type', 'application/json').send(body);
  } catch (err) {
    handleError(res, err, `cs/${csPath}`);
  }
});

// ── 404 fallback ──────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxy] PSX Market Data Proxy on port ${PORT}`);
  console.log(`[proxy] PSX Scraper proxy: ${PSX_SCRAPER_URL} (set PSX_SCRAPER_URL to override)`);
  console.log(`[proxy] Yahoo Finance provider: active (no API key needed)`);
  console.log(`[proxy] Capital Stake provider: ${CS_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`[proxy] CORS allowed origin: ${ALLOWED_ORIGIN}`);
});
