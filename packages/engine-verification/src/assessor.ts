/**
 * VerificationAssessor v1 — pure functions over ledger projections.
 * Computes per-item issues and a household-wide data-quality picture.
 * Thresholds are conservative constants for now; they move to the
 * AssumptionRegistry in M4 (recorded design note, not debt).
 */

export interface ItemProjection {
  id: string;
  name: string;
  kind: string;
  verification: "UNVERIFIED" | "VERIFIED" | "REJECTED" | "STALE";
  confidence: number;
  lastConfirmedAt: Date | null;
  latestValuationAsOf: Date | null;
}

export type ItemIssue =
  | { type: "NO_VALUATION" }
  | { type: "STALE_VALUATION"; ageDays: number; thresholdDays: number }
  | { type: "NEVER_CONFIRMED" }
  | { type: "LOW_CONFIDENCE"; confidence: number }
  | { type: "REJECTED" };

export interface ItemAssessment {
  id: string;
  name: string;
  kind: string;
  verified: boolean;
  issues: ItemIssue[];
}

export interface HouseholdAssessment {
  items: ItemAssessment[];
  /** 0-100: share of active items that are verified and issue-free. */
  completenessScore: number;
  /** 0-100: average item confidence (0 when no items). */
  confidenceScore: number;
  verifiedCount: number;
  totalCount: number;
  pendingSuspense: number;
  gate: { canEnterStrategy: boolean; blockers: string[] };
}

/** Conservative staleness thresholds by kind (days). Annual statements dominate in IL. */
export const STALENESS_DAYS: Record<string, number> = {
  ACCOUNT: 400,
  REAL_ESTATE: 800,
  MORTGAGE: 400,
  LOAN: 400,
  CASH_FLOW: 400,
  INSURANCE: 800,
  OTHER_ASSET: 800,
  OTHER_LIABILITY: 800,
};

const VALUATION_KINDS = new Set(["ACCOUNT", "REAL_ESTATE", "MORTGAGE", "LOAN", "OTHER_ASSET", "OTHER_LIABILITY"]);
const LOW_CONFIDENCE_THRESHOLD = 50;

export function assessItem(item: ItemProjection, now: Date): ItemAssessment {
  const issues: ItemIssue[] = [];
  if (item.verification === "REJECTED") issues.push({ type: "REJECTED" });
  if (VALUATION_KINDS.has(item.kind)) {
    if (item.latestValuationAsOf === null) {
      issues.push({ type: "NO_VALUATION" });
    } else {
      const ageDays = Math.floor((now.getTime() - item.latestValuationAsOf.getTime()) / 86_400_000);
      const thresholdDays = STALENESS_DAYS[item.kind] ?? 400;
      if (ageDays > thresholdDays) issues.push({ type: "STALE_VALUATION", ageDays, thresholdDays });
    }
  }
  if (item.lastConfirmedAt === null) issues.push({ type: "NEVER_CONFIRMED" });
  if (item.confidence < LOW_CONFIDENCE_THRESHOLD) issues.push({ type: "LOW_CONFIDENCE", confidence: item.confidence });

  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    verified: item.verification === "VERIFIED" && issues.length === 0,
    issues,
  };
}

export function assessHousehold(
  items: ItemProjection[],
  pendingSuspense: number,
  now: Date,
): HouseholdAssessment {
  const assessments = items.map((i) => assessItem(i, now));
  const verifiedCount = assessments.filter((a) => a.verified).length;
  const total = assessments.length;

  const blockers: string[] = [];
  if (total === 0) blockers.push("NO_ITEMS_MAPPED");
  const unverified = total - verifiedCount;
  if (unverified > 0) blockers.push(`UNVERIFIED_ITEMS:${unverified}`);
  if (pendingSuspense > 0) blockers.push(`PENDING_SUSPENSE:${pendingSuspense}`);

  return {
    items: assessments,
    completenessScore: total === 0 ? 0 : Math.round((verifiedCount / total) * 100),
    confidenceScore:
      total === 0 ? 0 : Math.round(items.reduce((s, i) => s + i.confidence, 0) / total),
    verifiedCount,
    totalCount: total,
    pendingSuspense,
    gate: { canEnterStrategy: blockers.length === 0, blockers },
  };
}
