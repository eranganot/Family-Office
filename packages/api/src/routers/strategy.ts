import { z } from "zod";
import { runStrategy } from "../services/strategy-service";
import { protectedProcedure, router, workflowGuard } from "../trpc";

/** ALL strategy procedures are built on workflowGuard("STRATEGY") — schema-driven state locking. */
export const strategyRouter = router({
  run: workflowGuard("STRATEGY").mutation(({ ctx }) => runStrategy(ctx.db, ctx.householdId)),

  recommendations: workflowGuard("STRATEGY").query(({ ctx }) =>
    ctx.db.recommendation.findMany({
      where: { householdId: ctx.householdId, status: { in: ["PROPOSED", "ACCEPTED"] } },
      include: {
        goalImpacts: { include: { goal: { select: { name: true } } } },
        evidence: { include: { ledgerItem: { select: { name: true } } } },
        assumptionPins: { include: { assumption: { select: { key: true, version: true, value: true } } } },
      },
      orderBy: { priorityScore: "desc" },
    }),
  ),

  decide: workflowGuard("STRATEGY")
    .input(z.object({ id: z.uuid(), decision: z.enum(["ACCEPTED", "REJECTED"]), note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.recommendation.update({
        where: { id: input.id },
        data: { status: input.decision },
      });
      // Journal every decision (M7 expands with expected/actual outcomes).
      await ctx.db.decisionJournalEntry.create({
        data: {
          recommendationId: input.id,
          decision: input.decision,
          decidedBy: ctx.session.email,
          notes: input.note ?? null,
        },
      });
      return updated;
    }),
});
