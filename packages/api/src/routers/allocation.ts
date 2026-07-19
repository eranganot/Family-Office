import { TRPCError } from "@trpc/server";
import { computePlanImpact, deriveTargetGrowthPct, type DeploymentPlans, type PlanSelection } from "@wealthos/engine-strategy";
import { SnapshotPayloadSchema, evaluateTransition } from "@wealthos/domain";
import { assumptionRegistry } from "@wealthos/registry";
import { z } from "zod";
import { runAllocation } from "../services/allocation-service";
import { runStrategy } from "../services/strategy-service";
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

  /** M30 — base numbers for the client cart to recompute impact locally as amounts change. */
  impactBase: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const row = await ctx.db.allocationPlan.findFirst({ where: { householdId }, orderBy: { createdAt: "desc" } });
    if (!row) return null;
    const plan = planOf(row);
    if (!Array.isArray(plan.candidates)) return null;
    const snap = await ctx.db.householdSnapshot.findUnique({ where: { id: row.snapshotId } });
    if (!snap) return null;
    const payload = SnapshotPayloadSchema.parse(snap.payload);
    const assumptions = Object.fromEntries((await assumptionRegistry(ctx.db).all(householdId)).map((a) => [a.key, a.value]));
    const num = (k: string, d: number) => Number(assumptions[k] ?? d);
    const CASH = new Set(["BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "CASH_OTHER"]);
    const isCash = (i: { kind: string; accountType: string | null }) => i.kind === "ACCOUNT" && CASH.has(i.accountType ?? "");
    let cashBase = 0, totalDebt = 0, annualInterest = 0, growth = 0, knownMix = 0, unknown = 0;
    for (const i of payload.items) {
      const v = i.valueBase ?? 0;
      if (isCash(i) && i.valueBase !== null) cashBase += v;
      if (i.kind === "MORTGAGE" && i.mortgageTracks) for (const tk of i.mortgageTracks) { totalDebt += tk.principalRemaining; annualInterest += (tk.principalRemaining * tk.annualRatePct) / 100; }
      if (i.kind === "ACCOUNT" && i.valueBase !== null) {
        if (i.growthSharePct !== null && i.growthSharePct !== undefined) { growth += (v * i.growthSharePct) / 100; knownMix += v; }
        else if (isCash(i)) knownMix += v; else unknown += v;
      }
    }
    const mixKnown = knownMix + unknown === 0 || unknown / (knownMix + unknown) <= 0.5;
    const requiredTotal = payload.goals.filter((g) => g.requiredFundingBase !== null).reduce((t, g) => t + (g.requiredFundingBase ?? 0), 0);
    const assetsTotal = payload.items.filter((i) => ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"].includes(i.kind) && i.valueBase !== null).reduce((t, i) => t + (i.valueBase ?? 0), 0);
    return {
      horizonYears: Math.max(1, num("risk_horizon_years", 20)),
      expectedReturnPct: num("expected_real_return_equity_pct", 4.5),
      inflationPct: num("inflation_il_pct", 2.5),
      targetGrowthPct: deriveTargetGrowthPct(assumptions),
      cashBase: Math.round(cashBase),
      totalDebt: Math.round(totalDebt),
      annualInterest: Math.round(annualInterest),
      currentGrowth: Math.round(growth),
      currentKnownMix: Math.round(knownMix),
      mixKnown,
      goalGapBase: requiredTotal > 0 ? Math.round(Math.max(0, requiredTotal - assetsTotal)) : null,
    };
  }),

  /** M30 — commit the chosen selections, approve, and advance to STRATEGY in one deliberate step. */
  commitAndApprove: workflowGuard("ALLOCATION")
    .input(z.object({
      id: z.uuid(),
      selections: z.array(z.object({ candidateId: z.string().min(1), amount: z.number().min(0) })),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      const plan = planOf(row);
      const byId = new Map(plan.candidates.map((c) => [c.id, c]));
      const wp: WorkingPlan = {};
      for (const c of plan.candidates) wp[c.id] = { enabled: c.kind === "TAX_VERIFY_PAYROLL", amount: c.suggestedAmount };
      let total = 0;
      for (const sel of input.selections) {
        const c = byId.get(sel.candidateId);
        if (!c) throw new TRPCError({ code: "BAD_REQUEST", message: "CANDIDATE_NOT_IN_PLAN" });
        const amount = c.editable ? Math.min(Math.max(sel.amount, c.minAmount), c.maxAmount) : c.suggestedAmount;
        wp[sel.candidateId] = { enabled: true, amount };
        if (c.kind !== "TAX_VERIFY_PAYROLL") total += amount;
      }
      if (total > plan.freeCashBase + 1) throw new TRPCError({ code: "BAD_REQUEST", message: "OVER_ALLOCATED" });

      const result = await ctx.db.$transaction(async (tx) => {
        await tx.allocationPlan.update({ where: { id: input.id }, data: { workingPlan: wp, status: "APPROVED", approvedAt: new Date(), note: input.note ?? null } });
        const household = await tx.household.findFirstOrThrow();
        const t = evaluateTransition(household.workflowState, "STRATEGY", { verificationComplete: true, suspenseEmpty: true, allocationPlanApproved: true });
        if (t.allowed && household.workflowState === "ALLOCATION") {
          await tx.workflowTransition.create({ data: { householdId: household.id, fromState: "ALLOCATION", toState: "STRATEGY", reason: "Allocation plan approved" } });
          await tx.household.update({ where: { id: household.id }, data: { workflowState: "STRATEGY" } });
        }
        return { approved: true, advancedTo: (t.allowed ? "STRATEGY" : household.workflowState) as string };
      });
      // M33 — auto-rerun strategy so recommendations realign with the just-approved plan (non-fatal).
      if (result.advancedTo === "STRATEGY") {
        try { await runStrategy(ctx.db, ctx.householdId); } catch { /* data gate / refusal is non-fatal here */ }
      }
      return result;
    }),

  /** M33 — reopen the approved plan for editing: step back to ALLOCATION and mark it PROPOSED. */
  reopenForEdit: protectedProcedure.mutation(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return ctx.db.$transaction(async (tx) => {
      const household = await tx.household.findFirstOrThrow();
      if (household.workflowState !== "ALLOCATION") {
        const t = evaluateTransition(household.workflowState, "ALLOCATION", { verificationComplete: true, suspenseEmpty: true, allocationPlanApproved: true });
        if (!t.allowed) throw new TRPCError({ code: "FORBIDDEN", message: t.reason });
        await tx.workflowTransition.create({ data: { householdId, fromState: household.workflowState, toState: "ALLOCATION", reason: "Reopen allocation plan for editing" } });
        await tx.household.update({ where: { id: householdId }, data: { workflowState: "ALLOCATION" } });
      }
      const latest = await tx.allocationPlan.findFirst({ where: { householdId }, orderBy: { createdAt: "desc" } });
      if (latest && latest.status === "APPROVED") {
        await tx.allocationPlan.update({ where: { id: latest.id }, data: { status: "PROPOSED", approvedAt: null } });
      }
      return { reopened: true };
    });
  }),

  /** M33 — read-only review of the current plan's chosen actions + impact (any phase). */
  approvedReview: protectedProcedure.query(async ({ ctx }) => {
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
    const byId = new Map(plan.candidates.map((c) => [c.id, c]));
    const chosen: Array<{ title: string; titleHe: string; kind: string; amountBase: number; projectedExtra: number; interestSaved: number }> = [];
    let projectedExtra = 0, allocated = 0;
    for (const [id, sel] of Object.entries(wp)) {
      if (!sel.enabled) continue;
      const c = byId.get(id);
      if (!c) continue;
      if (c.kind === "TAX_VERIFY_PAYROLL") { chosen.push({ title: c.title ?? c.kind, titleHe: c.titleHe ?? c.kind, kind: c.kind, amountBase: 0, projectedExtra: 0, interestSaved: 0 }); continue; }
      const im = computePlanImpact(payload, impactCtx, [{ kind: c.kind, amount: sel.amount, ratePct: c.ratePct }], buffer, targetGrowthPct);
      chosen.push({ title: c.title ?? c.kind, titleHe: c.titleHe ?? c.kind, kind: c.kind, amountBase: sel.amount, projectedExtra: im.projectedExtraNetWorth, interestSaved: im.annualInterestBefore - im.annualInterestAfter });
      projectedExtra += im.projectedExtraNetWorth;
      allocated += sel.amount;
    }
    return { status: row.status, createdAt: row.createdAt, approvedAt: row.approvedAt, freeCashBase: plan.freeCashBase, allocated, projectedExtra, chosen };
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
