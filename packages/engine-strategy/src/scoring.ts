import type { RecommendationDraft } from "./rationale";

/** Weights come from the priority_weights assumption — never hardcoded. */
export interface PriorityWeights {
  impact: number;
  ease: number;
  taxBenefit: number;
  riskReduction: number;
  goalContribution: number;
  urgency: number;
}

export function scorePriority(draft: RecommendationDraft, weights: PriorityWeights): number {
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (total <= 0) throw new Error("PRIORITY_WEIGHTS_INVALID");
  const weighted =
    draft.subscores.impact * weights.impact +
    draft.subscores.ease * weights.ease +
    draft.subscores.taxBenefit * weights.taxBenefit +
    draft.subscores.riskReduction * weights.riskReduction +
    draft.subscores.goalContribution * weights.goalContribution +
    draft.subscores.urgency * weights.urgency;
  return Math.round((weighted / total) * 100) / 100;
}
