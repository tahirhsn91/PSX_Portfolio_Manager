/**
 * The store as a cache of the server's truth (#4, G3).
 *
 * These tests are here to pin the rule that makes the migration safe: a mutation does
 * not patch its own copy of a portfolio, it replaces it with the one the server
 * answered with. If that rule slips, the client and the row it just wrote can
 * disagree — which is exactly what the buy log's re-derivation would expose in
 * production and nowhere else.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** `vi.mock` is hoisted above ordinary declarations, so the mock is made here. */
const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
  addHolding: vi.fn(),
  updateHolding: vi.fn(),
  removeHolding: vi.fn(),
  addBuy: vi.fn(),
  updateBuy: vi.fn(),
  removeBuy: vi.fn(),
  addDividend: vi.fn(),
  removeDividend: vi.fn(),
  exportAll: vi.fn(),
  importAll: vi.fn(),
}));

vi.mock('@/services', () => ({ portfoliosApi: api }));

import { usePortfolioStore } from './portfolioStore';
import { ApiError } from '@/services/http';
import type { Portfolio } from '@/types';

const portfolio = (over: Partial<Portfolio> = {}): Portfolio =>
  ({
    id: 'p1',
    name: 'Long term',
    description: undefined,
    color: '#00a651',
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    holdings: [],
    ...over,
  }) as Portfolio;

const holding = (over = {}) => ({
  id: 'h1',
  portfolioId: 'p1',
  companyName: 'Engro Holdings',
  symbol: 'ENGROH',
  sector: 'Fertilizer',
  shares: 120,
  averagePurchasePrice: 275.5,
  purchaseDate: '2026-03-04',
  dividendsReceived: [],
  buys: [],
  ...over,
});

describe('the portfolio store, on the API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePortfolioStore.getState().reset();
  });

  it('populates from the server rather than from the browser', async () => {
    api.list.mockResolvedValue([portfolio()]);

    await usePortfolioStore.getState().load();

    const state = usePortfolioStore.getState();
    expect(api.list).toHaveBeenCalledOnce();
    expect(state.portfolios.map((p) => p.id)).toEqual(['p1']);
    expect(state.loaded).toBe(true);
    expect(state.error).toBeNull();
  });

  it('says what happened when the load fails, instead of looking empty', async () => {
    api.list.mockRejectedValue(new ApiError(503, 'DB_UNAVAILABLE', 'The database is waking up.'));

    await usePortfolioStore.getState().load();

    const state = usePortfolioStore.getState();
    expect(state.portfolios).toEqual([]);
    expect(state.loaded).toBe(false);
    expect(state.error).toBe('The database is waking up.');
  });

  it('takes the server\'s portfolio as truth after a buy, including the re-derived position', async () => {
    // What the server answers with after logging 10 shares at 100: 130 shares at 262.
    const afterBuy = portfolio({
      holdings: [holding({ shares: 130, averagePurchasePrice: 262, buys: [{ id: 'b2' }] }) as never],
    });
    api.addBuy.mockResolvedValue(afterBuy);
    usePortfolioStore.setState({ portfolios: [portfolio({ holdings: [holding() as never] })] });

    const updated = await usePortfolioStore
      .getState()
      .buyInto('p1', { holdingId: 'h1', date: '2026-04-01', shares: 10, pricePerShare: 100 });

    // The store did not add 10 to 120 itself — it reported the server's numbers.
    expect(updated?.shares).toBe(130);
    expect(updated?.averagePurchasePrice).toBe(262);
    expect(usePortfolioStore.getState().portfolios[0].holdings[0].shares).toBe(130);
  });

  it('surfaces the log\'s 409 so the page can explain it, and keeps the old position', async () => {
    api.updateHolding.mockRejectedValue(
      new ApiError(409, 'LOG_CONFLICT', 'This holding already logs 10 shares of real purchases.')
    );
    usePortfolioStore.setState({ portfolios: [portfolio({ holdings: [holding() as never] })] });

    await expect(
      usePortfolioStore.getState().updateHolding('p1', { id: 'h1', shares: 5 } as never)
    ).rejects.toMatchObject({ code: 'LOG_CONFLICT' });

    const state = usePortfolioStore.getState();
    expect(state.error).toBe('This holding already logs 10 shares of real purchases.');
    // Nothing was optimistically applied, so the position still reads as it did.
    expect(state.portfolios[0].holdings[0].shares).toBe(120);
  });

  it('drops everything on sign-out, so the next account sees none of it', async () => {
    api.list.mockResolvedValue([portfolio()]);
    await usePortfolioStore.getState().load();
    expect(usePortfolioStore.getState().portfolios).toHaveLength(1);

    usePortfolioStore.getState().reset();

    const state = usePortfolioStore.getState();
    expect(state.portfolios).toEqual([]);
    expect(state.loaded).toBe(false);
    expect(state.activePortfolioId).toBeNull();
  });
});
