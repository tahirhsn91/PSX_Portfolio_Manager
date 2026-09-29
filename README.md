# PSX Portfolio Manager

A production-ready, client-side Pakistan Stock Exchange (PSX) portfolio management application built with React 19, TypeScript, Vite, TailwindCSS, and shadcn/ui.

---

## Features

- **Multiple Portfolios** — Create, edit, duplicate, and delete unlimited portfolios
- **Holdings Management** — Track shares, average cost, purchase date, and dividend income
- **Live Dashboard** — Total investment, current value, today's P&L, best/worst performers
- **Charts** — Allocation pie, portfolio value area, sector bar, KSE100 comparison, stock price with support/resistance
- **KSE-100 Comparison** — Portfolio vs index performance side-by-side
- **Stock Details** — Current price, 52W high/low, P/E, dividend yield, upcoming dividend
- **Prediction Engine** — Rule-based support/resistance, price targets, momentum, dividend forecast
- **Market Overview** — Top gainers/losers, sector performance, full company list
- **Search** — Autocomplete search by company name or ticker
- **Dark / Light / System theme**
- **LocalStorage persistence** — All data survives page refreshes
- **Export / Import** — JSON backup and restore

---

## Quick Start

```bash
# 1. Clone / navigate to this folder
cd PSX_Portfolio_Manager

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev

# The app opens at http://localhost:3000
```

---

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 19 |
| Language | TypeScript 5 |
| Build Tool | Vite 6 |
| Styling | TailwindCSS 3 + shadcn/ui |
| Routing | React Router 7 |
| State | Zustand 5 (with persist) |
| Data Fetching | TanStack Query 5 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Date Utilities | date-fns |

---

## Project Structure

```
src/
├── App.tsx                   # Root component + router
├── main.tsx                  # Entry point
├── index.css                 # Tailwind + CSS variables (theme tokens)
│
├── types/                    # TypeScript domain types
│   ├── portfolio.types.ts    # Portfolio, Holding, DividendRecord, metrics
│   ├── market.types.ts       # StockQuote, StockDetail, KSE100, IMarketDataProvider
│   └── prediction.types.ts   # StockPrediction, signals, IPredictionEngine
│
├── constants/
│   ├── app.constants.ts      # Storage keys, chart colors, market hours, technical params
│   ├── routes.ts             # Route paths + path builder helpers
│   └── psx-companies.ts      # 60+ curated PSX companies for autocomplete
│
├── store/                    # Zustand stores
│   ├── portfolioStore.ts     # CRUD for portfolios, holdings, dividends
│   ├── marketStore.ts        # Quote cache by symbol
│   └── uiStore.ts            # Theme, settings, notifications, sidebar state
│
├── services/
│   ├── market/
│   │   ├── marketDataService.ts    # Singleton wrapper (swap provider here)
│   │   └── mockMarketData.ts       # Realistic mock with seeded randomness
│   ├── storage/
│   │   └── localStorageService.ts  # Export/import JSON, storage info
│   └── prediction/
│       └── predictionEngine.ts     # Rule-based: RSI, MA, S/R, dividend forecast
│
├── hooks/                    # Custom React hooks
│   ├── useMarketData.ts      # TanStack Query wrappers for all market endpoints
│   ├── usePortfolio.ts       # Computed portfolio/holding metrics
│   ├── usePrediction.ts      # Prediction hook
│   └── useTheme.ts           # Apply dark/light/system theme to <html>
│
├── utils/
│   ├── formatters.ts         # formatCurrency, formatPercent, formatDate, etc.
│   ├── calculations.ts       # calculateHoldingMetrics, calculatePortfolioMetrics
│   └── validators.ts         # Zod schemas for all forms
│
├── components/
│   ├── ui/                   # shadcn/ui components (button, card, dialog, etc.)
│   └── shared/               # App-specific reusables
│       ├── MetricCard.tsx    # KPI card with optional trend indicator
│       ├── PLBadge.tsx       # Profit/Loss badge with color
│       ├── EmptyState.tsx    # Illustrated empty states
│       ├── ErrorBoundary.tsx # React error boundary
│       └── CompanySearch.tsx # Autocomplete company/ticker search
│
├── features/
│   ├── portfolio/            # Portfolio UI components
│   │   ├── PortfolioCard.tsx
│   │   ├── PortfolioForm.tsx
│   │   ├── HoldingForm.tsx
│   │   └── HoldingsTable.tsx
│   ├── charts/               # Recharts wrappers
│   │   ├── AllocationPieChart.tsx
│   │   ├── PortfolioValueChart.tsx
│   │   ├── SectorBarChart.tsx
│   │   ├── KSE100ComparisonChart.tsx
│   │   └── StockPriceChart.tsx
│   └── prediction/
│       └── PredictionPanel.tsx
│
├── layouts/
│   ├── MainLayout.tsx        # Shell: sidebar + header + <Outlet>
│   ├── Sidebar.tsx           # Collapsible nav sidebar
│   └── Header.tsx            # Page title + theme toggle + market status
│
└── pages/
    ├── Dashboard.tsx         # Aggregate KPIs, charts, KSE100 comparison
    ├── Portfolios.tsx        # Portfolio grid with CRUD
    ├── PortfolioDetail.tsx   # Holdings table + charts + KSE100
    ├── StockDetail.tsx       # Price chart + fundamentals + prediction
    ├── Market.tsx            # KSE100 banner + gainers/losers + sector bar
    └── Settings.tsx          # Theme, preferences, export/import, clear data
```

---

## Available Scripts

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Production build → dist/
npm run preview   # Preview the production build
npm run lint      # ESLint
npm run format    # Prettier
```

---

## Architecture Decisions

### Market Data is Pluggable

`src/services/market/marketDataService.ts` wraps any `IMarketDataProvider`. To switch from mock to real data:

1. Implement `IMarketDataProvider` (see `src/types/market.types.ts`)
2. Replace the constructor argument: `new MarketDataService(new YourRealProvider())`
3. Zero UI changes required

### Prediction Engine is Replaceable

`src/services/prediction/predictionEngine.ts` implements `IPredictionEngine`. Drop in an AI model by:

1. Implementing `IPredictionEngine`
2. Swapping the `predictionEngine` export

### State is Separated

- **Zustand** handles domain state (the portfolio cache, market cache, UI preferences)
- **TanStack Query** handles server-state (fetching, caching, background refresh)
- **Postgres** is the persistence layer for every portfolio, holding, buy and dividend,
  reached through the proxy API; the store holds what the server last said and replaces
  a portfolio with the server's answer after each mutation rather than editing its own copy
- **LocalStorage** holds only what belongs to this device — the theme, display
  preferences, and which portfolio you last had open

### The Palette is Shared with PSX_Scraper

Both apps paint from one palette. `src/theme/tokens.ts` carries the values PSX_Scraper defines in
its own `theme/tokens.ts` on `develop` — the green action colour, the four-step surface ladder, the
trend triples, the amber and blue status families, the focus ring and the two interaction washes —
and `src/index.css` holds the same colours as the custom properties Tailwind's utilities compile
against, in both themes. `src/theme/themeTokens.test.ts` reads the stylesheet and refuses a value
that has drifted from the tokens, so the two apps cannot end up a shade apart.

Two decisions worth knowing about:

- **Where the two stacks mean different things by one word, this app keeps its own name and points
  it at the palette's step.** shadcn's `accent` is the surface behind a hovered menu row, not the
  scraper's amber highlight — which is this app's `--warning` (in the scraper's own tokens the two
  are the same colour). Nothing is a second copy of a value: the older variable names (`surface-2`,
  `muted`, `overlay`, `input`, `secondary`, `accent`) alias the palette's.
- **The chart ladders are this app's own**, because the scraper has no chart palette, but each
  ladder is anchored on a shared token — the second rung of the profit ladder *is* the palette's
  `up.main` — and every rung is measured against the card it sits on.

Type, radius, motion and shadows are **not** shared: the scraper's `typeScale`, `radius`, `motion`
and `shadowsFor` are its MUI theme, and this app has its own answer for each. Copying values
nothing here reads would only create a second place for them to drift from.

---

## Accounts and storage

Every route that touches a portfolio requires a signed-in account, and a portfolio is
only ever reachable by the account that owns it. The session is an httpOnly cookie, so
no token is readable from JavaScript, and the account row is re-read on every request —
which is why suspending somebody takes effect on their next call rather than whenever a
token happens to expire.

Sign-up is closed once the instance has its first account. After that, an admin creates
accounts from **Users** in the sidebar: the server generates the first password, shows
it once so it can be handed over, stores only a bcrypt hash, and requires the account to
replace it at first sign-in.

A holding's quantity and average are derived from a buy log on the server rather than
stored beside it. Two consequences worth knowing:

- Editing a holding's quantity, average or date rewrites its `opening` entry so the log
  still adds up to what you asked for, and an edit the log cannot represent — below what
  the real purchases already account for — is refused with a `409` rather than applied
  half-way;
- Deleting the last entry of a holding's log removes the holding, because an empty log
  describes nothing.

---

## Backend Integration

The proxy in `backend/` is a working implementation of what `BACKEND_INTEGRATION.md`
describes: Express, Postgres, cookie sessions and role checks. That guide remains the
reference for swapping in a different stack (Node.js, .NET, Firebase, Supabase) behind
the same frontend — start there if you are replacing it rather than extending it.
