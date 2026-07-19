import { TRPCError } from "@trpc/server";
import { computePlanImpact, deriveTargetGrowthPct, type DeploymentPlans, type PlanSelection } from "@wealthos/engine-strategy";
import { SnapshotPayloadSchema } from "@wealthos/domain";
import { assumptionRegistry } from "@wealthos/registry";
import { z } from "zod";
import { runAllocation } from "../services/allocation-service";
import { protectedProcedure, router, workflowGuard } from "../trpc";
import { requireHouseholdId } from "./ledger";

/**
 * M27 — ALLOCATION router v3: an editable working plan over the engine's candidate
 * menu. Presets seed it; the household then toggles candidates and edits amounts
 * (partial mortgage repayment, cross-path mixing); approving it (sum within free
 * cash) opens the state-machine gate into STRATEGY.
 */
type WorkingPlan = Record<string, { enabled: boolean; amount: number }>;

function planOf(row: { plan: unknown }): DeploymentPlans {
  return row.plan as unknown as DeploymentPlans;
}
function allocated(wp: WorkingPlan): number {
  return Object.values(wp).reduce((t, e) => t + (e.enabled ? e.amount : 0), 0);
}

export const allocationRouter = router({
  latest: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return ctx.db.allocationPlan.findFirst({ where: { householdId }, orderBy: { createdAt: "desc" } });
  }),

  /** M29 — simulation: aggregate impact of the enabled plan PLUS a per-action contribution
   *  (each computed at that candidate's working-or-suggested amount) over the pinned snapshot.
   *  Re-running is just re-reading the working plan, so editing an amount + submitting recomputes. */
  simulate: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const row = await ctx.db.allocationPlan.findFirst({ where: { householdId }, orderBy: { createdAt: "desc" } });
    if (!row) return null;
    const plan = planOf(row);
    if (!Array.isArray(plan.candidates)) return null;
    const wp = (row.workingPlan ?? {}) as WorkingPlan;
    const snap = await ctx.db.householdSnapshot.findUnique({ where: { id: row.snapshotId } });
    if (!snap) return null;
    const payload = SnapshotPayloadSchema.parse(snap.payload);
    const assumptions = Object.fromEntries((await assumptionRegistry(ctx.db).all(householdId)).map((a) => [a.key, a.value]));
    const impactCtx = { assumptions, taxRules: {}, marketRates: { boiRatePct: null } };
    const targetGrowthPct = deriveTargetGrowthPct(assumptions);
    const buffer = plan.bufferTargetBase ?? 0;

    const enabled: PlanSelection[] = plan.candidates
      .filter((c) => wp[c.id]?.enabled && c.kind !== "TAX_VERIFY_PAYROLL")
      .map((c) => ({ kind: c.kind, amount: wp[c.id]!.amount, ratePct: c.ratePct }));
    const aggregate = enabled.length > 0 ? computePlanImpact(payload, impactCtx, enabled, buffer, targetGrowthPct) : null;

    const perCandidate: Record<string, { amount: number; projectedExtraNetWorth: number; interestSavedYearBase: number; growthPctAfter: number | null; horizonYears: number }> = {};
    for (const c of plan.candidates) {
      if (c.kind === "TAX_VERIFY_PAYROLL") continue;
      const amount = wp[c.id]?.amount ?? c.suggestedAmount;
      if (!(amount > 0)) continue;
      const im = computePlanImpact(payload, impactCtx, [{ kind: c.kind, amount, ratePct: c.ratePct }], buffer, targetGrowthPct);
      perCandidate[c.id] = {
        amount,
        projectedExtraNetWorth: im.projectedExtraNetWorth,
        interestSavedYearBase: im.annualInterestBefore - im.annualInterestAfter,
        growthPctAfter: c.kind === "INVEST_GROWTH" || c.kind === "INVEST_DEFENSIVE" ? im.growthPctAfter : null,
        horizonYears: im.horizonYears,
      };
    }
    return { aggregate, perCandidate };
  }),

  generate: workflowGuard("ALLOCATION").mutation(async ({ ctx }) => runAllocation(ctx.db, ctx.householdId)),

  /** Seed the working plan from a named preset (does not approve). */
  applyPreset: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), variant: z.enum(["GROWTH", "DEBT_FREE", "BALANCED"]) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      const plan = planOf(row);
      const preset = plan.presets?.[input.variant];
      if (!preset) throw new TRPCError({ code: "BAD_REQUEST", message: "VARIANT_NOT_IN_PLAN" });
      const wp: WorkingPlan = {};
      // start disabled; verify candidates default enabled (0-amount reminders)
      for (const c of plan.candidates) wp[c.id] = { enabled: c.kind === "TAX_VERIFY_PAYROLL", amount: c.suggestedAmount };
      for (const e of preset) wp[e.candidateId] = { enabled: true, amount: e.amount };
      return ctx.db.allocationPlan.update({ where: { id: input.id }, data: { chosenVariant: input.variant, workingPlan: wp } });
    }),

  /** Toggle/edit a single candidate in the working plan. */
  setCandidate: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), candidateId: z.string().min(1), enabled: z.boolean(), amount: z.number().min(0).optional() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      const plan = planOf(row);
      const cand = plan.candidates.find((c) => c.id === input.candidateId);
      if (!cand) throw new TRPCError({ code: "BAD_REQUEST", message: "CANDIDATE_NOT_IN_PLAN" });
      const amount = cand.editable ? Math.min(Math.max(input.amount ?? cand.suggestedAmount, cand.minAmount), cand.maxAmount) : cand.suggestedAmount;
      const wp: WorkingPlan = { ...(row.workingPlan as WorkingPlan) };
      wp[input.candidateId] = { enabled: input.enabled, amount };
      if (allocated(wp) > plan.freeCashBase + 1) throw new TRPCError({ code: "BAD_REQUEST", message: "OVER_ALLOCATED" });
      return ctx.db.allocationPlan.update({ where: { id: input.id }, data: { workingPlan: wp } });
    }),

  /** Approve the current working plan → opens the gate into STRATEGY. */
  approve: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      const plan = planOf(row);
      const wp = row.workingPlan as WorkingPlan;
      if (allocated(wp) > plan.freeCashBase + 1) throw new TRPCError({ code: "BAD_REQUEST", message: "OVER_ALLOCATED" });
      return ctx.db.allocationPlan.update({ where: { id: input.id }, data: { status: "APPROVED", approvedAt: new Date(), note: input.note ?? null } });
    }),
});
