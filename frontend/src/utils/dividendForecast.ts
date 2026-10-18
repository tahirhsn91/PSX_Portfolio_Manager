/**
 * A dividend forecast from a holding's received-dividend history.
 *
 * A pattern, never a promise: the next date is the last payment plus the most
 * recent interval, and the amount is the history's average. Kept here because the
 * dividend calendar (declared + estimated) stays in Manage Portfolio, while the
 * prediction engine that used to compute this moves out to MyPortfolio365.
 */
import type { DividendRecord } from '@/types';

export type DividendForecastConfidence = 'high' | 'medium' | 'low';

export interface DividendForecast {
  expectedDate: string | null;
  expectedAmountPerShare: number | null;
  confidence: DividendForecastConfidence;
  basedOn: string;
}

export function forecastDividend(dividendHistory: DividendRecord[]): DividendForecast {
  if (!dividendHistory.length) {
    return {
      expectedDate: null,
      expectedAmountPerShare: null,
      confidence: 'low',
      basedOn: 'No dividend history available',
    };
  }

  const sorted = [...dividendHistory].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const lastDiv = sorted[0];
  const avgAmount = sorted.reduce((s, d) => s + d.amountPerShare, 0) / sorted.length;

  // Estimate the next date from the interval between the two most recent payments.
  let nextDate: string | null = null;
  if (sorted.length >= 2) {
    const gap = new Date(sorted[0].date).getTime() - new Date(sorted[1].date).getTime();
    nextDate = new Date(new Date(lastDiv.date).getTime() + gap).toISOString().slice(0, 10);
  }

  return {
    expectedDate: nextDate,
    expectedAmountPerShare: +avgAmount.toFixed(2),
    confidence: sorted.length >= 3 ? 'high' : 'medium',
    basedOn: `Based on ${sorted.length} historical dividend payment(s)`,
  };
}
