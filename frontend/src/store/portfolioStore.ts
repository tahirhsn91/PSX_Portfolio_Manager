/**
 * The portfolio store — a cache of the server's truth, not the truth itself.
 *
 * Portfolios used to live here, in localStorage: clearing site data lost them, and a
 * second browser saw an empty list. They now live in Postgres, keyed to the account,
 * so this store holds what the API last said and hands every mutation to the server.
 *
 * The rule that makes that safe: a mutation does not patch its own copy. It calls the
 * API and replaces the portfolio with the one the server answered with — the server
 * re-derives a holding's quantity and average from its buy log, so a client that
 * guessed the result could disagree with the row it had just written.
 *
 * `activePortfolioId` is the exception: which portfolio you are looking at is a
 * property of this device, not of the account, so it stays local and is never sent.
 */

import { create } from 'zustand';
import type {
  Portfolio,
  Holding,
  CreatePortfolioInput,
  UpdatePortfolioInput,
  CreateHoldingInput,
  UpdateHoldingInput,
  DividendRecord,
  BuyInput,
  DeleteBuyResult,
} from '@/types';
import { PORTFOLIO_COLORS } from '@/constants';
import { portfoliosApi } from '@/services';
import { ApiError } from '@/services/http';

interface PortfolioState {
  portfolios: Portfolio[];
  activePortfolioId: string | null;
  /** True while the first load is in flight, so the UI can wait instead of flashing empty. */
  isLoading: boolean;
  /** The most recent failure, in words a person can read. Cleared by the next success. */
  error: string | null;
  /** Whether the server's list has been fetched for the signed-in account. */
  loaded: boolean;

  /** Fetch the signed-in account's portfolios. Called once the session is known. */
  load: () => Promise<void>;
  /** Forget everything on sign-out, so the next account never sees the last one's rows. */
  reset: () => void;
  /** Put a portfolio the server just returned in place of the stale copy. */
  put: (portfolio: Portfolio) => void;

  // Portfolio CRUD
  createPortfolio: (input: CreatePortfolioInput) => Promise<Portfolio>;
  updatePortfolio: (input: UpdatePortfolioInput) => Promise<void>;
  deletePortfolio: (id: string) => Promise<void>;
  duplicatePortfolio: (id: string) => Promise<Portfolio>;
  setActivePortfolio: (id: string | null) => void;

  // Holding CRUD
  /** Add a holding. The server seeds its buy log, so the answer already carries one. */
  addHolding: (input: CreateHoldingInput) => Promise<Holding | undefined>;
  /**
   * Edit a holding. Its quantity, average and date are expressed through the buy log
   * server-side (decision 14), and an edit the log cannot represent is refused with a
   * 409 — the holding is then left exactly as it was.
   */
  updateHolding: (portfolioId: string, input: UpdateHoldingInput) => Promise<void>;
  /**
   * Buy more of a stock already held. The server re-derives the position from the
   * whole log, so the average that comes back is the log's, not a blend done here.
   */
  buyInto: (portfolioId: string, input: BuyInput) => Promise<Holding | undefined>;
  /**
   * Correct one logged purchase; fixing a single trade re-prices the position from
   * the log. Returns the re-derived holding so the caller can report the new average.
   */
  updateBuy: (
    portfolioId: string,
    holdingId: string,
    buyId: string,
    patch: { shares: number; pricePerShare: number }
  ) => Promise<Holding | undefined>;
  /**
   * Remove a logged purchase and re-derive the position from what is left. The last
   * purchase is the position itself, so removing it removes the holding — an empty
   * log would describe nothing.
   */
  deleteBuy: (
    portfolioId: string,
    holdingId: string,
    buyId: string
  ) => Promise<DeleteBuyResult | undefined>;
  deleteHolding: (portfolioId: string, holdingId: string) => Promise<void>;

  // Dividend
  addDividend: (
    portfolioId: string,
    holdingId: string,
    record: Omit<DividendRecord, 'id' | 'holdingId'>
  ) => Promise<void>;
  deleteDividend: (portfolioId: string, holdingId: string, dividendId: string) => Promise<void>;

  // Selectors — read from the cache, never the network
  getPortfolioById: (id: string) => Portfolio | undefined;
  getHoldingById: (portfolioId: string, holdingId: string) => Holding | undefined;
  getAllSymbols: () => string[];

  // Import / Export
  /** Restore a backup through the server, which decides what a re-import means. */
  importPortfolios: (portfolios: Portfolio[]) => Promise<{ added: number; updated: number }>;
  /** Everything the account owns, for a file the user keeps. */
  exportPortfolios: () => Promise<Portfolio[]>;
  /** Delete every portfolio the account owns. Irreversible: the caller confirms first. */
  clearAll: () => Promise<void>;
}

/** The message a person should see for a failure, whoever reported it. */
const messageFor = (err: unknown): string => {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
};

const holdingIn = (portfolios: Portfolio[], portfolioId: string, holdingId: string) =>
  portfolios.find((p) => p.id === portfolioId)?.holdings.find((h) => h.id === holdingId);

export const usePortfolioStore = create<PortfolioState>()((set, get) => ({
  portfolios: [],
  activePortfolioId: null,
  isLoading: false,
  error: null,
  loaded: false,

  put: (portfolio) =>
    set((state) => ({
      portfolios: state.portfolios.some((p) => p.id === portfolio.id)
        ? state.portfolios.map((p) => (p.id === portfolio.id ? portfolio : p))
        : [...state.portfolios, portfolio],
      error: null,
    })),

  load: async () => {
    set({ isLoading: true, error: null });
    try {
      const portfolios = await portfoliosApi.list();
      set({ portfolios, isLoading: false, loaded: true, error: null });
    } catch (err) {
      // A failed load is not an empty account: keep what we have and say what happened.
      set({ isLoading: false, error: messageFor(err) });
    }
  },

  reset: () =>
    set({ portfolios: [], activePortfolioId: null, isLoading: false, error: null, loaded: false }),

  // ─── Portfolio CRUD ──────────────────────────────────────────────────────
  createPortfolio: async (input) => {
    try {
      const colorIndex = get().portfolios.length % PORTFOLIO_COLORS.length;
      const portfolio = await portfoliosApi.create({
        ...input,
        color: input.color || PORTFOLIO_COLORS[colorIndex],
      });
      set((state) => ({ portfolios: [...state.portfolios, portfolio], error: null }));
      return portfolio;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  updatePortfolio: async (input) => {
    try {
      get().put(await portfoliosApi.update(input.id, input));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  deletePortfolio: async (id) => {
    try {
      await portfoliosApi.remove(id);
      set((state) => ({
        portfolios: state.portfolios.filter((p) => p.id !== id),
        activePortfolioId: state.activePortfolioId === id ? null : state.activePortfolioId,
        error: null,
      }));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  duplicatePortfolio: async (id) => {
    try {
      const duplicate = await portfoliosApi.duplicate(id);
      set((state) => ({ portfolios: [...state.portfolios, duplicate], error: null }));
      return duplicate;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  setActivePortfolio: (id) => set({ activePortfolioId: id }),

  // ─── Holding CRUD ────────────────────────────────────────────────────────
  addHolding: async (input) => {
    try {
      const before = new Set(
        (get().portfolios.find((p) => p.id === input.portfolioId)?.holdings ?? []).map((h) => h.id)
      );
      const portfolio = await portfoliosApi.addHolding(input.portfolioId, input);
      get().put(portfolio);
      return portfolio.holdings.find((h) => !before.has(h.id));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  updateHolding: async (portfolioId, input) => {
    try {
      get().put(await portfoliosApi.updateHolding(portfolioId, input));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  buyInto: async (portfolioId, input) => {
    try {
      const portfolio = await portfoliosApi.addBuy(portfolioId, input.holdingId, {
        date: input.date,
        shares: input.shares,
        pricePerShare: input.pricePerShare,
      });
      get().put(portfolio);
      return portfolio.holdings.find((h) => h.id === input.holdingId);
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  updateBuy: async (portfolioId, holdingId, buyId, patch) => {
    try {
      const portfolio = await portfoliosApi.updateBuy(portfolioId, holdingId, buyId, patch);
      get().put(portfolio);
      return portfolio.holdings.find((h) => h.id === holdingId);
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  deleteBuy: async (portfolioId, holdingId, buyId) => {
    try {
      const { portfolio, holdingRemoved } = await portfoliosApi.removeBuy(
        portfolioId,
        holdingId,
        buyId
      );
      get().put(portfolio);
      if (holdingRemoved) return { kind: 'holding-removed' };
      const holding = portfolio.holdings.find((h) => h.id === holdingId);
      return holding ? { kind: 'updated', holding } : { kind: 'holding-removed' };
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  deleteHolding: async (portfolioId, holdingId) => {
    try {
      get().put(await portfoliosApi.removeHolding(portfolioId, holdingId));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  // ─── Dividends ───────────────────────────────────────────────────────────
  addDividend: async (portfolioId, holdingId, record) => {
    try {
      get().put(await portfoliosApi.addDividend(portfolioId, holdingId, record));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  deleteDividend: async (portfolioId, holdingId, dividendId) => {
    try {
      get().put(await portfoliosApi.removeDividend(portfolioId, holdingId, dividendId));
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  // ─── Selectors ───────────────────────────────────────────────────────────
  getPortfolioById: (id) => get().portfolios.find((p) => p.id === id),

  getHoldingById: (portfolioId, holdingId) => holdingIn(get().portfolios, portfolioId, holdingId),

  getAllSymbols: () => {
    const symbols = new Set<string>();
    get().portfolios.forEach((p) => p.holdings.forEach((h) => symbols.add(h.symbol)));
    return Array.from(symbols);
  },

  // ─── Import / Export ─────────────────────────────────────────────────────
  importPortfolios: async (portfolios) => {
    try {
      // The server answers with the list as it now stands, so there is nothing to merge
      // here — and importing the same backup twice cannot double anything.
      const { portfolios: after, imported } = await portfoliosApi.importAll(portfolios);
      set({ portfolios: after, loaded: true, error: null });
      return { added: imported, updated: 0 };
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  exportPortfolios: async () => {
    try {
      const portfolios = await portfoliosApi.exportAll();
      set({ error: null });
      return portfolios;
    } catch (err) {
      set({ error: messageFor(err) });
      throw err;
    }
  },

  clearAll: async () => {
    try {
      for (const id of get().portfolios.map((p) => p.id)) {
        await portfoliosApi.remove(id);
      }
      set({ portfolios: [], activePortfolioId: null, error: null });
    } catch (err) {
      // Some rows are already gone, so the cache is not to be trusted: say what
      // happened and resync from the server.
      set({ error: messageFor(err) });
      await get().load();
      throw err;
    }
  },
}));
