/**
 * The portfolio API — the server-side home of everything that used to live in
 * localStorage.
 *
 * Every mutation answers with the whole portfolio it belongs to, and the caller
 * takes that as truth rather than splicing a fragment into its own copy: with the
 * buy log being re-derived server-side, a client that patched in its own idea of
 * the result could disagree with the row it just wrote.
 *
 * `list` is the one call that returns every portfolio; everything else is scoped to
 * an id and reaches the server through the owning portfolio, so a caller can only
 * ever touch what it owns.
 */

import { request } from '../http';
import type {
  Portfolio,
  CreatePortfolioInput,
  UpdatePortfolioInput,
  CreateHoldingInput,
  UpdateHoldingInput,
  DividendRecord,
  BuyInput,
} from '@/types';

const BASE = '/api/portfolios';

const body = (payload: unknown) => JSON.stringify(payload);

/** The three shapes the API answers with, named so the callers read plainly. */
interface PortfolioEnvelope {
  portfolio: Portfolio;
}
interface PortfolioListEnvelope {
  portfolios: Portfolio[];
}
interface ImportEnvelope {
  imported: number;
  portfolios: Portfolio[];
}

export const portfoliosApi = {
  list: async (): Promise<Portfolio[]> => {
    const { portfolios } = await request<PortfolioListEnvelope>(BASE);
    return portfolios;
  },

  get: async (id: string): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(`${BASE}/${id}`);
    return portfolio;
  },

  create: async (input: CreatePortfolioInput): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(BASE, {
      method: 'POST',
      body: body(input),
    });
    return portfolio;
  },

  update: async (id: string, input: UpdatePortfolioInput): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(`${BASE}/${id}`, {
      method: 'PATCH',
      body: body(input),
    });
    return portfolio;
  },

  remove: (id: string) => request<{ ok: boolean }>(`${BASE}/${id}`, { method: 'DELETE' }),

  duplicate: async (id: string): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(`${BASE}/${id}/duplicate`, {
      method: 'POST',
    });
    return portfolio;
  },

  // ─── Holdings ──────────────────────────────────────────────────────────────
  addHolding: async (portfolioId: string, input: CreateHoldingInput): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(`${BASE}/${portfolioId}/holdings`, {
      method: 'POST',
      body: body(input),
    });
    return portfolio;
  },

  /**
   * Edit a holding. Editing its quantity, average or date goes through the buy log
   * server-side (decision 14), and an edit the log cannot represent is refused with
   * a 409 `LOG_CONFLICT` — which leaves the holding exactly as it was.
   */
  updateHolding: async (
    portfolioId: string,
    input: UpdateHoldingInput
  ): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${input.id}`,
      { method: 'PATCH', body: body(input) }
    );
    return portfolio;
  },

  removeHolding: async (portfolioId: string, holdingId: string): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${holdingId}`,
      { method: 'DELETE' }
    );
    return portfolio;
  },

  // ─── The buy log ───────────────────────────────────────────────────────────
  /** The holding is named by the path, so the body carries only the purchase. */
  addBuy: async (
    portfolioId: string,
    holdingId: string,
    input: Omit<BuyInput, 'holdingId'>
  ): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${holdingId}/buys`,
      { method: 'POST', body: body(input) }
    );
    return portfolio;
  },

  updateBuy: async (
    portfolioId: string,
    holdingId: string,
    buyId: string,
    patchBody: { shares: number; pricePerShare: number }
  ): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${holdingId}/buys/${buyId}`,
      { method: 'PATCH', body: body(patchBody) }
    );
    return portfolio;
  },

  /**
   * Remove one logged purchase. Removing the last entry removes the holding — an
   * empty log describes nothing — so the answer says which of the two happened.
   */
  removeBuy: async (
    portfolioId: string,
    holdingId: string,
    buyId: string
  ): Promise<{ portfolio: Portfolio; holdingRemoved: boolean }> => {
    return request<{ portfolio: Portfolio; holdingRemoved: boolean }>(
      `${BASE}/${portfolioId}/holdings/${holdingId}/buys/${buyId}`,
      { method: 'DELETE' }
    );
  },

  // ─── Dividends ─────────────────────────────────────────────────────────────
  addDividend: async (
    portfolioId: string,
    holdingId: string,
    record: Omit<DividendRecord, 'id' | 'holdingId'>
  ): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${holdingId}/dividends`,
      { method: 'POST', body: body(record) }
    );
    return portfolio;
  },

  removeDividend: async (
    portfolioId: string,
    holdingId: string,
    dividendId: string
  ): Promise<Portfolio> => {
    const { portfolio } = await request<PortfolioEnvelope>(
      `${BASE}/${portfolioId}/holdings/${holdingId}/dividends/${dividendId}`,
      { method: 'DELETE' }
    );
    return portfolio;
  },

  // ─── Backup ────────────────────────────────────────────────────────────────
  exportAll: async (): Promise<Portfolio[]> => {
    const { portfolios } = await request<PortfolioListEnvelope>(`${BASE}/export`);
    return portfolios;
  },

  /** A restore, not an accumulation: the server decides what a re-import means. */
  importAll: async (portfolios: Portfolio[]): Promise<ImportEnvelope> => {
    return request<ImportEnvelope>(`${BASE}/import`, {
      method: 'POST',
      body: body({ portfolios }),
    });
  },
};
