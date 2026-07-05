import { initTRPC, TRPCError } from "@trpc/server";
import type { WorkflowState } from "@wealthos/domain";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

/**
 * Auditability: every successful mutation writes an AuditEvent (actor, procedure path, input).
 * Audit failures are logged, never swallowed silently, and never roll back the mutation.
 */
const auditMiddleware = t.middleware(async ({ ctx, next, path, type, getRawInput }) => {
  const result = await next();
  if (type === "mutation" && result.ok && ctx.session) {
    try {
      const household = await ctx.db.household.findFirst({ select: { id: true } });
      if (household) {
        const rawInput = await getRawInput();
        await ctx.db.auditEvent.create({
          data: {
            householdId: household.id,
            actor: ctx.session.email,
            eventType: path,
            entity: path.split(".")[0] ?? "unknown",
            entityId: "",
            payload: JSON.parse(JSON.stringify(rawInput ?? null)),
          },
        });
      }
    } catch (e) {
      console.error("[audit] failed to write AuditEvent for", path, e);
    }
  }
  return result;
});

export const protectedProcedure = t.procedure.use(authMiddleware).use(auditMiddleware);

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
