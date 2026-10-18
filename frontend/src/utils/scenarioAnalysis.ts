/**
 * Scenario analysis (issue #96).
 *
 * A what-if on the current holdings: apply a uniform percentage price change to
 * every priced holding and show the resulting market value and P/L. Purely
 * hypothetical — the inputs are today's prices, and the output is arithmetic,
 * never a forecast or prediction.
 */

export interface ScenarioInput {
  currentValue: number;
  costBasis: number;
}

export interface ScenarioResult {
  change: number; // price change as a fraction (e.g. -0.20, 0.05)
  marketValue: number; // resulting portfolio market value
  profitLoss: number; // resulting value − cost basis
}

/** The preset what-ifs the UI offers. */
export const DEFAULT_SCENARIOS = [-0.2, -0.1, -0.05, 0.05, 0.1, 0.2];

/**
 * Resulting value/P&L for each percentage change. Holdings with no price are
 * excluded by the caller (they have no `currentValue` to move).
 */
export function scenarioAnalysis(
  inputs: ScenarioInput[],
  changes: number[],
): ScenarioResult[] {
  const cost = inputs.reduce((a, h) => a + h.costBasis, 0);

  return changes.map((change) => {
    const marketValue = inputs.reduce((a, h) => a + h.currentValue * (1 + change), 0);
    return { change, marketValue, profitLoss: marketValue - cost };
  });
}
