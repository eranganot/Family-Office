import { initTRPC, TRPCError } from "@trpc/server";
import type { WorkflowState } from "@wealthos/domain";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Schema-driven state locking: procedures wrapped with workflowGuard(state) are rejected
 * unless the household's PERSISTED workflow_state matches. Reads from DB per request —
 * never from client input. Strategy/scenario modules are built exclusively on top of this.
 */
export function workflowGuard(required: WorkflowState) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const household = await ctx.db.household.findFirst({
      select: { id: true, workflowState: true },
    });
    if (!household) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No household bootstrapped" });
    }
    if (household.workflowState !== required) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires workflow state ${required}, current state is ${household.workflowState}`,
      });
    }
    return next({ ctx: { ...ctx, householdId: household.id } });
  });
}
