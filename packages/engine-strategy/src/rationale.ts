import { z } from "zod";

/** Every recommendation carries this full explainability block — no exceptions. */
export const RationaleSchema = z.object({
  why: z.string().min(1),
  benefits: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
  tradeoffs: z.array(z.string()).min(1),
  taxImplications: z.string(),
  liquidityImplications: z.string(),
  timeHorizon: z.enum(["IMMEDIATE", "SHORT", "MEDIUM", "LONG"]),
  sensitivity: z.string(),
  alternatives: z.array(z.string()).min(1),
  expectedImpact: z.string(),
});
export type Rationale = z.infer<typeof RationaleSchema>;

export interface RecommendationDraft {
  type: string;
  title: string;
  titleHe: string;
  rationale: Rationale;
  /** Full Hebrew rationale — same structure, same enum values for timeHorizon. */
  rationaleHe: Rationale;
  /** Subscores 0-100, weighted by the priority_weights assumption. */
  subscores: { impact: number; ease: number; taxBenefit: number; riskReduction: number; goalContribution: number; urgency: number };
  confidence: number; // 0-100, pre-gate
  evidenceItemIds: string[];
  goalTypesImproved: string[]; // linked to concrete goal ids at persistence
  assumptionKeysUsed: string[];
}
