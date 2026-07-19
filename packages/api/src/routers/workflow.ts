import { TRPCError } from "@trpc/server";
import { evaluateTransition, legalTargets, WorkflowStates } from "@wealthos/domain";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

const WorkflowStateSchema = z.enum(WorkflowStates);

export const workflowRouter = router({
  /** M33 — current phase + gate facts, for the shared phase-gate footer on every page. */
  gate: protectedProcedure.query(async ({ ctx }) => {
    const household = await ctx.db.household.findFirst({ select: { id: true, workflowState: true } });
    if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household" });
    const [unverified, pendingSuspense, approvedPlan] = await Promise.all([
      ctx.db.ledgerItem.count({ where: { householdId: household.id, status: "ACTIVE", verification: { not: "VERIFIED" } } }),
      ctx.db.suspenseItem.count({ where: { status: "PENDING" } }),
      ctx.db.allocationPlan.findFirst({ where: { householdId: household.id }, orderBy: { createdAt: "desc" }, select: { status: true } }),
    ]);
    return {
      state: household.workflowState,
      legalTargets: legalTargets(household.workflowState),
      verificationComplete: unverified === 0,
      suspenseEmpty: pendingSuspense === 0,
      unverifiedCount: unverified,
      pendingSuspense,
      allocationPlanApproved: approvedPlan?.status === "APPROVED",
    };
  }),

  current: protectedProcedure.query(async ({ ctx }) => {
    const household = await ctx.db.household.findFirst({
      select: { workflowState: true },
    });
    if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household" });
    return {
      state: household.workflowState,
      legalTargets: legalTargets(household.workflowState),
    };
  }),

  /**
   * The only way workflow state changes. Facts are computed from the ledger inside the
   * transaction — the client cannot assert them.
   */
  transition: protectedProcedure
    .input(z.object({ to: WorkflowStateSchema, reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const household = await tx.household.findFirst();
        if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household" });

        const [unverifiedCount, pendingSuspense, latestPlan] = await Promise.all([
          tx.ledgerItem.count({
            where: { householdId: household.id, status: "ACTIVE", verification: { not: "VERIFIED" } },
          }),
          tx.suspenseItem.count({ where: { status: "PENDING" } }),
          tx.allocationPlan.findFirst({
            where: { householdId: household.id },
            orderBy: { createdAt: "desc" },
            select: { status: true },
          }),
        ]);

        const result = evaluateTransition(household.workflowState, input.to, {
          verificationComplete: unverifiedCount === 0,
          suspenseEmpty: pendingSuspense === 0,
          allocationPlanApproved: latestPlan?.status === "APPROVED",
        });
        if (!result.allowed) {
          throw new TRPCError({ code: "FORBIDDEN", message: result.reason });
        }

        await tx.workflowTransition.create({
          data: {
            householdId: household.id,
            fromState: household.workflowState,
            toState: input.to,
            reason: input.reason,
          },
        });
        return tx.household.update({
          where: { id: household.id },
          data: { workflowState: input.to },
        });
      });
    }),
});
