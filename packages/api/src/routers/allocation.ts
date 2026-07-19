import { TRPCError } from "@trpc/server";
import type { DeploymentPlans } from "@wealthos/engine-strategy";
import { z } from "zod";
import { runAllocation } from "../services/allocation-service";
import { protectedProcedure, router, workflowGuard } from "../trpc";
import { requireHouseholdId } from "./ledger";

/**
 * M26 — ALLOCATION phase router v2: three variants per plan; the household picks
 * one, then decides EVERY step individually (owner decision: full audit trail).
 * The plan flips to APPROVED automatically when the chosen variant's last step
 * is decided — that approval is the state-machine gate into STRATEGY.
 */
export const allocationRouter = router({
  latest: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return ctx.db.allocationPlan.findFirst({
      where: { householdId },
      orderBy: { createdAt: "desc" },
    });
  }),

  generate: workflowGuard("ALLOCATION").mutation(async ({ ctx }) => {
    return runAllocation(ctx.db, ctx.householdId);
  }),

  chooseVariant: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), variant: z.enum(["GROWTH", "DEBT_FREE", "BALANCED"]) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      const plan = row.plan as unknown as DeploymentPlans;
      if (!plan.variants?.some((v) => v.key === input.variant)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "VARIANT_NOT_IN_PLAN" });
      }
      // Switching variants resets prior step decisions — decisions belong to a path.
      return ctx.db.allocationPlan.update({
        where: { id: input.id },
        data: { chosenVariant: input.variant, stepDecisions: {} },
      });
    }),

  decideStep: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), stepId: z.string().min(1), decision: z.enum(["APPROVED", "DECLINED"]) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!row || row.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      if (!row.chosenVariant) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "CHOOSE_VARIANT_FIRST" });

      const plan = row.plan as unknown as DeploymentPlans;
      const variant = plan.variants.find((v) => v.key === row.chosenVariant);
      if (!variant || !variant.steps.some((s) => s.id === input.stepId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "STEP_NOT_IN_CHOSEN_VARIANT" });
      }

      const decisions = { ...(row.stepDecisions as Record<string, string>), [input.stepId]: input.decision };
      const allDecided = variant.steps.every((s) => decisions[s.id] === "APPROVED" || decisions[s.id] === "DECLINED");

      return ctx.db.allocationPlan.update({
        where: { id: input.id },
        data: {
          stepDecisions: decisions,
          ...(allDecided ? { status: "APPROVED", approvedAt: new Date() } : {}),
        },
      });
    }),
});
