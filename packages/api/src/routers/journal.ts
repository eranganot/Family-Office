import { z } from "zod";
import { protectedProcedure, router } from "../trpc";

/**
 * The decision journal is readable and completable in ANY phase — recording what
 * actually happened months later is exactly the MONITORING-phase activity.
 */
export const journalRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db.decisionJournalEntry.findMany({
      include: {
        recommendation: { select: { title: true, titleHe: true, type: true, status: true, priorityScore: true } },
      },
      orderBy: { decidedAt: "desc" },
      take: 200,
    }),
  ),

  recordOutcome: protectedProcedure
    .input(z.object({ entryId: z.uuid(), actualOutcome: z.string().min(1).max(2000) }))
    .mutation(({ ctx, input }) =>
      ctx.db.decisionJournalEntry.update({
        where: { id: input.entryId },
        data: { actualOutcome: input.actualOutcome },
      }),
    ),
});
