import { analyzeDeadlines } from "./deadlines";
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
  analyzeSubscriptions,
  analyzeRenegotiation,
  analyzeDeadlines,
] as const;

export function runOpportunityAnalyzers(input: OpportunityInput): OpportunityFinding[] {
  return OPPORTUNITY_ANALYZERS.flatMap((analyze) => analyze(input));
}

export { analyzeLeakage, bucketDragByMonth } from "./leakage";
export { analyzeSubscriptions, clusterSubscriptions } from "./subscriptions";
export type { SubscriptionCluster } from "./subscriptions";
export { analyzeRenegotiation } from "./renegotiation";
export { analyzeDeadlines } from "./deadlines";
export type {
  OpportunityFinding,
  OpportunitySeverity,
  OpportunityAssumptions,
  OpportunityTxn,
  OpportunityCalendarEvent,
  OpportunityInput,
} from "./types";
