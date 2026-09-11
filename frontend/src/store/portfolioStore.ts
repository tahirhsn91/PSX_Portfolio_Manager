import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  Portfolio,
  Holding,
  CreatePortfolioInput,
  UpdatePortfolioInput,
  CreateHoldingInput,
  UpdateHoldingInput,
  DividendRecord,
} from '@/types';
import { STORAGE_KEYS, PORTFOLIO_COLORS } from '@/constants';

interface PortfolioState {
  portfolios: Portfolio[];
  activePortfolioId: string | null;

  // Portfolio CRUD
  createPortfolio: (input: CreatePortfolioInput) => Portfolio;
  updatePortfolio: (input: UpdatePortfolioInput) => void;
  deletePortfolio: (id: string) => void;
  duplicatePortfolio: (id: string) => Portfolio;
  setActivePortfolio: (id: string | null) => void;

  // Holding CRUD
  addHolding: (input: CreateHoldingInput) => Holding;
  updateHolding: (portfolioId: string, input: UpdateHoldingInput) => void;
  deleteHolding: (portfolioId: string, holdingId: string) => void;

  // Dividend
  addDividend: (portfolioId: string, holdingId: string, record: Omit<DividendRecord, 'id' | 'holdingId'>) => void;
  deleteDividend: (portfolioId: string, holdingId: string, dividendId: string) => void;

  // Selectors
  getPortfolioById: (id: string) => Portfolio | undefined;
  getHoldingById: (portfolioId: string, holdingId: string) => Holding | undefined;
  getAllSymbols: () => string[];

  // Import / Export
  importPortfolios: (portfolios: Portfolio[]) => void;
  clearAll: () => void;
}

const now = () => new Date().toISOString();

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      portfolios: [],
      activePortfolioId: null,

      // ─── Portfolio CRUD ──────────────────────────────────────────────────
      createPortfolio: (input) => {
        const portfolios = get().portfolios;
        const colorIndex = portfolios.length % PORTFOLIO_COLORS.length;
        const portfolio: Portfolio = {
          id: uuidv4(),
          name: input.name,
          description: input.description,
          color: input.color || PORTFOLIO_COLORS[colorIndex],
          createdAt: now(),
          updatedAt: now(),
          holdings: [],
        };
        set((state) => ({ portfolios: [...state.portfolios, portfolio] }));
        return portfolio;
      },

      updatePortfolio: (input) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === input.id
              ? { ...p, name: input.name, description: input.description, color: input.color, updatedAt: now() }
              : p
          ),
        }));
      },

      deletePortfolio: (id) => {
        set((state) => ({
          portfolios: state.portfolios.filter((p) => p.id !== id),
          activePortfolioId: state.activePortfolioId === id ? null : state.activePortfolioId,
        }));
      },

      duplicatePortfolio: (id) => {
        const original = get().portfolios.find((p) => p.id === id);
        if (!original) throw new Error(`Portfolio ${id} not found`);
        const duplicate: Portfolio = {
          ...original,
          id: uuidv4(),
          name: `${original.name} (Copy)`,
          createdAt: now(),
          updatedAt: now(),
          holdings: original.holdings.map((h) => ({
            ...h,
            id: uuidv4(),
            portfolioId: '',
            dividendsReceived: h.dividendsReceived.map((d) => ({ ...d, id: uuidv4() })),
          })),
        };
        // Fix portfolioId and holdingId references
        const newId = duplicate.id;
        duplicate.holdings = duplicate.holdings.map((h) => ({
          ...h,
          portfolioId: newId,
          dividendsReceived: h.dividendsReceived.map((d) => ({ ...d, holdingId: h.id })),
        }));
        set((state) => ({ portfolios: [...state.portfolios, duplicate] }));
        return duplicate;
      },

      setActivePortfolio: (id) => set({ activePortfolioId: id }),

      // ─── Holding CRUD ────────────────────────────────────────────────────
      addHolding: (input) => {
        const holding: Holding = {
          id: uuidv4(),
          portfolioId: input.portfolioId,
          companyName: input.companyName,
          symbol: input.symbol.toUpperCase(),
          sector: input.sector,
          shares: input.shares,
          averagePurchasePrice: input.averagePurchasePrice,
          purchaseDate: input.purchaseDate,
          notes: input.notes,
          dividendsReceived: [],
        };
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === input.portfolioId
              ? { ...p, holdings: [...p.holdings, holding], updatedAt: now() }
              : p
          ),
        }));
        return holding;
      },

      updateHolding: (portfolioId, input) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? {
                  ...p,
                  updatedAt: now(),
                  holdings: p.holdings.map((h) =>
                    h.id === input.id
                      ? {
                          ...h,
                          companyName: input.companyName,
                          symbol: input.symbol.toUpperCase(),
                          sector: input.sector,
                          shares: input.shares,
                          averagePurchasePrice: input.averagePurchasePrice,
                          purchaseDate: input.purchaseDate,
                          notes: input.notes,
                        }
                      : h
                  ),
                }
              : p
          ),
        }));
      },

      deleteHolding: (portfolioId, holdingId) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? { ...p, holdings: p.holdings.filter((h) => h.id !== holdingId), updatedAt: now() }
              : p
          ),
        }));
      },

      // ─── Dividends ───────────────────────────────────────────────────────
      addDividend: (portfolioId, holdingId, record) => {
        const dividend: DividendRecord = {
          ...record,
          id: uuidv4(),
          holdingId,
        };
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? {
                  ...p,
                  updatedAt: now(),
                  holdings: p.holdings.map((h) =>
                    h.id === holdingId
                      ? { ...h, dividendsReceived: [...h.dividendsReceived, dividend] }
                      : h
                  ),
                }
              : p
          ),
        }));
      },

      deleteDividend: (portfolioId, holdingId, dividendId) => {
        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? {
                  ...p,
                  updatedAt: now(),
                  holdings: p.holdings.map((h) =>
                    h.id === holdingId
                      ? { ...h, dividendsReceived: h.dividendsReceived.filter((d) => d.id !== dividendId) }
                      : h
                  ),
                }
              : p
          ),
        }));
      },

      // ─── Selectors ───────────────────────────────────────────────────────
      getPortfolioById: (id) => get().portfolios.find((p) => p.id === id),

      getHoldingById: (portfolioId, holdingId) =>
        get()
          .portfolios.find((p) => p.id === portfolioId)
          ?.holdings.find((h) => h.id === holdingId),

      getAllSymbols: () => {
        const symbols = new Set<string>();
        get().portfolios.forEach((p) => p.holdings.forEach((h) => symbols.add(h.symbol)));
        return Array.from(symbols);
      },

      // ─── Import / Export ─────────────────────────────────────────────────
      importPortfolios: (portfolios) => {
        set((state) => ({
          portfolios: [...state.portfolios, ...portfolios],
        }));
      },

      clearAll: () => set({ portfolios: [], activePortfolioId: null }),
    }),
    {
      name: STORAGE_KEYS.PORTFOLIOS,
      storage: createJSONStorage(() => localStorage),
    }
  )
);
