/**
 * Support / resistance levels for a held position's price chart (§12).
 *
 * Pure functions over daily OHLC history — the same local-minima/maxima scan the
 * removed prediction engine used, kept here because "held-stock support/resistance"
 * stays in Manage Portfolio while the prediction/research engine moves out to
 * MyPortfolio365.
 */
import type { HistoricalDataPoint, SupportResistanceLevel } from '@/types';
import { TECHNICAL } from '@/constants';

/** How many bars on either side a local extreme must beat to count as a pivot. */
const LOOKBACK = TECHNICAL.SUPPORT_RESISTANCE_LOOKBACK;

/** Count how many of `prices` sit within `tolerance` of `level`. */
function countTouches(prices: number[], level: number, tolerance: number): number {
  return prices.filter((p) => Math.abs(p - level) / level <= tolerance).length;
}

/** Merge a cluster of nearby levels into one, keeping the strongest strength. */
function mergeGroup(group: SupportResistanceLevel[]): SupportResistanceLevel {
  const avgPrice = group.reduce((s, l) => s + l.price, 0) / group.length;
  const strengths: Record<string, number> = { strong: 3, moderate: 2, weak: 1 };
  const maxStrength = group.reduce((m, l) => Math.max(m, strengths[l.strength]), 0);
  const strengthMap: SupportResistanceLevel['strength'][] = ['weak', 'moderate', 'strong'];
  return {
    price: +avgPrice.toFixed(2),
    strength: strengthMap[maxStrength - 1] ?? 'weak',
    type: group[0].type,
  };
}

/** Cluster levels within 3% of each other, then keep the merged groups. */
function clusterLevels(levels: SupportResistanceLevel[]): SupportResistanceLevel[] {
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clustered: SupportResistanceLevel[] = [];
  let group: SupportResistanceLevel[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i].price - group[group.length - 1].price) / group[group.length - 1].price;
    if (diff < 0.03) {
      group.push(sorted[i]);
    } else {
      clustered.push(mergeGroup(group));
      group = [sorted[i]];
    }
  }
  clustered.push(mergeGroup(group));
  return clustered;
}

/** Local minima below the current price — the levels the chart draws as support. */
function findSupportLevels(data: HistoricalDataPoint[], currentPrice: number): SupportResistanceLevel[] {
  const lows = data.slice(-LOOKBACK).map((d) => d.low);
  const levels: SupportResistanceLevel[] = [];

  for (let i = 2; i < lows.length - 2; i++) {
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      const price = lows[i];
      if (price < currentPrice) {
        const touchCount = countTouches(lows, price, 0.02);
        levels.push({
          price: +price.toFixed(2),
          strength: touchCount >= 3 ? 'strong' : touchCount >= 2 ? 'moderate' : 'weak',
          type: 'support',
        });
      }
    }
  }

  return clusterLevels(levels)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
}

/** Local maxima above the current price — the levels the chart draws as resistance. */
function findResistanceLevels(data: HistoricalDataPoint[], currentPrice: number): SupportResistanceLevel[] {
  const highs = data.slice(-LOOKBACK).map((d) => d.high);
  const levels: SupportResistanceLevel[] = [];

  for (let i = 2; i < highs.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      const price = highs[i];
      if (price > currentPrice) {
        const touchCount = countTouches(highs, price, 0.02);
        levels.push({
          price: +price.toFixed(2),
          strength: touchCount >= 3 ? 'strong' : touchCount >= 2 ? 'moderate' : 'weak',
          type: 'resistance',
        });
      }
    }
  }

  return clusterLevels(levels)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
}

/**
 * Both level sets from one price series. An empty result means the series was too
 * short to call pivots honestly — never a substituted number.
 */
export function deriveSupportResistance(
  data: HistoricalDataPoint[],
  currentPrice: number,
): { supportLevels: SupportResistanceLevel[]; resistanceLevels: SupportResistanceLevel[] } {
  if (data.length < 20 || !Number.isFinite(currentPrice)) {
    return { supportLevels: [], resistanceLevels: [] };
  }
  return {
    supportLevels: findSupportLevels(data, currentPrice),
    resistanceLevels: findResistanceLevels(data, currentPrice),
  };
}
