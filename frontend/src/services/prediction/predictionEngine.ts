/**
 * Rule-based Prediction Engine.
 *
 * Architecture note: implements IPredictionEngine interface.
 * To replace with an AI model:
 *   1. Create AIPredictionEngine implementing IPredictionEngine
 *   2. Swap the singleton export — zero UI changes required.
 */

import type {
  IPredictionEngine,
  StockPrediction,
  TechnicalIndicators,
  SupportResistanceLevel,
  TechnicalSignal,
  TrendDirection,
  MomentumStrength,
  ConfidenceLevel,
} from '@/types';
import type { HistoricalDataPoint, DividendRecord } from '@/types';
import { TECHNICAL } from '@/constants';

class RuleBasedPredictionEngine implements IPredictionEngine {
  // ─── Public API ──────────────────────────────────────────────────────────

  async predict(
    symbol: string,
    historicalData: HistoricalDataPoint[],
    currentPrice: number,
    dividendHistory: DividendRecord[] = []
  ): Promise<StockPrediction> {
    if (historicalData.length < 20) {
      return this.buildInsufficientDataPrediction(symbol, currentPrice);
    }

    const indicators = this.calculateTechnicalIndicators(historicalData);
    const signals = this.generateSignals(indicators, currentPrice, historicalData);
    const supportLevels = this.findSupportLevels(historicalData, currentPrice);
    const resistanceLevels = this.findResistanceLevels(historicalData, currentPrice);
    const trend = this.determineTrend(indicators, signals);
    const momentum = this.determineMomentum(indicators);
    const confidenceScore = this.calculateConfidence(signals, historicalData.length);
    const dividendPrediction = this.predictDividend(dividendHistory, currentPrice);
    const priceTargets = this.calculatePriceTargets(currentPrice, supportLevels, resistanceLevels, trend);
    const risks = this.identifyRisks(indicators, historicalData);

    return {
      symbol,
      generatedAt: new Date().toISOString(),
      currentPrice,
      trendDirection: trend,
      momentum,
      confidenceScore,
      confidenceLevel: this.scoreToLevel(confidenceScore),
      supportLevels,
      resistanceLevels,
      priceTargets,
      dividendPrediction,
      signals,
      summary: this.buildSummary(symbol, trend, momentum, confidenceScore, priceTargets),
      risks,
    };
  }

  calculateTechnicalIndicators(data: HistoricalDataPoint[]): TechnicalIndicators {
    const closes = data.map((d) => d.close);
    const rsiValue = this.calculateRSI(closes, TECHNICAL.RSI_PERIOD);
    const ma20 = this.sma(closes, TECHNICAL.SMA_SHORT);
    const ma50 = this.sma(closes, TECHNICAL.SMA_MEDIUM);
    const ma200 = this.sma(closes, TECHNICAL.SMA_LONG);
    const currentClose = closes[closes.length - 1];
    const volumes = data.map((d) => d.volume);
    const avgVol = this.sma(volumes, 20);
    const currentVol = volumes[volumes.length - 1];
    const volatility = this.calculateVolatility(closes, 20);

    return {
      rsi: {
        value: +rsiValue.toFixed(2),
        signal:
          rsiValue >= TECHNICAL.RSI_OVERBOUGHT
            ? 'overbought'
            : rsiValue <= TECHNICAL.RSI_OVERSOLD
            ? 'oversold'
            : 'neutral',
      },
      movingAverages: {
        ma20: +ma20.toFixed(2),
        ma50: +ma50.toFixed(2),
        ma200: +ma200.toFixed(2),
        signal:
          ma50 > ma200 && data.length > 1 && closes[closes.length - 2] < ma50
            ? 'golden_cross'
            : ma50 < ma200 && data.length > 1 && closes[closes.length - 2] > ma50
            ? 'death_cross'
            : 'neutral',
      },
      volumeRatio: +(currentVol / (avgVol || 1)).toFixed(2),
      priceToSMA20: +(((currentClose - ma20) / ma20) * 100).toFixed(2),
      volatility: +volatility.toFixed(2),
    };
  }

  // ─── Private: Calculations ───────────────────────────────────────────────

  private calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private sma(values: number[], period: number): number {
    const slice = values.slice(-period);
    if (!slice.length) return values[values.length - 1] ?? 0;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  private calculateVolatility(closes: number[], period: number): number {
    const slice = closes.slice(-period);
    if (slice.length < 2) return 0;
    const returns = slice.slice(1).map((c, i) => Math.log(c / slice[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    return Math.sqrt(variance * 252) * 100; // annualized %
  }

  private findSupportLevels(data: HistoricalDataPoint[], currentPrice: number): SupportResistanceLevel[] {
    const lookback = data.slice(-TECHNICAL.SUPPORT_RESISTANCE_LOOKBACK);
    const lows = lookback.map((d) => d.low);
    const levels: SupportResistanceLevel[] = [];

    // Find local minima
    for (let i = 2; i < lows.length - 2; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
        const price = lows[i];
        if (price < currentPrice) {
          const touchCount = this.countTouches(lows, price, 0.02);
          levels.push({
            price: +price.toFixed(2),
            strength: touchCount >= 3 ? 'strong' : touchCount >= 2 ? 'moderate' : 'weak',
            type: 'support',
          });
        }
      }
    }

    // Cluster and de-duplicate
    return this.clusterLevels(levels, currentPrice)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3);
  }

  private findResistanceLevels(data: HistoricalDataPoint[], currentPrice: number): SupportResistanceLevel[] {
    const lookback = data.slice(-TECHNICAL.SUPPORT_RESISTANCE_LOOKBACK);
    const highs = lookback.map((d) => d.high);
    const levels: SupportResistanceLevel[] = [];

    for (let i = 2; i < highs.length - 2; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
        const price = highs[i];
        if (price > currentPrice) {
          const touchCount = this.countTouches(highs, price, 0.02);
          levels.push({
            price: +price.toFixed(2),
            strength: touchCount >= 3 ? 'strong' : touchCount >= 2 ? 'moderate' : 'weak',
            type: 'resistance',
          });
        }
      }
    }

    return this.clusterLevels(levels, currentPrice)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
  }

  private countTouches(prices: number[], level: number, tolerance: number): number {
    return prices.filter((p) => Math.abs(p - level) / level <= tolerance).length;
  }

  private clusterLevels(levels: SupportResistanceLevel[], _currentPrice: number): SupportResistanceLevel[] {
    if (!levels.length) return [];
    const sorted = [...levels].sort((a, b) => a.price - b.price);
    const clustered: SupportResistanceLevel[] = [];
    let group: SupportResistanceLevel[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const diff = (sorted[i].price - group[group.length - 1].price) / group[group.length - 1].price;
      if (diff < 0.03) {
        group.push(sorted[i]);
      } else {
        clustered.push(this.mergeGroup(group));
        group = [sorted[i]];
      }
    }
    clustered.push(this.mergeGroup(group));
    return clustered;
  }

  private mergeGroup(group: SupportResistanceLevel[]): SupportResistanceLevel {
    const avgPrice = group.reduce((s, l) => s + l.price, 0) / group.length;
    const strengths: Record<string, number> = { strong: 3, moderate: 2, weak: 1 };
    const maxStrength = group.reduce((m, l) => Math.max(m, strengths[l.strength]), 0);
    const strengthMap: MomentumStrength[] = ['weak', 'moderate', 'strong'];
    return {
      price: +avgPrice.toFixed(2),
      strength: strengthMap[maxStrength - 1] ?? 'weak',
      type: group[0].type,
    };
  }

  private generateSignals(
    indicators: TechnicalIndicators,
    currentPrice: number,
    _data: HistoricalDataPoint[]
  ): TechnicalSignal[] {
    const signals: TechnicalSignal[] = [];
    const { rsi, movingAverages, volumeRatio, priceToSMA20 } = indicators;

    // RSI signals
    if (rsi.signal === 'oversold') {
      signals.push({ name: 'RSI Oversold', type: 'bullish', strength: 'moderate', description: `RSI at ${rsi.value} — potential reversal zone` });
    } else if (rsi.signal === 'overbought') {
      signals.push({ name: 'RSI Overbought', type: 'bearish', strength: 'moderate', description: `RSI at ${rsi.value} — potential pullback zone` });
    }

    // MA signals
    if (movingAverages.signal === 'golden_cross') {
      signals.push({ name: 'Golden Cross', type: 'bullish', strength: 'strong', description: 'MA50 crossed above MA200 — long-term bullish signal' });
    } else if (movingAverages.signal === 'death_cross') {
      signals.push({ name: 'Death Cross', type: 'bearish', strength: 'strong', description: 'MA50 crossed below MA200 — long-term bearish signal' });
    }

    // Price vs MA20
    if (currentPrice > movingAverages.ma20 && priceToSMA20 > 5) {
      signals.push({ name: 'Above MA20', type: 'bullish', strength: 'weak', description: `Price ${priceToSMA20.toFixed(1)}% above 20-day average` });
    } else if (currentPrice < movingAverages.ma20 && priceToSMA20 < -5) {
      signals.push({ name: 'Below MA20', type: 'bearish', strength: 'weak', description: `Price ${Math.abs(priceToSMA20).toFixed(1)}% below 20-day average` });
    }

    // Volume signals
    if (volumeRatio > 2) {
      signals.push({ name: 'High Volume', type: 'neutral', strength: 'moderate', description: `Volume ${volumeRatio.toFixed(1)}x above average — strong conviction` });
    }

    // MA alignment
    if (movingAverages.ma20 > movingAverages.ma50 && movingAverages.ma50 > movingAverages.ma200) {
      signals.push({ name: 'MA Bullish Alignment', type: 'bullish', strength: 'strong', description: 'MA20 > MA50 > MA200 — strong uptrend structure' });
    } else if (movingAverages.ma20 < movingAverages.ma50 && movingAverages.ma50 < movingAverages.ma200) {
      signals.push({ name: 'MA Bearish Alignment', type: 'bearish', strength: 'strong', description: 'MA20 < MA50 < MA200 — strong downtrend structure' });
    }

    return signals;
  }

  private determineTrend(indicators: TechnicalIndicators, signals: TechnicalSignal[]): TrendDirection {
    const bullish = signals.filter((s) => s.type === 'bullish').length;
    const bearish = signals.filter((s) => s.type === 'bearish').length;
    const { ma20, ma50, ma200 } = indicators.movingAverages;

    if (ma20 > ma50 && ma50 > ma200 && bullish > bearish) return 'bullish';
    if (ma20 < ma50 && ma50 < ma200 && bearish > bullish) return 'bearish';
    if (Math.abs(bullish - bearish) <= 1) return 'sideways';
    return bullish > bearish ? 'bullish' : 'bearish';
  }

  private determineMomentum(indicators: TechnicalIndicators): MomentumStrength {
    const { rsi, volumeRatio, priceToSMA20 } = indicators;
    const score = (rsi.signal !== 'neutral' ? 1 : 0) + (volumeRatio > 1.5 ? 1 : 0) + (Math.abs(priceToSMA20) > 5 ? 1 : 0);
    return score >= 2 ? 'strong' : score === 1 ? 'moderate' : 'weak';
  }

  private calculateConfidence(signals: TechnicalSignal[], dataPoints: number): number {
    let score = 40; // base
    score += Math.min(dataPoints / 10, 20); // more data = more confidence
    const strongSignals = signals.filter((s) => s.strength === 'strong').length;
    const moderateSignals = signals.filter((s) => s.strength === 'moderate').length;
    score += strongSignals * 10 + moderateSignals * 5;
    return Math.min(Math.round(score), 95);
  }

  private calculatePriceTargets(
    currentPrice: number,
    support: SupportResistanceLevel[],
    resistance: SupportResistanceLevel[],
    trend: TrendDirection
  ) {
    const multiplier = trend === 'bullish' ? 1 : trend === 'bearish' ? -1 : 0.3;
    const nearResistance = resistance[0]?.price ?? currentPrice * 1.05;
    const midResistance = resistance[1]?.price ?? currentPrice * 1.12;
    const farTarget = currentPrice * (1 + multiplier * 0.2);

    return [
      { timeframe: '1w' as const, targetPrice: +(currentPrice * (1 + multiplier * 0.02)).toFixed(2), upside: +(multiplier * 2).toFixed(2), probability: 65 },
      { timeframe: '1m' as const, targetPrice: +nearResistance.toFixed(2), upside: +(((nearResistance - currentPrice) / currentPrice) * 100).toFixed(2), probability: 55 },
      { timeframe: '3m' as const, targetPrice: +midResistance.toFixed(2), upside: +(((midResistance - currentPrice) / currentPrice) * 100).toFixed(2), probability: 45 },
      { timeframe: '6m' as const, targetPrice: +farTarget.toFixed(2), upside: +(((farTarget - currentPrice) / currentPrice) * 100).toFixed(2), probability: 35 },
    ];
  }

  private predictDividend(dividendHistory: DividendRecord[], _currentPrice: number) {
    if (!dividendHistory.length) {
      return { expectedDate: null, expectedAmountPerShare: null, confidence: 'low' as ConfidenceLevel, basedOn: 'No dividend history available' };
    }

    const sorted = [...dividendHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDiv = sorted[0];
    const avgAmount = sorted.reduce((s, d) => s + d.amountPerShare, 0) / sorted.length;

    // Estimate next date based on interval between last two dividends
    let nextDate: string | null = null;
    if (sorted.length >= 2) {
      const gap = new Date(sorted[0].date).getTime() - new Date(sorted[1].date).getTime();
      nextDate = new Date(new Date(lastDiv.date).getTime() + gap).toISOString().slice(0, 10);
    }

    return {
      expectedDate: nextDate,
      expectedAmountPerShare: +avgAmount.toFixed(2),
      confidence: sorted.length >= 3 ? ('high' as ConfidenceLevel) : ('medium' as ConfidenceLevel),
      basedOn: `Based on ${sorted.length} historical dividend payment(s)`,
    };
  }

  private identifyRisks(indicators: TechnicalIndicators, data: HistoricalDataPoint[]): string[] {
    const risks: string[] = [];
    if (indicators.volatility > 40) risks.push(`High volatility (${indicators.volatility.toFixed(0)}% annualized)`);
    if (indicators.rsi.signal === 'overbought') risks.push('RSI suggests overbought conditions — short-term pullback risk');
    if (indicators.movingAverages.signal === 'death_cross') risks.push('Death cross on moving averages — bearish trend signal');
    if (data.length < 50) risks.push('Limited historical data reduces prediction accuracy');
    if (indicators.volumeRatio < 0.3) risks.push('Very low trading volume — potential liquidity risk');
    return risks.length ? risks : ['No significant technical risks identified'];
  }

  private scoreToLevel(score: number): ConfidenceLevel {
    if (score >= 70) return 'high';
    if (score >= 45) return 'medium';
    return 'low';
  }

  private buildSummary(symbol: string, trend: TrendDirection, momentum: MomentumStrength, confidence: number, priceTargets: { targetPrice: number; upside: number; timeframe: string }[]): string {
    const target1m = priceTargets.find((t) => t.timeframe === '1m');
    const trendText = trend === 'bullish' ? 'uptrend' : trend === 'bearish' ? 'downtrend' : 'sideways movement';
    return `${symbol} shows ${momentum} ${trendText} (${confidence}% confidence). 1-month target: PKR ${target1m?.targetPrice.toLocaleString()} (${target1m?.upside > 0 ? '+' : ''}${target1m?.upside}%).`;
  }

  private buildInsufficientDataPrediction(symbol: string, currentPrice: number): StockPrediction {
    return {
      symbol, generatedAt: new Date().toISOString(), currentPrice,
      trendDirection: 'neutral', momentum: 'weak', confidenceScore: 10, confidenceLevel: 'low',
      supportLevels: [{ price: +(currentPrice * 0.95).toFixed(2), strength: 'weak', type: 'support' }],
      resistanceLevels: [{ price: +(currentPrice * 1.05).toFixed(2), strength: 'weak', type: 'resistance' }],
      priceTargets: [], dividendPrediction: { expectedDate: null, expectedAmountPerShare: null, confidence: 'low', basedOn: 'Insufficient data' },
      signals: [], summary: 'Insufficient historical data for reliable prediction (need at least 20 data points).', risks: ['Insufficient historical data'],
    };
  }
}

export const predictionEngine = new RuleBasedPredictionEngine();
