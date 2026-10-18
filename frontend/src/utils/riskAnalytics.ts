/**
 * Portfolio risk analytics (issue #95).
 *
 * Pure, provider-agnostic math over daily price/return series. Every metric is
 * historical: it describes what happened over the supplied lookback, never what
 * will happen. When the sample is too small to be meaningful the metric is
 * `null` (rendered "N/A"), never a fabricated number.
 *
 * Conventions (documented so the UI can label each metric):
 *  - Lookback: whatever series the caller supplies; callers pass a ~1-year
 *    window unless the symbol has less history.
 *  - Annualization: 252 trading days per year.
 *  - Risk-free rate (Sharpe): 13% annual (State Bank of Pakistan policy rate as
 *    of 2026), treated as a constant daily rate.
 *  - Returns: simple daily returns `close_t / close_{t-1} - 1`.
 */

export const TRADING_DAYS = 252;
export const RISK_FREE_RATE = 0.13; // annual
export const MIN_SAMPLES = 20; // minimum returns for a meaningful annualized metric

/** Guard against near-zero variance/std from floating-point noise on flat series. */
const EPSILON = 1e-12;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample (n − 1) standard deviation. Callers guard sample size first. */
function sampleStd(xs: number[]): number {
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Sample (n − 1) variance of `xs`. */
function sampleVariance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

/** Sample (n − 1) covariance of two equal-length, aligned series. */
function covariance(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  return a.reduce((acc, x, i) => acc + (x - ma) * (b[i] - mb), 0) / (a.length - 1);
}

/** Daily simple returns from a chronological price series; non-positive prices are skipped. */
export function toReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    if (prev > 0 && cur > 0) returns.push(cur / prev - 1);
  }
  return returns;
}

/** Largest peak-to-trough decline, as a negative fraction (−0.25 = 25% drawdown). Null under 2 points. */
export function maxDrawdown(prices: number[]): number | null {
  if (prices.length < 2) return null;
  let peak = prices[0];
  let worst = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = p / peak - 1;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/** Annualized historical volatility (sample σ × √252). Null when the sample is too small. */
export function annualizedVolatility(returns: number[]): number | null {
  if (returns.length < MIN_SAMPLES) return null;
  return sampleStd(returns) * Math.sqrt(TRADING_DAYS);
}

/**
 * Beta vs a market series (cov(stock, market) / var(market)).
 * Requires equal-length, date-aligned series with enough overlap; null when
 * short, mismatched, or the market has no variance.
 */
export function beta(stock: number[], market: number[]): number | null {
  if (stock.length !== market.length || stock.length < MIN_SAMPLES) return null;
  const mVariance = sampleVariance(market);
  if (mVariance < EPSILON) return null;
  return covariance(stock, market) / mVariance;
}

/**
 * Annualized Sharpe ratio: (mean daily excess return / σ daily) × √252, where
 * excess = return − daily risk-free rate. Null when the sample is too small or
 * returns are flat (zero σ).
 */
export function sharpeRatio(returns: number[], riskFreeRate = RISK_FREE_RATE): number | null {
  if (returns.length < MIN_SAMPLES) return null;
  const std = sampleStd(returns);
  if (std < EPSILON) return null;
  const rfDaily = riskFreeRate / TRADING_DAYS;
  const excess = mean(returns) - rfDaily;
  return (excess / std) * Math.sqrt(TRADING_DAYS);
}

/**
 * Pearson correlation of two equal-length, date-aligned return series.
 * Null when short, mismatched, or either series is flat (zero σ).
 */
export function correlation(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < MIN_SAMPLES) return null;
  const sa = sampleStd(a);
  const sb = sampleStd(b);
  if (sa < EPSILON || sb < EPSILON) return null;
  return covariance(a, b) / (sa * sb);
}
