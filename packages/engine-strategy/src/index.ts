export { runAnalyzers, ANALYZERS, deriveTargetGrowthPct } from "./analyzers/index";
export { ENGINE_VERSION } from "./findings";
export type { AnalyzerContext, Finding, FindingSeverity } from "./findings";
export { generateRecommendations } from "./generators";
export type { GenerationResult } from "./generators";
export { RationaleSchema } from "./rationale";
export type { Rationale, RecommendationDraft } from "./rationale";
export { validateStrategyText } from "./validator";
export { actionItemsFor } from "./action-items";
export { computeDeploymentPlans } from "./deployment";
export { computePlanImpact } from "./impact";
export type { PlanImpact, PlanSelection } from "./impact";
export type { DeploymentPlans, DeploymentVariant, DeploymentVariantKey, DeploymentStep, DeploymentStepKind, DeploymentNote, DeploymentCandidate, PresetEntry } from "./deployment";
export type { ActionItems } from "./action-items";
export { scorePriority } from "./scoring";
export type { PriorityWeights } from "./scoring";
export { evaluateGate } from "./gate";
export type { GateResult, GateThresholds, DataGapReport } from "./gate";
export { synthesizeStrategy } from "./synthesis";
export type {
  StrategySynthesis,
  StrategySynthesisInput,
  StrategyNarrativeText,
  StrategyMetrics,
  CommittedMoves,
  FundingSummary,
} from "./synthesis";
