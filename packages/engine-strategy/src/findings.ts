/** Analyzer output: structured findings, each traceable to evidence items. */

export type FindingSeverity = "INFO" | "NOTICE" | "WARNING";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  metrics: Record<string, number | string>;
  evidenceItemIds: string[];
}

/** Inputs every analyzer receives besides the snapshot. */
export interface AnalyzerContext {
  assumptions: Record<string, unknown>;
  taxRules: Record<string, unknown>;
  /** Fetched market indicators (B6): BOI policy rate anchors the mortgage refinance benchmark. */
  marketRates?: { boiRatePct: number | null } | undefined;
  /** M30: the approved ALLOCATION-phase plan. Strategy analyzers suppress findings the household
   *  already decided to act on, so strategy recommendations stay ALIGNED with the approved plan. */
  committedPlan?: {
    deploysIdleCash: boolean;
    investsGrowth: boolean;
    repaidTrackItemIds: string[];
    taxDeposited: boolean;
  } | undefined;
  /**
   * M41 #6: ONE closed month's VERIFIED surplus, in base currency, handed over from the
   * operations module. Optional so every existing caller keeps working unchanged.
   *
   * Three rules the caller owns, not this engine:
   *  1. It is a VERIFIED figure. A provisional surplus must never be passed —
   *     `allocationHandoffReadiness` refuses one, and that refusal is the whole reason
   *     the readiness query was built before this wiring.
   *  2. It is ONE month, never annualised. Multiplying a forecast by twelve and calling
   *     the product deployable cash is how a household deploys money it does not have.
   *  3. It is a FORECAST that recurs, not banked money — which is why this engine reports
   *     it separately from cash rather than folding it into one figure.
   */
  deployableSurplusBase?: number | undefined;
}

export const ENGINE_VERSION = "strategy-engine/1.0.0";
