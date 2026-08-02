import type { PrismaClient } from "@wealthos/db";
import { computeHealthScore, type HealthComponentKey, type HealthScore } from "@wealthos/engine-operations";
import { assumptionRegistry } from "@wealthos/registry";
import { computePeriod } from "./operations-service";
import { goalFundingTotals, householdFundingGaps } from "./goals-service";

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

  /*
   * Score the most recent CLOSED month, not the one in progress.
   *
   * QA: the score reported "not enough measured" on a household with five closed months
   * and a fully mapped ledger. Cause: it measured the CURRENT month, which in early
   * August has almost no transactions — so cashflow (30) and leakage (15) both refused
   * for want of income and expenses, goals (15) is unwired, and 60 of 100 weight
   * vanished. The engine was right to refuse; it was pointed at the wrong month.
   *
   * A closed month is also the only honest thing to score: a month in progress is
   * half-observed by construction, so its surplus would read as a collapse for the first
   * three weeks of every month and recover on the last day. Falling back to the current
   * month when nothing is closed keeps a brand-new household from seeing nothing at all.
   */
  const latestClosed = await db.operatingPeriod.findFirst({
    where: { householdId, status: "CLOSED" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });
  const period = await computePeriod(
    db,
    householdId,
    latestClosed?.year ?? asOf.getUTCFullYear(),
    latestClosed?.month ?? asOf.getUTCMonth() + 1,
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

  /*
   * M43 — goals, finally measured.
   *
   * M42 left this null and recorded the reason as "the funding figures live in
   * engine-goals and need a snapshot this service does not build". That was WRONG, and
   * checking it cost less than the note did: `goals.fundingGap` has always computed the
   * report from the LIVE ledger with no snapshot at all. The 15 points of coverage were
   * lost to a belief, not a constraint.
   *
   * ⚠️ A FAILURE HERE MUST NOT TAKE THE WHOLE SCORE DOWN. Goals is one component of
   * five; if this query throws, the correct outcome is a score that refuses the goals
   * component and says so — exactly what passing null does — not an error page where a
   * health score used to be. Every other input on this call is already resilient in the
   * same way (`flow.ok`, `surplus.ok`).
   *
   * The catch is narrow on purpose: it converts a failure into the module's existing
   * REFUSAL vocabulary rather than into a zero. This module has shipped a
   * defensible-looking silence six times, and the difference between the two is the
   * whole lesson: 0/100 funded reads as a household in trouble, GOALS_NOT_MEASURED reads
   * as a household not yet measured.
   */
  const goalTotals = await householdFundingGaps(db, householdId, asOf)
    .then(goalFundingTotals)
    .catch(() => ({ requiredBase: null, fundedBase: null, computableGoals: 0, totalGoals: 0 }));

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
    goalsRequiredBase: goalTotals.requiredBase,
    goalsFundedBase: goalTotals.fundedBase,
    goalsComputable: goalTotals.computableGoals,
    goalsTotal: goalTotals.totalGoals,
  });
}

