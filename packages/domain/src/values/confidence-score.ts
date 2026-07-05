import { z } from "zod";

/** Integer 0–100. 0 = unverified guess, 100 = human-verified. */
export const ConfidenceScoreSchema = z.number().int().min(0).max(100);
export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

export function confidenceScore(value: number): ConfidenceScore {
  return ConfidenceScoreSchema.parse(value);
}
