/**
 * Prediction engine types.
 * The engine is pluggable — an AI model can replace the rule-based engine
 * without any changes to the consumers.
 */

export type TrendDirection = 'bullish' | 'bearish' | 'neutral' | 'sideways';
export type MomentumStrength = 'strong' | 'moderate' | 'weak';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface SupportResistanceLevel {
  price: number;
  strength: MomentumStrength; // how many times price has bounced off this level
  type: 'support' | 'resistance';
}

export interface PriceTarget {
  timeframe: '1w' | '1m' | '3m' | '6m' | '1y';
  targetPrice: number;
  upside: number; // percentage from current price
  probability: number; // 0-100
}

export interface DividendPrediction {
  expectedDate: string | null; // ISO date
  expectedAmountPerShare: number | null;
  confidence: ConfidenceLevel;
  basedOn: string; // explanation e.g. "Historical pattern: annual in March"
}

export interface StockPrediction {
  symbol: string;
  generatedAt: string; // ISO timestamp
  currentPrice: number;
  trendDirection: TrendDirection;
  momentum: MomentumStrength;
  confidenceScore: number; // 0-100
  confidenceLevel: ConfidenceLevel;
  supportLevels: SupportResistanceLevel[];
  resistanceLevels: SupportResistanceLevel[];
  priceTargets: PriceTarget[];
  dividendPrediction: DividendPrediction;
  signals: TechnicalSignal[];
  summary: string; // human-readable summary
  risks: string[];
}

export interface TechnicalSignal {
  name: string; // e.g. "RSI Oversold", "Golden Cross"
  type: 'bullish' | 'bearish' | 'neutral';
  strength: MomentumStrength;
  description: string;
}

export interface RSIData {
  value: number;
  signal: 'overbought' | 'oversold' | 'neutral';
}

export interface MovingAverageData {
  ma20: number;
  ma50: number;
  ma200: number;
  signal: 'golden_cross' | 'death_cross' | 'neutral';
}

export interface TechnicalIndicators {
  rsi: RSIData;
  movingAverages: MovingAverageData;
  volumeRatio: number; // current vs average volume
  priceToSMA20: number; // % above/below 20-day SMA
  volatility: number; // annualized volatility %
}

// Prediction engine interface — swap AI model here
export interface IPredictionEngine {
  predict(
    symbol: string,
    historicalData: import('./market.types').HistoricalDataPoint[],
    currentPrice: number,
    dividendHistory?: import('./portfolio.types').DividendRecord[]
  ): Promise<StockPrediction>;
  calculateTechnicalIndicators(
    historicalData: import('./market.types').HistoricalDataPoint[]
  ): TechnicalIndicators;
}
