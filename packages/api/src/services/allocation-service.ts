import type { PrismaClient } from "@wealthos/db";
import { computeDeploymentPlan, ENGINE_VERSION, type AnalyzerContext, type DeploymentPlan } from "@wealthos/engine-strategy";
import { assumptionRegistry, taxRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";
import { latestBoiRate } from "./boi-rate-service";

/**
 * M25 — ALLOCATION phase service: builds a fresh snapshot, computes the free-cash
 * deployment waterfall, and persists it as the household's current PROPOSED plan
 * (previous proposed plans are superseded; approved history is kept).
 * A plan with nothing to deploy is auto-approved — there is nothing to decide.
 */
export interface AllocationRunResult {
  planId: string;
  snapshotId: string;
  plan: DeploymentPlan;
  status: "PROPOSED" | "APPROVED";
}

export async function runAllocation(db: PrismaClient, householdId: string): Promise<AllocationRunResult> {
  const { snapshotId, payload } = await buildSnapshot(db, householdId, "MANUAL");

  const reg = assumptionRegistry(db);
  const allAssumptions = await reg.all(householdId);
  const assumptions = Object.fromEntries(allAssumptions.map((row) => [row.key, row.value]));

  const taxReg = taxRegistry(db).forYear(new Date().getFullYear());
  const hishtalmut = await taxReg.get("HISHTALMUT_CEILINGS");
  const pension = await taxReg.get("PENSION_CEILINGS");
  const boi = await latestBoiRate(db);
  const ctx: AnalyzerContext = {
    assumptions,
    taxRules: { HISHTALMUT_CEILINGS: hishtalmut.payload, PENSION_CEILINGS: pension.payload },
    marketRates: { boiRatePct: boi?.value ?? null },
  };

  const plan = computeDeploymentPlan(payload, ctx);
  const nothingToDecide = plan.steps.length === 0 || plan.notes.includes("NO_FREE_CASH");
  const status = nothingToDecide ? "APPROVED" : "PROPOSED";

  const row = await db.$transaction(async (tx) => {
    await tx.allocationPlan.updateMany({
      where: { householdId, status: "PROPOSED" },
      data: { status: "SUPERSEDED" },
    });
    return tx.allocationPlan.create({
      data: {
        householdId,
        snapshotId,
        engineVersion: ENGINE_VERSION,
        plan: plan as never,
        status,
        approvedAt: status === "APPROVED" ? new Date() : null,
        note: status === "APPROVED" ? "AUTO_APPROVED_NOTHING_TO_DEPLOY" : null,
      },
    });
  });

  return { planId: row.id, snapshotId, plan, status };
}
