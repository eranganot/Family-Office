export { OPERATIONS_ENGINE_VERSION } from "./version";
export * from "./types";
export { DEFAULT_CATEGORY_TREE, type SeedCategory } from "./categories";
export { normalizeMerchantKey, stripBidiControls, repairVisualOrderHebrew } from "./merchant-key";
export { classify, reconcileWithSign } from "./classify";
export type { ClassificationResult, ClassificationMethod, ClassifyInput, ClassifyOptions } from "./classify";
export {
  computeMonthlyCashFlow,
  computeVerifiedSurplus,
  computeSafeToSpend,
  computeWorkingCapital,
} from "./surplus";
export type { TxnView, PeriodInput, SafeToSpendInput, DiscretionaryLiquidityFloor } from "./surplus";
export { detectStatementRange, normaliseToMonthly, baselineFromMonths } from "./normalize";
export type { StatementRange, StatementRangeKind, MonthlyBaseline } from "./normalize";
export {
  reconcileSettlements,
  projectRemainingInstalments,
  committedInstalmentsInWindow,
} from "./settlement";
export type {
  SettlementCandidate,
  CardStatementTotal,
  SettlementOutcome,
  InstalmentTxn,
  FutureInstalment,
} from "./settlement";

// --- M41: end-of-year projection (current vs optimised) ---
export { projectEndOfYear } from "./eoy-projection";
export type {
  ClosedMonth,
  PendingImpact,
  EoyProjectionInput,
  EoyMonthPoint,
  EoyProjection,
} from "./eoy-projection";

// --- M40a: opportunity analyzers ---
export {
  runOpportunityAnalyzers,
  OPPORTUNITY_ANALYZERS,
  analyzeLeakage,
  analyzeFxMarkup,
  priceFxRows,
  referenceRateOn,
  analyzeSubscriptions,
  analyzeRenegotiation,
  analyzeDeadlines,
  analyzeCashflowTiming,
  bucketCommittedByMonth,
  bucketDragByMonth,
  clusterSubscriptions,
} from "./opportunities/index";
export type {
  OpportunityFinding,
  OpportunitySeverity,
  OpportunityAssumptions,
  OpportunityTxn,
  OpportunityCalendarEvent,
  OpportunityFxRate,
  OpportunityInput,
  SubscriptionCluster,
} from "./opportunities/index";
