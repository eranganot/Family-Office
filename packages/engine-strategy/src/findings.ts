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
}

export const ENGINE_VERSION = "strategy-engine/1.0.0";
