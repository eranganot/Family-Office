import type { PrismaClient } from "@wealthos/db";
import { computeDeploymentPlans, ENGINE_VERSION, type AnalyzerContext, type DeploymentPlans } from "@wealthos/engine-strategy";
import { assumptionRegistry, taxRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";
import { latestBoiRate } from "./boi-rate-service";

/**
 * M26 — ALLOCATION service v2: builds a fresh snapshot, computes THREE deployment
 * variants, persists as the current PROPOSED plan (older proposed superseded).
 * A plan with nothing decidable (no steps in any variant) auto-approves.
 * Approval now happens step-by-step via the router; the plan flips to APPROVED
 * when every step of the CHOSEN variant is decided.
 */
export interface AllocationRunResult {
  planId: string;
  snapshotId: string;
  plan: DeploymentPlans;
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

  const plan = computeDeploymentPlans(payload, ctx);
  const nothingToDecide = plan.variants.every((v) => v.steps.length === 0);
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
