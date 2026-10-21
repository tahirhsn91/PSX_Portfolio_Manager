/**
 * Average-down / average-up planner maths.
 *
 * Pure and storage-free: the page hands in the numbers, this returns either a
 * plan or the one reason it cannot be built. Everything is computed unrounded
 * and only rounded for display (money to 2 dp in the page).
 */

export type AverageDirection = 'down' | 'up';

export interface AverageDownInput {
  /** Shares already held. */
  shares: number;
  /** Current average purchase price (PKR). */
  averagePrice: number;
  /** Current market price (PKR), before fees. */
  marketPrice: number;
  /** The average the user wants to reach (PKR). */
  target: number;
  /** `down` (default) or `up`; controls which targets are valid. */
  direction?: AverageDirection;
  /** Optional cap on the cash the user can spend, fees included. */
  budget?: number | null;
  /** Brokerage + CVT + other charges, as a percentage (0.15 = 0.15%). */
  feePercent?: number;
}

export type AverageDownFailureReason =
  | 'invalid-input'
  | 'no-holding'
  | 'already-at-target'
  | 'target-above-price'
  | 'target-not-below-average'
  | 'target-below-price'
  | 'target-not-above-average';

export interface AverageDownSuccess {
  ok: true;
  direction: AverageDirection;
  /** Whole shares to buy, rounded up. Equals `sharesForTarget` unless a budget caps it. */
  sharesToBuy: number;
  /** Whole shares the target itself needs, before any budget cap. */
  sharesForTarget: number;
  /** Exact (unrounded) answer, useful for a "needs 221.62" hint. */
  sharesExact: number;
  /** sharesToBuy × marketPrice. */
  grossCost: number;
  /** Brokerage on the purchase. */
  fees: number;
  /** grossCost + fees — the cash that leaves the account. */
  cashRequired: number;
  totalShares: number;
  newAverage: number;
  newInvested: number;
  /** averagePrice − newAverage (positive is an improvement). */
  averageReduction: number;
  averageReductionPercent: number;
  /** True when the budget could not buy enough shares to reach the target. */
  budgetCapped: boolean;
  /** With a budget cap: the best average the budget can buy. */
  achievableAverage: number | null;
  /** With a budget cap: achievableAverage − target (signed; positive = short). */
  targetGap: number | null;
  /** The per-share cost including fees. */
  effectivePrice: number;
}

export interface AverageDownFailure {
  ok: false;
  reason: AverageDownFailureReason;
  message: string;
}

export type AverageDownPlan = AverageDownSuccess | AverageDownFailure;

export interface AverageDownScenario {
  shares: number;
  grossCost: number;
  fees: number;
  cashRequired: number;
  totalShares: number;
  newAverage: number;
  /** newAverage − target (signed). */
  distanceToTarget: number;
  reachesTarget: boolean;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Clamp the charge to something a broker could plausibly ask for. */
export function clampFeePercent(value: number | null | undefined): number {
  if (!finite(value) || value <= 0) return 0;
  return Math.min(value, 10);
}

function fail(reason: AverageDownFailureReason, message: string): AverageDownFailure {
  return { ok: false, reason, message };
}

/**
 * Solve `(S·A + x·P) / (S + x) = T` for `x`, with fees capitalised into the
 * purchase price when a fee percentage is supplied.
 */
export function planAverage(input: AverageDownInput): AverageDownPlan {
  const { shares, averagePrice, marketPrice, target } = input;
  const direction: AverageDirection = input.direction ?? 'down';
  const feePercent = clampFeePercent(input.feePercent);
  const fee = feePercent / 100;

  if (
    !finite(shares) || !finite(averagePrice) || !finite(marketPrice) || !finite(target) ||
    shares < 0 || averagePrice <= 0 || marketPrice <= 0 || target <= 0
  ) {
    return fail('invalid-input', 'Enter your shares, average price, market price and target to see a plan.');
  }
  if (shares === 0) {
    return fail('no-holding', 'You do not hold this stock yet, so there is no average to move.');
  }
  if (target === averagePrice) {
    return fail('already-at-target', 'You are already at this average.');
  }

  // Fees raise the real cost of each new share, so they raise the floor a target
  // must clear to be reachable at all.
  const effectivePrice = marketPrice * (1 + fee);

  if (direction === 'down') {
    if (target <= effectivePrice) {
      return fail(
        'target-above-price',
        'Target average must be higher than the current market price. It is impossible to reach it by buying at this price.',
      );
    }
    if (target >= averagePrice) {
      return fail('target-not-below-average', 'Target must be lower than your current average.');
    }
  } else {
    if (target >= effectivePrice) {
      return fail('target-below-price', 'Target average must be lower than the current market price.');
    }
    if (target <= averagePrice) {
      return fail('target-not-above-average', 'Target must be higher than your current average.');
    }
  }

  const sharesExact = (shares * averagePrice - target * shares) / (target - effectivePrice);
  if (!Number.isFinite(sharesExact) || sharesExact < 0) {
    return fail(
      'target-above-price',
      direction === 'down'
        ? 'Target average must be higher than the current market price. It is impossible to reach it by buying at this price.'
        : 'Target average must be lower than the current market price. It is impossible to reach it by buying at this price.',
    );
  }

  const sharesToBuy = Math.ceil(sharesExact - 1e-9);

  // A budget caps the purchase at what the money actually buys, fees included.
  const budget = finite(input.budget) && input.budget > 0 ? input.budget : null;
  const affordableShares = budget === null ? null : Math.floor((budget + 1e-9) / effectivePrice);
  const budgetCapped = affordableShares !== null && affordableShares < sharesToBuy;
  const finalShares = budgetCapped ? Math.max(0, affordableShares) : sharesToBuy;

  const grossCost = round2(finalShares * marketPrice);
  const fees = round2(finalShares * marketPrice * fee);
  const cashRequired = round2(grossCost + fees);
  const currentCost = shares * averagePrice;
  const newInvested = round2(currentCost + cashRequired);
  const newAverage = (currentCost + cashRequired) / (shares + finalShares);
  const achievableAverage = budgetCapped
    ? (currentCost + finalShares * effectivePrice) / (shares + finalShares)
    : null;

  return {
    ok: true,
    direction,
    sharesToBuy: finalShares,
    sharesForTarget: sharesToBuy,
    sharesExact,
    grossCost,
    fees,
    cashRequired,
    totalShares: shares + finalShares,
    newAverage,
    newInvested,
    averageReduction: averagePrice - newAverage,
    averageReductionPercent: ((averagePrice - newAverage) / averagePrice) * 100,
    budgetCapped,
    achievableAverage,
    targetGap: achievableAverage === null ? null : achievableAverage - target,
    effectivePrice,
  };
}

/** What the average would be after buying `shares` at the market price. */
export function averageAfterBuy(
  shares: number,
  averagePrice: number,
  marketPrice: number,
  buyShares: number,
  feePercent = 0,
): number {
  if (buyShares <= 0) return averagePrice;
  const fee = clampFeePercent(feePercent) / 100;
  const cost = shares * averagePrice + buyShares * marketPrice * (1 + fee);
  return cost / (shares + buyShares);
}

/** Rows for the what-if table. Duplicates are removed and the list is sorted. */
export function whatIfScenarios(
  input: AverageDownInput,
  quantities: number[],
): AverageDownScenario[] {
  const feePercent = clampFeePercent(input.feePercent);
  const fee = feePercent / 100;
  const target = input.target;
  const unique = [...new Set(quantities.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.round(n)))]
    .sort((a, b) => a - b);

  return unique.map((shares) => {
    const grossCost = round2(shares * input.marketPrice);
    const fees = round2(shares * input.marketPrice * fee);
    const newAverage = averageAfterBuy(
      input.shares,
      input.averagePrice,
      input.marketPrice,
      shares,
      feePercent,
    );
    const reachesTarget =
      input.direction === 'up' ? newAverage >= target - 1e-9 : newAverage <= target + 1e-9;
    return {
      shares,
      grossCost,
      fees,
      cashRequired: round2(grossCost + fees),
      totalShares: input.shares + shares,
      newAverage,
      distanceToTarget: newAverage - target,
      reachesTarget,
    };
  });
}

/** Points for the average-price-vs-shares curve, from 0 to `maxShares`. */
export function averageCurve(
  input: AverageDownInput,
  maxShares: number,
  steps = 32,
): { shares: number; average: number }[] {
  if (!Number.isFinite(maxShares) || maxShares <= 0) return [];
  const count = Math.max(2, Math.min(steps, 200));
  return Array.from({ length: count + 1 }, (_, i) => {
    const shares = Math.round((maxShares * i) / count);
    return {
      shares,
      average: averageAfterBuy(
        input.shares,
        input.averagePrice,
        input.marketPrice,
        shares,
        input.feePercent,
      ),
    };
  });
}
