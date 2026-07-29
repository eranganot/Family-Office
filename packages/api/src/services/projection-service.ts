import type { PrismaClient } from "@wealthos/db";
import { projectEndOfYear, type EoyProjection, type PendingImpact } from "@wealthos/engine-operations";
import { assumptionRegistry } from "@wealthos/registry";

/**
 * M41 — end-of-year projection service.
 *
 * Reads only FACTS: closed operating periods for the observed run-rate, and
 * recommendations the owner has ACCEPTED for the optimised line. It deliberately does
 * not recompute months on the fly — a projection built from a live recomputation would
 * change every time a transaction was reclassified, and the two lines would move for
 * reasons that have nothing to do with the household's decisions.
 */

const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** Minimum verified closed months before a trajectory may be drawn. Registry only. */
async function projectionMinMonths(db: PrismaClient, householdId: string): Promise<number> {
  const rows = await assumptionRegistry(db).all(householdId);
  const v = rows.find((r) => r.key === "projection_min_closed_months")?.value;
  return typeof v === "number" ? v : 3;
}

export async function eoyProjection(
  db: PrismaClient,
  householdId: string,
  asOf: Date = new Date(),
): Promise<EoyProjection> {
  const year = asOf.getUTCFullYear();
  const minMonths = await projectionMinMonths(db, householdId);

  const periods = await db.operatingPeriod.findMany({
    where: { householdId, year, status: "CLOSED" },
    select: { year: true, month: true, surplusBase: true, surplusIsProvisional: true },
    orderBy: { month: "asc" },
  });

  /*
   * The optimised line counts ACCEPTED work only — not PROPOSED, and not IMPLEMENTED.
   *
   * PROPOSED would promise money from decisions never made, so the gap between the
   * lines would measure the engine's optimism rather than the household's
   * follow-through. IMPLEMENTED is excluded because its effect is already landing in
   * the observed surplus that produced the run-rate; counting it again is the
   * double-count this codebase has now hit in three separate costumes.
   */
  const accepted = await db.recommendation.findMany({
    where: { householdId, status: "ACCEPTED" },
    select: { id: true, impactMonthlyBase: true, journal: { select: { decidedAt: true, decision: true } } },
  });

  const pendingImpacts: PendingImpact[] = accepted.map((r) => {
    // Accepted-from date comes from the journal, not from generatedAt: a card proposed
    // in January and accepted in September did not start saving money in January.
    const acceptedAt = r.journal
      .filter((j) => j.decision === "ACCEPTED")
      .map((j) => j.decidedAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const when = acceptedAt ?? asOf;
    return {
      recommendationId: r.id,
      impactMonthlyBase: r.impactMonthlyBase === null ? null : num(r.impactMonthlyBase),
      acceptedYear: when.getUTCFullYear(),
      acceptedMonth: when.getUTCMonth() + 1,
    };
  });

  return projectEndOfYear({
    asOf,
    minMonths,
    closedMonths: periods.map((p) => ({
      year: p.year,
      month: p.month,
      surplusBase: num(p.surplusBase),
      isProvisional: p.surplusIsProvisional,
    })),
    pendingImpacts,
  });
}
