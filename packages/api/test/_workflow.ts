import type { PrismaClient } from "@wealthos/db";
import type { appRouter } from "../src/index";

type Caller = ReturnType<typeof appRouter.createCaller>;

/**
 * VERIFICATION -> ALLOCATION -> STRATEGY, the way the app goes since M26.
 *
 * The DB suites were written when VERIFICATION led straight to STRATEGY. M26
 * put the ALLOCATION phase between them (state-machine.ts LEGAL_TRANSITIONS),
 * gated on an APPROVED allocation plan, and these tests then failed with
 * ILLEGAL_TRANSITION on a fresh database. The real plan is generated; when it
 * has steps to decide, it is approved directly - deciding steps is the
 * allocation tests' subject, not these suites'.
 */
export async function throughAllocation(c: Caller, db: PrismaClient, reason = "verified"): Promise<void> {
  await c.workflow.transition({ to: "ALLOCATION", reason });
  const run = await c.allocation.generate();
  if (run.status !== "APPROVED") {
    await db.allocationPlan.update({ where: { id: run.planId }, data: { status: "APPROVED" } });
  }
  await c.workflow.transition({ to: "STRATEGY", reason });
}
