import type { PrismaClient } from "@wealthos/db";
import { computeHealthScore, type HealthComponentKey, type HealthScore } from "@wealthos/engine-operations";
import { assumptionRegistry } from "@wealthos/registry";
import { computePeriod } from "./operations-service";

/**
 * M42 — the Household Financial Health Score service.
 *
 * Reads the CURRENT month's computation plus the operational follow-through record. It
 * deliberately does not recompute anything of its own: every component here is a number
 * some other engine already produces and already explains. A score that invented its own
 * inputs would be a second opinion nobody could reconcile with the first.
 */

const DEFAULT_WEIGHTS: Record<HealthComponentKey, number> = {
  cashflow: 30,
  liquidity: 25,
  leakage: 15,
  execution: 15,
  goals: 15,
};

export async function householdHealthScore(
  db: PrismaClient,
  householdId: string,
  asOf: Date = new Date(),
): Promise<HealthScore> {
  const rows = await assumptionRegistry(db).all(householdId);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const rawWeights = map["health_score_weights"];
  const weights =
    rawWeights && typeof rawWeights === "object"
      ? ({ ...DEFAULT_WEIGHTS, ...(rawWeights as Record<string, number>) } as Record<HealthComponentKey, number>)
      : DEFAULT_WEIGHTS;

  // Reuses the existing coverage floor rather than adding a key: a new assumption
  // version invalidates every pinned recommendation, which is a real cost to pay for a
  // threshold that means the same thing here as it does in the analyzers.
  const minCoverage = typeof map["opportunity_min_coverage_pct"] === "number"
    ? (map["opportunity_min_coverage_pct"] as number)
    : 70;

  const period = await computePeriod(
    db,
    householdId,
    asOf.getUTCFullYear(),
    asOf.getUTCMonth() + 1,
  );
  const flow = period.flow;
  const surplus = period.surplus;

  /*
   * Follow-through, counted from the decision record rather than from the inbox:
   * COMMITTED is what the owner accepted (still open) plus what he finished. Proposals
   * are excluded on purpose — including them would score the household on how much the
   * engine suggested rather than on how much of its own commitments it kept.
   */
  const [accepted, implemented] = await Promise.all([
    db.recommendation.count({ where: { householdId, status: "ACCEPTED" } }),
    db.recommendation.count({ where: { householdId, status: "IMPLEMENTED" } }),
  ]);

  return computeHealthScore({
    weights,
    minWeightCoveragePct: minCoverage,
    monthlySurplusBase: surplus.ok ? surplus.monthlyBase : null,
    monthlyIncomeBase: flow.ok ? flow.incomeBase : null,
    workingCapitalAvailableBase: period.workingCapital.availableBase,
    workingCapitalTargetBase: period.workingCapital.targetBase,
    monthlyLeakageBase: flow.ok ? flow.leakageBase : null,
    monthlyExpensesBase: flow.ok ? flow.expensesBase : null,
    actionsCommitted: accepted + implemented,
    actionsCompleted: implemented,
    /*
     * Goals are NOT wired yet, and are passed as null rather than approximated. The
     * funding figures live in engine-goals' funding-gap output, which needs a snapshot
     * this service does not build. The component refuses, is named in `unmeasured`, and
     * costs 15 points of coverage — which is the honest state of affairs rather than a
     * guess dressed as a score.
     */
    goalsRequiredBase: null,
    goalsFundedBase: null,
  });
}

