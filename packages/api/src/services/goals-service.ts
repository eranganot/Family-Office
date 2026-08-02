import type { PrismaClient } from "@wealthos/db";
import { ledgerRepo } from "@wealthos/db";
import { computeFundingGaps, type AssetInput, type FundingGapReport, type GoalInput } from "@wealthos/engine-goals";
import { assumptionRegistry } from "@wealthos/registry";

/**
 * M43 — the funding-gap computation, extracted from `goals.fundingGap` so more than one
 * caller can have it.
 *
 * ⚠️ IT NEEDS NO SNAPSHOT. That matters, because the health score's `goals` component was
 * left unwired since M42 on the recorded grounds that its figures "live in engine-goals
 * and need a snapshot this service does not build". They do not: this path reads the
 * LIVE ledger, converts to ILS with the same no-rate-means-excluded policy net worth
 * uses, and pulls the real return from the AssumptionRegistry. The blocker was a belief,
 * not a constraint, and it cost 15 points of health-score coverage for a milestone.
 *
 * `strategy-service.buildFundingSummary` deliberately does NOT use this. It runs the same
 * engine against the PINNED SNAPSHOT, because a recommendation must be reproducible from
 * the snapshot it cites — reading live values there would make a pinned recommendation
 * silently change meaning. Live for a dashboard reading, pinned for a recommendation:
 * the difference is the point, not duplication to be tidied away.
 */

/** requiredFunding derived from monthly income at the CURRENT real-return assumption (perpetuity). */
export function derivedRequiredFundingILS(targetMonthlyIncome: string, realReturnPct: number): string | null {
  const rate = realReturnPct / 100;
  // A non-positive real return makes a perpetuity meaningless (division by zero, or a
  // negative capital target). The goals ROUTER throws here, which is right for an
  // interactive edit; a background reading must degrade to "not computable" instead of
  // failing the whole health score over one goal's assumption.
  if (rate <= 0) return null;
  return String((Number(targetMonthlyIncome) * 12) / rate);
}

export async function householdFundingGaps(
  db: PrismaClient,
  householdId: string,
  now: Date = new Date(),
): Promise<FundingGapReport> {
  const goals = await db.goal.findMany({ where: { householdId, status: "ACTIVE" } });
  const items = await ledgerRepo.list(db, householdId);

  // Latest manual FX per pair for ILS conversion (same policy as net worth: no rate → excluded).
  const allRates = await db.fxRate.findMany({ orderBy: { asOf: "desc" } });
  const seen = new Set<string>();
  const rate = new Map<string, number>();
  for (const r of allRates) {
    const key = `${r.from}->${r.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rate.set(key, Number(r.rate));
  }
  const toILS = (value: string, currency: string): string | null => {
    if (currency === "ILS") return value;
    const direct = rate.get(`${currency}->ILS`);
    if (direct) return String(Number(value) * direct);
    const inverse = rate.get(`ILS->${currency}`);
    if (inverse) return String(Number(value) / inverse);
    return null;
  };

  const assets: AssetInput[] = items.map((i) => ({
    id: i.id,
    kind: i.kind,
    accountType: i.accountDetail?.accountType,
    valueILS: i.latestValuation ? toILS(i.latestValuation.value.toString(), i.latestValuation.currency) : null,
    verified: i.verification === "VERIFIED",
    earmarkedGoalId: i.earmarkedGoalId ?? null,
  }));

  const realReturn = await assumptionRegistry(db).current("goal_projection_real_return_pct", householdId);
  const realReturnPct = realReturn.value as number;

  // Income-mode goals derive their capital target from the CURRENT assumption (perpetuity).
  const goalInputs: GoalInput[] = goals.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    priority: g.priority,
    targetDate: g.targetDate,
    requiredFundingILS: g.targetMonthlyIncome
      ? derivedRequiredFundingILS(g.targetMonthlyIncome.toString(), realReturnPct)
      : g.requiredFunding
        ? g.requiredFunding.toString()
        : null,
  }));

  return computeFundingGaps(goalInputs, assets, realReturnPct, now);
}

export interface GoalFundingTotals {
  /** Total required across COMPUTABLE goals only. Null when none are computable. */
  requiredBase: number | null;
  /** Total funded, CAPPED PER GOAL. Null when nothing is computable. */
  fundedBase: number | null;
  computableGoals: number;
  totalGoals: number;
}

/**
 * Collapse the per-goal report into the two totals the health score consumes.
 *
 * ⚠️ FUNDING IS CAPPED PER GOAL — `min(projected, required)`, never raw `projected`.
 *
 * Summing projections unchecked lets a heavily over-funded retirement lend its excess to
 * an unfunded education goal, and the household reads 100% while a goal has nothing
 * behind it. That is the aggregation equivalent of every silent-exclusion bug in this
 * codebase: a defensible-looking sum that hides the finding it was meant to surface. The
 * cap makes the ratio mean "how much of what each goal needs does that goal have".
 *
 * NOT_COMPUTABLE goals (no target date, no required funding, target in the past) are
 * excluded from BOTH sums rather than counted as unfunded. A goal missing a target date
 * is a DATA gap, and scoring it as a financial failure would report a household as
 * reckless for an empty form field. They are counted in `totalGoals` so the shortfall is
 * visible — the same reason the composite carries its own weight-coverage figure.
 */
export function goalFundingTotals(report: FundingGapReport): GoalFundingTotals {
  const computable = report.results.filter((r) => r.computable);
  if (computable.length === 0) {
    return { requiredBase: null, fundedBase: null, computableGoals: 0, totalGoals: report.results.length };
  }
  let required = 0;
  let funded = 0;
  for (const r of computable) {
    const req = Number(r.requiredILS ?? "0");
    const projected = Number(r.projectedValueILS ?? "0");
    if (!Number.isFinite(req) || req <= 0) continue;
    required += req;
    funded += Math.min(projected, req);
  }
  if (required <= 0) {
    return { requiredBase: null, fundedBase: null, computableGoals: computable.length, totalGoals: report.results.length };
  }
  return {
    requiredBase: Math.round(required * 100) / 100,
    fundedBase: Math.round(funded * 100) / 100,
    computableGoals: computable.length,
    totalGoals: report.results.length,
  };
}
