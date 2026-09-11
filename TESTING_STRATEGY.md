# Testing Strategy

## Recommended Stack

| Layer | Tool |
|---|---|
| Unit / Integration | Vitest + React Testing Library |
| E2E | Playwright |
| Component | Storybook (optional) |

---

## Setup

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
npm install -D playwright @playwright/test
```

Add to `vite.config.ts`:

```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

`src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

---

## Unit Tests — Pure Functions (`src/utils/`)

These are the highest-value, lowest-effort tests.

```typescript
// src/utils/calculations.test.ts
import { describe, it, expect } from 'vitest';
import { calculateHoldingMetrics } from './calculations';

describe('calculateHoldingMetrics', () => {
  it('calculates unrealized P&L correctly', () => {
    const holding = {
      id: '1', portfolioId: 'p1', symbol: 'ENGRO',
      companyName: 'Engro Corp', sector: 'Fertilizer',
      shares: 100, averagePurchasePrice: 200,
      purchaseDate: '2024-01-01', dividendsReceived: [],
    };
    const quote = {
      symbol: 'ENGRO', companyName: 'Engro Corp',
      currentPrice: 240, change: 10, changePercent: 4.35,
      open: 230, high: 245, low: 228, previousClose: 230,
      volume: 500000, marketCap: 120_000_000_000,
      sector: 'Fertilizer', lastUpdated: new Date().toISOString(),
    };
    const metrics = calculateHoldingMetrics(holding, quote, 24_000);
    expect(metrics.costBasis).toBe(20_000);           // 100 * 200
    expect(metrics.currentValue).toBe(24_000);        // 100 * 240
    expect(metrics.unrealizedPL).toBe(4_000);         // 24000 - 20000
    expect(metrics.unrealizedPLPercent).toBeCloseTo(20); // 4000/20000 * 100
  });

  it('handles zero shares gracefully', () => {
    const holding = { ...defaultHolding, shares: 0 };
    const metrics = calculateHoldingMetrics(holding, mockQuote, 0);
    expect(metrics.currentValue).toBe(0);
    expect(metrics.unrealizedPL).toBe(0);
  });
});
```

---

## Unit Tests — Formatters

```typescript
// src/utils/formatters.test.ts
import { formatCurrency, formatPercent, formatDate } from './formatters';

describe('formatCurrency', () => {
  it('formats PKR amounts', () => {
    expect(formatCurrency(1234.56)).toContain('1,234.56');
  });
  it('handles compact format', () => {
    expect(formatCurrency(1_500_000, true)).toBe('PKR 1.5M');
  });
  it('handles negative values', () => {
    expect(formatCurrency(-500)).toContain('-');
  });
});

describe('formatPercent', () => {
  it('adds + sign for positive', () => {
    expect(formatPercent(5.23)).toBe('+5.23%');
  });
  it('uses - sign for negative', () => {
    expect(formatPercent(-3.14)).toBe('-3.14%');
  });
});
```

---

## Unit Tests — Prediction Engine

```typescript
// src/services/prediction/predictionEngine.test.ts
import { predictionEngine } from './predictionEngine';
import { generateMockHistory } from '@/test/helpers';

describe('PredictionEngine', () => {
  it('returns bullish prediction for uptrend data', async () => {
    const uptrend = generateMockHistory(200, 'up');
    const result = await predictionEngine.predict('TEST', uptrend, uptrend[uptrend.length - 1].close);
    expect(result.trendDirection).toBe('bullish');
  });

  it('finds support below current price', async () => {
    const data = generateMockHistory(90, 'sideways');
    const prediction = await predictionEngine.predict('TEST', data, 100);
    prediction.supportLevels.forEach((s) => {
      expect(s.price).toBeLessThan(100);
      expect(s.type).toBe('support');
    });
  });

  it('returns insufficient data prediction for < 20 points', async () => {
    const result = await predictionEngine.predict('TEST', [], 100);
    expect(result.confidenceLevel).toBe('low');
    expect(result.confidenceScore).toBeLessThan(20);
  });
});
```

---

## Component Tests — Zustand Store

```typescript
// src/store/portfolioStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { usePortfolioStore } from './portfolioStore';

describe('usePortfolioStore', () => {
  beforeEach(() => {
    usePortfolioStore.getState().clearAll();
  });

  it('creates a portfolio', () => {
    const { result } = renderHook(() => usePortfolioStore());
    act(() => {
      result.current.createPortfolio({ name: 'Test', color: '#00a651' });
    });
    expect(result.current.portfolios).toHaveLength(1);
    expect(result.current.portfolios[0].name).toBe('Test');
  });

  it('adds a holding to a portfolio', () => {
    const { result } = renderHook(() => usePortfolioStore());
    let portfolioId: string;
    act(() => {
      const p = result.current.createPortfolio({ name: 'Test', color: '#00a651' });
      portfolioId = p.id;
      result.current.addHolding({
        portfolioId: p.id,
        companyName: 'Engro Corp', symbol: 'ENGRO',
        sector: 'Fertilizer', shares: 100,
        averagePurchasePrice: 200, purchaseDate: '2024-01-01',
      });
    });
    expect(result.current.portfolios[0].holdings).toHaveLength(1);
    expect(result.current.portfolios[0].holdings[0].symbol).toBe('ENGRO');
  });
});
```

---

## E2E Tests — Playwright

```typescript
// e2e/portfolio.spec.ts
import { test, expect } from '@playwright/test';

test('user can create a portfolio and add a holding', async ({ page }) => {
  await page.goto('/portfolios');

  // Create portfolio
  await page.click('button:has-text("New Portfolio")');
  await page.fill('input[id="name"]', 'My Test Portfolio');
  await page.click('button:has-text("Create Portfolio")');
  await expect(page.locator('text=My Test Portfolio')).toBeVisible();

  // Open portfolio
  await page.click('text=My Test Portfolio');
  await expect(page.url()).toContain('/portfolios/');

  // Add holding
  await page.click('button:has-text("Add Holding")');
  await page.fill('input[id="symbol"]', 'ENGRO');
  await page.fill('input[id="companyName"]', 'Engro Corporation');
  await page.fill('input[id="shares"]', '500');
  await page.fill('input[id="averagePurchasePrice"]', '285');
  await page.click('button:has-text("Add Holding")');

  await expect(page.locator('text=ENGRO')).toBeVisible();
});

test('export and import backup', async ({ page }) => {
  await page.goto('/settings');
  // Verify export button is present
  await expect(page.locator('button:has-text("Export Backup")')).toBeVisible();
});
```

---

## Running Tests

```bash
# Unit + integration
npm run test          # watch mode
npm run test:run      # single run (CI)
npm run test:coverage # with coverage report

# E2E
npx playwright test
npx playwright test --ui  # interactive mode
```

---

## Coverage Targets

| Layer | Target |
|---|---|
| `utils/calculations.ts` | 90% |
| `utils/formatters.ts` | 95% |
| `services/prediction/` | 80% |
| `store/portfolioStore.ts` | 85% |
| UI Components | 60% (RTL) |
| E2E Critical Paths | 100% of happy paths |
