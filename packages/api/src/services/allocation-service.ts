import type { PrismaClient } from "@wealthos/db";
import {
  computeDeploymentPlans,
  ENGINE_VERSION,
  type AnalyzerContext,
  type DeploymentPlans,
  type DeploymentSurplusHandoff,
} from "@wealthos/engine-strategy";
import { assumptionRegistry, taxRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";
import { latestBoiRate } from "./boi-rate-service";
import { allocationHandoffReadiness } from "./review-service";

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

/**
 * M41 #6 — which month's surplus, and may it be deployed?
 *
 * The LATEST CLOSED month, and only if `allocationHandoffReadiness` says so. That query
 * is the seam M41b built precisely so this wiring would not have to re-derive the rule:
 * it refuses a PROVISIONAL surplus outright, because committing money against a figure
 * that still contains unverified transactions is the one place in this module where
 * being wrong moves real cash.
 *
 * ⚠️ `verifiedSurplusBase` is POPULATED on several refusals (a provisional surplus still
 * has a number). `ready` is therefore the gate — never the presence of the figure.
 *
 * ONE month, never annualised: twelve times a forecast is not cash.
 *
 * On this household TODAY the expected answer is `SURPLUS_PROVISIONAL` — every closed
 * month is provisional, by deliberate design of the close rule. That is a correct
 * refusal and it must READ as one, which is why the reason travels onto the plan instead
 * of the surplus quietly being zero.
 */
async function surplusHandoff(db: PrismaClient, householdId: string): Promise<DeploymentSurplusHandoff> {
  const latestClosed = await db.operatingPeriod.findFirst({
    where: { householdId, status: "CLOSED" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { year: true, month: true },
  });

  if (!latestClosed) {
    return { ready: false, reason: "NO_CLOSED_PERIOD", verifiedSurplusBase: null, year: null, month: null };
  }

  const readiness = await allocationHandoffReadiness(db, householdId, latestClosed.year, latestClosed.month);
  return {
    ready: readiness.ready,
    reason: readiness.reason,
    verifiedSurplusBase: readiness.verifiedSurplusBase,
    year: readiness.year,
    month: readiness.month,
  };
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
  const handoff = await surplusHandoff(db, householdId);

  const ctx: AnalyzerContext = {
    assumptions,
    taxRules: { HISHTALMUT_CEILINGS: hishtalmut.payload, PENSION_CEILINGS: pension.payload },
    marketRates: { boiRatePct: boi?.value ?? null },
    // Only a READY surplus is handed to the engine. `exactOptionalPropertyTypes` is on,
    // so the key is omitted entirely rather than set to undefined.
    ...(handoff.ready && handoff.verifiedSurplusBase !== null
      ? { deployableSurplusBase: handoff.verifiedSurplusBase }
      : {}),
  };

  const enginePlan = computeDeploymentPlans(payload, ctx);
  // The reason travels ON the plan — see DeploymentSurplusHandoff. A refusal recorded
  // anywhere other than the artifact showing the number is a refusal nobody sees.
  const plan: DeploymentPlans = { ...enginePlan, surplusHandoff: handoff };
  const actionable = plan.candidates.some((c) => c.kind !== "TAX_VERIFY_PAYROLL");
  const nothingToDecide = !actionable;
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
