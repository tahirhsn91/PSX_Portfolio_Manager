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
  BuyInput,
  BuyRecord,
} from '@/types';
import { STORAGE_KEYS, PORTFOLIO_COLORS } from '@/constants';
import { positionFromBuys, roundMoney } from '@/utils/calculations';

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
  /**
   * Buy more of a stock already held: quantity adds up, the average becomes the
   * weighted average, the position keeps its original purchase date, and the
   * purchase is appended to `holding.buys`. Returns the updated holding so the
   * caller can report the new average, or `undefined` if nothing matched.
   */
  buyInto: (portfolioId: string, input: BuyInput) => Holding | undefined;
  /**
   * Correct a logged purchase (its quantity and the price paid). The holding's
   * quantity and average are then re-derived from the whole log, so fixing one
   * trade re-prices the position from it. The position's own purchase date and
   * every other trade are left alone.
   */
  updateBuy: (
    portfolioId: string,
    holdingId: string,
    buyId: string,
    patch: { shares: number; pricePerShare: number }
  ) => Holding | undefined;
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
          buys: [],
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

      buyInto: (portfolioId, input) => {
        let updated: Holding | undefined;

        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? {
                  ...p,
                  updatedAt: now(),
                  holdings: p.holdings.map((h) => {
                    if (h.id !== input.holdingId) return h;

                    const log = h.buys ?? [];
                    // A position with no log predates this feature (or came from
                    // the Add path): seed it with what the position already was,
                    // so the log reconciles for old rows as well as new ones.
                    const opening: BuyRecord[] = log.length
                      ? []
                      : [{
                          id: uuidv4(),
                          holdingId: h.id,
                          date: h.purchaseDate,
                          shares: h.shares,
                          pricePerShare: h.averagePurchasePrice,
                          totalCost: roundMoney(h.shares * h.averagePurchasePrice),
                          kind: 'opening',
                        }];

                    const buys = [
                      ...log,
                      ...opening,
                      {
                        id: uuidv4(),
                        holdingId: h.id,
                        date: input.date,
                        shares: input.shares,
                        pricePerShare: input.pricePerShare,
                        totalCost: roundMoney(input.shares * input.pricePerShare),
                        kind: 'buy' as const,
                      },
                    ];
                    // Derive the position from the log rather than blending into
                    // the old numbers: identical arithmetic, one code path, and
                    // the same path an edited trade takes below.
                    const position = positionFromBuys(buys);
                    updated = {
                      ...h,
                      shares: position.shares,
                      averagePurchasePrice: position.averagePurchasePrice,
                      // The position keeps its original date: the average
                      // describes the position, not the latest purchase — that
                      // purchase carries its own date in the log.
                      purchaseDate: h.purchaseDate,
                      buys,
                    };
                    return updated;
                  }),
                }
              : p
          ),
        }));

        return updated;
      },

      updateBuy: (portfolioId, holdingId, buyId, patch) => {
        let updated: Holding | undefined;

        set((state) => ({
          portfolios: state.portfolios.map((p) =>
            p.id === portfolioId
              ? {
                  ...p,
                  updatedAt: now(),
                  holdings: p.holdings.map((h) => {
                    if (h.id !== holdingId) return h;
                    const log = h.buys ?? [];
                    if (!log.some((b) => b.id === buyId)) return h;

                    const buys = log.map((b) =>
                      b.id === buyId
                        ? {
                            ...b,
                            shares: patch.shares,
                            pricePerShare: patch.pricePerShare,
                            totalCost: roundMoney(patch.shares * patch.pricePerShare),
                          }
                        : b
                    );
                    const position = positionFromBuys(buys);
                    updated = {
                      ...h,
                      shares: position.shares,
                      averagePurchasePrice: position.averagePurchasePrice,
                      buys,
                    };
                    return updated;
                  }),
                }
              : p
          ),
        }));

        return updated;
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
      // Rows persisted before `buys` existed carry no log. Normalise on the way
      // in so every consumer can read `holding.buys` as an array — old rows keep
      // working untouched, and their first buy seeds an `opening` entry.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PortfolioState>;
        return {
          ...current,
          ...saved,
          portfolios: (saved.portfolios ?? []).map((portfolio) => ({
            ...portfolio,
            holdings: (portfolio.holdings ?? []).map((holding) => ({
              ...holding,
              buys: holding.buys ?? [],
            })),
          })),
        };
      },
    }
  )
);
