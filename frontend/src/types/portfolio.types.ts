/**
 * Core portfolio domain types.
 * These are storage-agnostic — they describe the data model, not the persistence layer.
 */

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO date string
  updatedAt: string;
  color: string; // hex color for UI differentiation
  holdings: Holding[];
}

export interface Holding {
  id: string;
  portfolioId: string;
  companyName: string;
  symbol: string; // PSX ticker e.g. "ENGRO"
  sector: string;
  shares: number;
  averagePurchasePrice: number; // PKR
  purchaseDate: string; // ISO date string
  notes?: string;
  dividendsReceived: DividendRecord[];
  /**
   * Append-only log of how `shares` and `averagePurchasePrice` got to their
   * current values. The two fields above stay the source of truth — nothing is
   * ever derived from this list — it is a record, so a purchase history can be
   * opened per holding later.
   *
   * `shares` is required rather than optional so every consumer can rely on it;
   * rows persisted before this feature existed are normalised to `[]` when the
   * store rehydrates (see `portfolioStore`'s `merge`).
   */
  buys: BuyRecord[];
}

/** One entry in a holding's buy log. */
export interface BuyRecord {
  id: string;
  holdingId: string;
  date: string; // ISO date string — the day of *this* purchase
  shares: number; // quantity bought
  pricePerShare: number; // PKR paid per share
  totalCost: number; // shares * pricePerShare
  /**
   * `opening` reproduces the position as it stood before its first buy through
   * this feature, so the log reconciles to the holding for old rows too.
   */
  kind: 'opening' | 'buy';
}

/**
 * Deleting a purchase either leaves a position behind (re-derived from the
 * purchases that remain) or takes the last one — and with it, the holding.
 */
export type DeleteBuyResult =
  | { kind: 'updated'; holding: Holding }
  | { kind: 'holding-removed' };

export interface DividendRecord {
  id: string;
  holdingId: string;
  date: string; // ISO date string
  amountPerShare: number; // PKR
  totalAmount: number; // PKR
  type: 'cash' | 'stock' | 'bonus';
}

// Computed/derived values (not stored, calculated at runtime)
export interface HoldingMetrics {
  holdingId: string;
  /**
   * False when the feed could not price this holding. `costBasis` and
   * `totalDividendIncome` are still facts, but every price-derived figure below
   * is 0 and MUST NOT be rendered — show "—" / "price unavailable" instead. Such a
   * holding is also excluded from the portfolio totals, from the weight
   * denominator and from best/worst performer, so the rest of the page stays true.
   */
  priceAvailable: boolean;
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  todayChange: number;
  todayChangePercent: number;
  /** Change in value today: quote.change × shares (0 when no quote is available). */
  todayPL: number;
  totalDividendIncome: number;
  totalReturn: number;
  totalReturnPercent: number;
  weightInPortfolio: number; // percentage
}

export interface PortfolioMetrics {
  portfolioId: string;
  totalInvestment: number;
  currentValue: number;
  totalPL: number;
  totalPLPercent: number;
  todayPL: number;
  todayPLPercent: number;
  totalDividendIncome: number;
  totalReturn: number;
  totalReturnPercent: number;
  bestPerformer: { symbol: string; returnPercent: number } | null;
  worstPerformer: { symbol: string; returnPercent: number } | null;
  holdingMetrics: HoldingMetrics[];
  /** Holdings the feed could not price; they are excluded from every figure above. */
  unpricedHoldings: number;
  /** Symbols behind that count, for the "totals cover N of M" note. */
  unpricedSymbols: string[];
}

// Forms
export interface CreatePortfolioInput {
  name: string;
  description?: string;
  color: string;
}

export interface UpdatePortfolioInput extends CreatePortfolioInput {
  id: string;
}

export interface CreateHoldingInput {
  portfolioId: string;
  companyName: string;
  symbol: string;
  sector: string;
  shares: number;
  averagePurchasePrice: number;
  purchaseDate: string;
  notes?: string;
}

export interface UpdateHoldingInput extends Omit<CreateHoldingInput, 'portfolioId'> {
  id: string;
}

/** A purchase added to a position that already exists. */
export interface BuyInput {
  holdingId: string;
  shares: number;
  pricePerShare: number;
  date: string; // ISO date string
}