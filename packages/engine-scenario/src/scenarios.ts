import { BASELINE_PARAMS, type ProjectionParams } from "./projector";

/** Canned what-if scenarios: overrides applied to the baseline parameters. */
export type CannedScenarioType =
  | "RETIRE_EARLIER"
  | "RETIRE_LATER"
  | "JOB_LOSS"
  | "MARKET_CRASH"
  | "HIGH_INFLATION"
  | "MORTGAGE_REFINANCE"
  | "SAVINGS_RATE_UP"
  | "SAVINGS_RATE_DOWN";

export const CANNED_SCENARIOS: Record<CannedScenarioType, Partial<ProjectionParams>> = {
  /** Income stops 5 years into the horizon (vs never in baseline). */
  RETIRE_EARLIER: { incomeStopsAtYear: 6 },
  /** Income stops at year 11 — compare against RETIRE_EARLIER, not baseline. */
  RETIRE_LATER: { incomeStopsAtYear: 11 },
  /** Total income loss for 12 months starting next year. */
  JOB_LOSS: { incomeShock: { startYear: 1, months: 12, reductionPct: 100 } },
  /** -30% investable drawdown in year 1. */
  MARKET_CRASH: { marketShock: { year: 1, drawdownPct: 30 } },
  /** Inflation runs 3pp above baseline — hits CPI-linked debt in real terms. */
  HIGH_INFLATION: { inflationDeltaPct: 3 },
  /** Refinance: all mortgage tracks 1pp cheaper. */
  MORTGAGE_REFINANCE: { mortgageRateDeltaPct: -1 },
  SAVINGS_RATE_UP: { extraMonthlySavings: 2_000 },
  SAVINGS_RATE_DOWN: { extraMonthlySavings: -2_000 },
};

export function buildScenarioParams(
  years: number,
  realReturnPct: number,
  overrides: Partial<ProjectionParams>,
): ProjectionParams {
  return { years, realReturnPct, ...BASELINE_PARAMS, ...overrides };
}
