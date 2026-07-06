/**
 * Staleness sweep (pure). Identifies currently-VERIFIED ledger items whose latest
 * valuation has aged past the per-kind threshold, so monitoring can flip them to
 * STALE and route the household back to VERIFICATION. Thresholds come from the
 * AssumptionRegistry (staleness_days_by_kind) — same source the M3 assessor reads.
 *
 * Only VERIFIED items are swept: unverified/rejected items are already outside the
 * verified set, and re-flagging them would be noise.
 */

export interface StalenessInput {
  id: string;
  name: string;
  kind: string;
  verification: "UNVERIFIED" | "VERIFIED" | "REJECTED" | "STALE";
  latestValuationAsOf: Date | null;
}

export interface StaleItem {
  id: string;
  name: string;
  kind: string;
  ageDays: number;
  thresholdDays: number;
}

export interface StalenessResult {
  /** Items that should be flagged STALE. */
  stale: StaleItem[];
  /** How many items were eligible for evaluation (VERIFIED with a valuation). */
  evaluated: number;
  thresholdsByKind: Record<string, number>;
}

const DEFAULT_THRESHOLD_DAYS = 400;

export function sweepStaleness(
  items: StalenessInput[],
  now: Date,
  thresholdsByKind: Record<string, number>,
): StalenessResult {
  const stale: StaleItem[] = [];
  let evaluated = 0;
  for (const item of items) {
    if (item.verification !== "VERIFIED") continue;
    if (item.latestValuationAsOf === null) continue;
    evaluated += 1;
    const ageDays = Math.floor((now.getTime() - item.latestValuationAsOf.getTime()) / 86_400_000);
    const thresholdDays = thresholdsByKind[item.kind] ?? DEFAULT_THRESHOLD_DAYS;
    if (ageDays > thresholdDays) {
      stale.push({ id: item.id, name: item.name, kind: item.kind, ageDays, thresholdDays });
    }
  }
  return { stale, evaluated, thresholdsByKind };
}
