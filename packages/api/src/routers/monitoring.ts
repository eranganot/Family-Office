import { TRPCError } from "@trpc/server";
import { evaluateTransition } from "@wealthos/domain";
import { z } from "zod";
import { runMonitoringCycle } from "../services/monitoring-service";
import { protectedProcedure, router } from "../trpc";

/**
 * Phase-4 monitoring surface. Reads (timeline, runs, alerts) work in any phase so
 * the household can always inspect its monitoring history. The re-evaluation
 * action is the guarded bridge that closes the four-phase loop: drift/staleness
 * routes the household back to VERIFICATION (re-verify stale data) or STRATEGY
 * (re-run against the changed picture).
 */
export const monitoringRouter = router({
  /** Manual monitoring cycle (same code path as the cron worker). */
  runNow: protectedProcedure.mutation(async ({ ctx }) => {
    const h = await ctx.db.household.findFirst({ select: { id: true } });
    if (!h) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household bootstrapped" });
    return runMonitoringCycle(ctx.db, h.id, "MANUAL");
  }),

  /** Monitoring-run timeline with their alerts (newest first). */
  runs: protectedProcedure.query(({ ctx }) =>
    ctx.db.monitoringRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { alerts: { orderBy: { createdAt: "asc" } } },
    }),
  ),

  /** Snapshot timeline for the history view. */
  snapshots: protectedProcedure.query(({ ctx }) =>
    ctx.db.householdSnapshot.findMany({
      orderBy: { takenAt: "desc" },
      take: 100,
      select: { id: true, kind: true, takenAt: true, schemaVersion: true },
    }),
  ),

  /** Open + acknowledged alerts, highest severity first. */
  alerts: protectedProcedure
    .input(z.object({ includeResolved: z.boolean().default(false) }).default({ includeResolved: false }))
    .query(({ ctx, input }) =>
      ctx.db.monitoringAlert.findMany({
        where: input.includeResolved ? {} : { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 200,
      }),
    ),

  acknowledgeAlert: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.monitoringAlert.update({ where: { id: input.id }, data: { status: "ACKNOWLEDGED" } }),
    ),

  /**
   * The re-evaluation transition. From MONITORING the household may go to:
   *   - VERIFICATION: re-verify stale/changed data (facts checked; always legal),
   *   - STRATEGY: re-run the strategy engine against the new picture.
   * Facts are computed from the ledger inside the transaction — never trusted from
   * the client. Open alerts are resolved as the household acts on them.
   */
  reevaluate: protectedProcedure
    .input(z.object({ target: z.enum(["VERIFICATION", "ALLOCATION", "STRATEGY"]), reason: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        const household = await tx.household.findFirst();
        if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household" });
        if (household.workflowState !== "MONITORING") {
          throw new TRPCError({ code: "FORBIDDEN", message: `Re-evaluation starts from MONITORING; current state is ${household.workflowState}` });
        }

        const [unverifiedCount, pendingSuspense] = await Promise.all([
          tx.ledgerItem.count({ where: { householdId: household.id, status: "ACTIVE", verification: { not: "VERIFIED" } } }),
          tx.suspenseItem.count({ where: { status: "PENDING" } }),
        ]);

        const latestPlan = await tx.allocationPlan.findFirst({
          where: { householdId: household.id },
          orderBy: { createdAt: "desc" },
          select: { status: true },
        });
        const result = evaluateTransition(household.workflowState, input.target, {
          verificationComplete: unverifiedCount === 0,
          suspenseEmpty: pendingSuspense === 0,
          allocationPlanApproved: latestPlan?.status === "APPROVED",
        });
        if (!result.allowed) throw new TRPCError({ code: "FORBIDDEN", message: result.reason });

        await tx.workflowTransition.create({
          data: { householdId: household.id, fromState: household.workflowState, toState: input.target, reason: `re-evaluation: ${input.reason}` },
        });
        await tx.household.update({ where: { id: household.id }, data: { workflowState: input.target } });

        const resolved = await tx.monitoringAlert.updateMany({
          where: { householdId: household.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          data: { status: "RESOLVED", resolvedAt: new Date() },
        });

        return { from: "MONITORING", to: input.target, alertsResolved: resolved.count, staleItems: unverifiedCount };
      });
    }),
});
