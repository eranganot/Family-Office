import { z } from "zod";
import { runStrategy } from "../services/strategy-service";
import { router, workflowGuard } from "../trpc";

/** ALL strategy procedures are built on workflowGuard("STRATEGY") — schema-driven state locking. */
export const strategyRouter = router({
  run: workflowGuard("STRATEGY").mutation(({ ctx }) => runStrategy(ctx.db, ctx.householdId)),

  /** M34 — the latest pinned strategy synthesis (high-level plan narrative + metrics + pins). */
  plan: workflowGuard("STRATEGY").query(({ ctx }) =>
    ctx.db.strategyPlan.findFirst({
      where: { householdId: ctx.householdId },
      orderBy: { createdAt: "desc" },
    }),
  ),

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
    .input(
      z.object({
        id: z.uuid(),
        decision: z.enum(["ACCEPTED", "REJECTED"]),
        note: z.string().max(1000).optional(),
        expectedOutcome: z.string().max(1000).optional(),
        implementationDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db.recommendation.update({
        where: { id: input.id },
        data: { status: input.decision },
      });
      // The decision journal is the household's institutional memory: what was decided,
      // why, what we expected — and later, what actually happened.
      await ctx.db.decisionJournalEntry.create({
        data: {
          recommendationId: input.id,
          decision: input.decision,
          decidedBy: ctx.session.email,
          notes: input.note ?? null,
          expectedOutcome: input.expectedOutcome ?? null,
          implementationDate: input.implementationDate ?? null,
        },
      });
      return updated;
    }),

  /** Remove an ACCEPTED recommendation from the active list once it has been acted on.
   *  Sets it SUPERSEDED (kept in history/journal). If the finding still applies, a later
   *  strategy run will re-propose it. */
  dismiss: workflowGuard("STRATEGY")
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.recommendation.update({ where: { id: input.id }, data: { status: "SUPERSEDED" } }),
    ),

  /** Mark an ACCEPTED recommendation as IMPLEMENTED and record what actually happened.
   *  Closes the loop so the monitoring review-nudge (B4) stops flagging it. */
  markImplemented: workflowGuard("STRATEGY")
    .input(z.object({ id: z.uuid(), actualOutcome: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const rec = await ctx.db.recommendation.update({ where: { id: input.id }, data: { status: "IMPLEMENTED" } });
      const latest = await ctx.db.decisionJournalEntry.findFirst({
        where: { recommendationId: input.id },
        orderBy: { decidedAt: "desc" },
      });
      if (latest) {
        if (input.actualOutcome) {
          await ctx.db.decisionJournalEntry.update({ where: { id: latest.id }, data: { actualOutcome: input.actualOutcome } });
        }
      } else {
        await ctx.db.decisionJournalEntry.create({
          data: { recommendationId: input.id, decision: "ACCEPTED", decidedBy: ctx.session.email, actualOutcome: input.actualOutcome ?? null },
        });
      }
      return rec;
    }),
});
