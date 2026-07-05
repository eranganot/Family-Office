import type { SnapshotPayload } from "@wealthos/domain";

/**
 * Data-quality gate: the engine REFUSES to produce recommendations when the
 * underlying data is too weak, and caps confidence otherwise. Refusal returns a
 * data-gap report — never a low-quality recommendation set.
 */
export interface GateThresholds {
  minCompleteness: number;
  minConfidence: number;
}

export type GateResult =
  | { pass: true; confidenceCap: number }
  | { pass: false; report: DataGapReport };

export interface DataGapReport {
  completenessScore: number;
  confidenceScore: number;
  minCompleteness: number;
  minConfidence: number;
  pendingSuspense: number;
  unconvertedItemIds: string[];
  guidance: string[];
}

export function evaluateGate(snapshot: SnapshotPayload, thresholds: GateThresholds): GateResult {
  const { completenessScore, confidenceScore, pendingSuspense, unconvertedItemIds } = snapshot.dataQuality;
  const failures: string[] = [];
  if (completenessScore < thresholds.minCompleteness) failures.push(`COMPLETENESS_BELOW_${thresholds.minCompleteness}`);
  if (confidenceScore < thresholds.minConfidence) failures.push(`CONFIDENCE_BELOW_${thresholds.minConfidence}`);
  if (pendingSuspense > 0) failures.push("PENDING_SUSPENSE");

  if (failures.length > 0) {
    return {
      pass: false,
      report: {
        completenessScore,
        confidenceScore,
        minCompleteness: thresholds.minCompleteness,
        minConfidence: thresholds.minConfidence,
        pendingSuspense,
        unconvertedItemIds,
        guidance: failures,
      },
    };
  }
  // Confidence of any recommendation may not exceed the data confidence beneath it.
  return { pass: true, confidenceCap: confidenceScore };
}
