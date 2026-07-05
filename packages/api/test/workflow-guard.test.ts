import { WorkflowStates, type WorkflowState } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context";
import { router, workflowGuard } from "../src/trpc";

// A probe router with one guarded procedure per workflow state.
const probeRouter = router({
  mapping: workflowGuard("MAPPING").query(() => "ok"),
  verification: workflowGuard("VERIFICATION").query(() => "ok"),
  strategy: workflowGuard("STRATEGY").query(() => "ok"),
  monitoring: workflowGuard("MONITORING").query(() => "ok"),
});

function ctxWithState(state: WorkflowState | null): Context {
  const db = {
    household: {
      findFirst: async () => (state ? { id: "h1", workflowState: state } : null),
    },
  };
  return { session: { email: "test@household.local" }, db: db as never };
}

const procedures = ["mapping", "verification", "strategy", "monitoring"] as const;
const requiredState: Record<(typeof procedures)[number], WorkflowState> = {
  mapping: "MAPPING",
  verification: "VERIFICATION",
  strategy: "STRATEGY",
  monitoring: "MONITORING",
};

describe("workflowGuard blocking matrix", () => {
  it("every guarded procedure × every persisted state: allowed iff states match", async () => {
    for (const proc of procedures) {
      for (const state of WorkflowStates) {
        const caller = probeRouter.createCaller(ctxWithState(state));
        const call = caller[proc]();
        if (state === requiredState[proc]) {
          await expect(call, `${proc} @ ${state}`).resolves.toBe("ok");
        } else {
          await expect(call, `${proc} @ ${state}`).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      }
    }
  });

  it("rejects when no household exists", async () => {
    const caller = probeRouter.createCaller(ctxWithState(null));
    await expect(caller.strategy()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects unauthenticated callers before touching the DB", async () => {
    const ctx = { session: null, db: undefined as never } as Context;
    const caller = probeRouter.createCaller(ctx);
    await expect(caller.strategy()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
