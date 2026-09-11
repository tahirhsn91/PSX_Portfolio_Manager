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
}

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
  currentPrice: number;
  currentValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  todayChange: number;
  todayChangePercent: number;
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
