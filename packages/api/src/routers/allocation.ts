import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { runAllocation } from "../services/allocation-service";
import { protectedProcedure, router, workflowGuard } from "../trpc";
import { requireHouseholdId } from "./ledger";

/** M25 — ALLOCATION phase: deployment plans for free cash, gated to the phase. */
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

  approve: workflowGuard("ALLOCATION")
    .input(z.object({ id: z.uuid(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.db.allocationPlan.findUnique({ where: { id: input.id } });
      if (!plan || plan.householdId !== ctx.householdId) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.status !== "PROPOSED") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PLAN_NOT_PROPOSED" });
      return ctx.db.allocationPlan.update({
        where: { id: input.id },
        data: { status: "APPROVED", approvedAt: new Date(), note: input.note ?? null },
      });
    }),
});
