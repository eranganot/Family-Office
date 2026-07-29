import { analyzeCashflowTiming } from "./cashflow-timing";
import { analyzeDeadlines } from "./deadlines";
import { analyzeFxMarkup } from "./fx-markup";
import { analyzeLeakage } from "./leakage";
import { analyzeRenegotiation } from "./renegotiation";
import { analyzeSubscriptions } from "./subscriptions";
import type { OpportunityFinding, OpportunityInput } from "./types";

/**
 * M40a — the operational opportunity analyzers.
 *
 * Registry-driven and pure: same input, same findings, always. Order is stable so
 * that a diff between two runs is a real change and not a reshuffle.
 */
export const OPPORTUNITY_ANALYZERS = [
  analyzeLeakage,
  analyzeFxMarkup,
  analyzeSubscriptions,
  analyzeRenegotiation,
  analyzeCashflowTiming,
  analyzeDeadlines,
] as const;

export function runOpportunityAnalyzers(input: OpportunityInput): OpportunityFinding[] {
  return OPPORTUNITY_ANALYZERS.flatMap((analyze) => analyze(input));
}

export { analyzeLeakage, bucketDragByMonth } from "./leakage";
export { analyzeFxMarkup, priceFxRows, referenceRateOn } from "./fx-markup";
export { analyzeSubscriptions, clusterSubscriptions } from "./subscriptions";
export type { SubscriptionCluster } from "./subscriptions";
export { analyzeRenegotiation } from "./renegotiation";
export { analyzeDeadlines } from "./deadlines";
export { analyzeCashflowTiming, bucketCommittedByMonth } from "./cashflow-timing";
export type {
  OpportunityFinding,
  OpportunitySeverity,
  OpportunityAssumptions,
  OpportunityTxn,
  OpportunityCalendarEvent,
  OpportunityFxRate,
  OpportunityInput,
} from "./types";
