# Backend Integration Guide

This app is designed for zero-UI-change backend integration. The abstraction layers are already in place.

---

## 1. Market Data API

**File to change:** `src/services/market/marketDataService.ts`

### Step 1 — Implement the provider

```typescript
// src/services/market/psxApiProvider.ts
import type { IMarketDataProvider, StockQuote, StockDetail, ... } from '@/types';

export class PSXApiProvider implements IMarketDataProvider {
  constructor(private baseUrl: string, private apiKey: string) {}

  async getQuote(symbol: string): Promise<StockQuote> {
    const res = await fetch(`${this.baseUrl}/quotes/${symbol}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    const data = await res.json();
    // Map your API response to StockQuote shape
    return {
      symbol: data.ticker,
      currentPrice: data.last_price,
      change: data.price_change,
      changePercent: data.change_percent,
      // ...
    };
  }

  // Implement all other IMarketDataProvider methods
}
```

### Step 2 — Swap the provider (1 line change)

```typescript
// src/services/market/marketDataService.ts

// BEFORE (mock):
export const marketDataService = new MarketDataService(new MockMarketDataProvider());

// AFTER (real API):
export const marketDataService = new MarketDataService(
  new PSXApiProvider('https://api.yourdatavendor.com', import.meta.env.VITE_API_KEY)
);
```

That's it. All hooks, stores, and UI components stay unchanged.

---

## 2. Portfolio Storage (Node.js / .NET / Supabase)

**File to change:** Replace Zustand's `localStorage` persist with API calls.

### Option A — Node.js / Express backend

```typescript
// src/services/storage/apiStorageService.ts
import type { Portfolio } from '@/types';

class ApiStorageService {
  async getPortfolios(): Promise<Portfolio[]> {
    const res = await fetch('/api/portfolios', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    return res.json();
  }

  async createPortfolio(data: CreatePortfolioInput): Promise<Portfolio> {
    const res = await fetch('/api/portfolios', {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' }
    });
    return res.json();
  }

  // ... updatePortfolio, deletePortfolio, etc.
}
```

Then update `portfolioStore.ts` to call `apiStorageService` instead of relying on Zustand persist.

### Option B — Firebase Firestore

```typescript
import { collection, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase'; // your Firebase init

// Replace direct state mutations with Firestore calls + local state sync
const portfolioDoc = collection(db, `users/${userId}/portfolios`);
```

### Option C — Supabase

```typescript
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('portfolios')
  .select('*, holdings(*)')
  .eq('user_id', userId);
```

---

## 3. Authentication

Add a Zustand `authStore.ts`:

```typescript
// src/store/authStore.ts
import { create } from 'zustand';

interface AuthState {
  user: { id: string; email: string } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: null,
  login: async (email, password) => { /* call API */ },
  logout: () => set({ user: null, token: null }),
}));
```

Then wrap routes in an `AuthGuard` component:

```tsx
// src/components/shared/AuthGuard.tsx
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

---

## 4. Environment Variables

Create `.env.local` in the project root:

```bash
# Market data provider
VITE_MARKET_API_URL=https://api.yourdatavendor.com
VITE_MARKET_API_KEY=your_key_here

# Firebase (if used)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...

# Supabase (if used)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=...

# Backend API
VITE_API_BASE_URL=https://api.yourbackend.com
```

Access in code: `import.meta.env.VITE_API_BASE_URL`

---

## 5. Recommended Backend Schema (PostgreSQL / SQL Server)

```sql
CREATE TABLE portfolios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  name        VARCHAR(50) NOT NULL,
  description TEXT,
  color       CHAR(7) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE holdings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  company_name          VARCHAR(100) NOT NULL,
  symbol                VARCHAR(10) NOT NULL,
  sector                VARCHAR(100),
  shares                NUMERIC(12,4) NOT NULL,
  avg_purchase_price    NUMERIC(12,2) NOT NULL,
  purchase_date         DATE NOT NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE dividend_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id        UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  amount_per_share  NUMERIC(8,2) NOT NULL,
  total_amount      NUMERIC(14,2) NOT NULL,
  type              VARCHAR(10) CHECK (type IN ('cash','stock','bonus'))
);

CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX idx_holdings_symbol ON holdings(symbol);
CREATE INDEX idx_dividends_holding ON dividend_records(holding_id);
```

---

## 6. Real PSX Data Providers

| Provider | Notes |
|---|---|
| [PSX Official](https://dps.psx.com.pk) | Official data, manual scraping |
| [Mettis Global](https://mettis.com) | Commercial data vendor |
| [Yahoo Finance (yfinance)](https://finance.yahoo.com) | `ENGRO.KA` ticker format |
| [Alpha Vantage](https://www.alphavantage.co) | Has Pakistani stocks |
| Custom scraper | See `MockMarketDataProvider` for the interface shape |

---

## 7. What the shipped proxy implements

`backend/` is not a sketch of the above — it is a running implementation of it. The
contract it answers:

### Accounts (`/api/auth`, `/api/users`)

| Route | Who | What |
|---|---|---|
| `POST /api/auth/signup` | anyone, while the instance is empty | the first account, which becomes the admin |
| `POST /api/auth/login` | anyone | starts a session (httpOnly cookie) |
| `POST /api/auth/logout` | signed in | ends it |
| `GET /api/auth/me` | signed in | the account behind the session |
| `PATCH /api/auth/me` | signed in | display name, phone, timezone, preferences |
| `POST /api/auth/password` | signed in | change password; ends every other session |
| `GET /api/users` | admin | the roster, with portfolio **counts** only |
| `POST /api/users` | admin | create an account; returns its first password once |
| `PATCH /api/users/:id/status` | admin | suspend or reactivate |
| `PATCH /api/users/:id/role` | admin | promote or demote |
| `DELETE /api/users/:id` | admin | the deliberate path; suspension is the normal tool |

The server refuses the last admin's demotion, suspension or deletion, any self-targeting,
and any attempt to reach another account's portfolio — which answers `404`, the same as
a portfolio that does not exist.

### Portfolios (`/api/portfolios`)

| Route | What |
|---|---|
| `GET /api/portfolios`, `GET /api/portfolios/:id` | the account's portfolios |
| `POST`, `PATCH /:id`, `DELETE /:id`, `POST /:id/duplicate` | portfolio lifecycle |
| `POST /:id/holdings`, `PATCH /:id/holdings/:holdingId`, `DELETE /:id/holdings/:holdingId` | holdings |
| `POST /:id/holdings/:holdingId/buys`, `PATCH …/buys/:buyId`, `DELETE …/buys/:buyId` | the buy log |
| `POST …/dividends`, `DELETE …/dividends/:dividendId` | dividends |
| `GET /api/portfolios/export`, `POST /api/portfolios/import` | backup and restore |

Every mutation answers with the whole portfolio it belongs to — including the re-derived
holding — so a client never has to guess what the write produced.

### The buy log

`holding_buys` is the source of truth for a holding's quantity and average: `shares` is
the log's total and `avg_purchase_price` its cost-weighted mean, by the same arithmetic
the browser uses. An entry is either a `buy` or an `opening` — the latter is how a
position that predates the log, or one edited directly, is represented. `opening` is
never accepted from a client.

Editing a holding's totals rewrites its `opening` entry so the log still derives to the
result; an edit it cannot represent answers `409 LOG_CONFLICT` and changes nothing.
Deleting the final entry deletes the holding.

### Running the tests

```sh
make test            # both suites
make test-frontend   # vitest
make test-backend    # node --test, against a separate _test database
```

The backend suite creates and drops its own database (`psx_portfolio_test`); point
`TEST_DATABASE` elsewhere if that name is taken.
