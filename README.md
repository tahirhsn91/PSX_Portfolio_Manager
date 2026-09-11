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

- **Zustand** handles domain state (portfolios, market cache, UI preferences)
- **TanStack Query** handles server-state (fetching, caching, background refresh)
- **LocalStorage** is the persistence layer (abstracted behind `Zustand persist` and `LocalStorageService`)

---

## Backend Integration

See `BACKEND_INTEGRATION.md` for detailed guide on connecting Node.js, .NET, Firebase, or Supabase.
