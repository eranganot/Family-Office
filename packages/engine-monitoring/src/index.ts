export { computeMetrics, isAssetKind, isLiabilityKind, isLiquid, isRetirement } from "./metrics";
export type { HouseholdMetrics } from "./metrics";
export { detectDrift } from "./drift";
export type {
  DriftReport,
  DriftFinding,
  DriftKind,
  DriftSeverity,
  DriftThresholds,
  RecommendedAction,
} from "./drift";
export { sweepStaleness } from "./staleness";
export { sweepRecommendationReviews } from "./recommendation-review";
export type { StalenessInput, StalenessResult, StaleItem } from "./staleness";
export type { AcceptedRecInput, RecReviewItem, RecReviewResult } from "./recommendation-review";

export const MONITORING_ENGINE_VERSION = "monitoring-engine/1.0.0";
