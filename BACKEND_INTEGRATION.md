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
