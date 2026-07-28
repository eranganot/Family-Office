/**
 * M36 — the Operations read-model contracts.
 *
 * These types are the ONLY thing engine-strategy is permitted to import from
 * engine-operations (doc 04 dependency matrix, documented exception). Keeping
 * the seam types-only is what stops the two cadences from coupling.
 */

export type { BehavioralClassKey, CategoryAxisKey } from "@wealthos/domain";

/** Why a figure could not be produced. Engines never guess — they refuse and explain. */
export type RefusalReason =
  | "NO_INCOME_MAPPED"
  | "NO_EXPENSES_MAPPED"
  | "INSUFFICIENT_COVERAGE"
  | "MISSING_FX_RATE"
  | "NO_CLOSED_PERIOD";

export interface Refusal {
  ok: false;
  reason: RefusalReason;
  /** Machine-readable detail for the UI to render a fix hint. */
  detail?: Record<string, string | number> | undefined;
}

export interface CategoryTotal {
  categoryId: string;
  categoryKey: string;
  amountBase: number;
}

/**
 * Behavioural totals are EXPENSE-SIDE ONLY (plus TRANSFER, which is its own excluded
 * bucket). Income is never classified as "fixed" or "discretionary" here — including it
 * would inflate the fixed bucket and make the Safe-to-Spend floor nonsensical.
 */
export interface BehavioralTotals {
  FIXED_CONTRACTUAL: number;
  VARIABLE_DISCRETIONARY: number;
  FINANCIAL_DRAG: number;
  SAVINGS_FLOW: number;
  TRANSFER: number;
}

/** The dual-axis result for one month: functional tree totals + behavioral totals. */
export interface MonthlyCashFlow {
  ok: true;
  year: number;
  month: number;
  incomeBase: number;
  expensesBase: number;
  byCategory: CategoryTotal[];
  byBehavioral: BehavioralTotals;
  /** Contributions to pension / hishtalmut / gemel — capital already deployed, not expense. */
  savingsFlowsBase: number;
  leakageBase: number;
  transfersExcludedBase: number;
  unverifiedCount: number;
  unverifiedAmountBase: number;
  /**
   * Card charges the issuer has not billed yet (עסקאות בתהליך קליטה). Excluded from the
   * settled totals — the money has not left the account — but reported so they are never
   * invisible, and subtracted from Safe-to-Spend because they ARE committed.
   */
  pendingCount: number;
  pendingAmountBase: number;
  coverage: "COMPLETE" | "PARTIAL" | "AGGREGATE_ONLY";
}

/** What engine-strategy's deployment engine consumes. */
export interface VerifiedSurplus {
  ok: true;
  monthlyBase: number;
  periodId: string;
  year: number;
  month: number;
  /** True when the month still contains unreviewed classifications. */
  provisional: boolean;
  engineVersion: string;
}

export type MonthlyCashFlowResult = MonthlyCashFlow | Refusal;
export type VerifiedSurplusResult = VerifiedSurplus | Refusal;

export function isRefusal(r: { ok: boolean }): r is Refusal {
  return r.ok === false;
}
