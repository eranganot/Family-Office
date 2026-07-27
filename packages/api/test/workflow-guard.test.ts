import { WorkflowStates, type WorkflowState } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context";
import { minPhaseGuard, router, workflowGuard } from "../src/trpc";

// A probe router with one guarded procedure per workflow state.
const probeRouter = router({
  mapping: workflowGuard("MAPPING").query(() => "ok"),
  verification: workflowGuard("VERIFICATION").query(() => "ok"),
  strategy: workflowGuard("STRATEGY").query(() => "ok"),
  monitoring: workflowGuard("MONITORING").query(() => "ok"),
});

// A probe router for the M36 cross-phase guard. Financial Operations is NOT a
// workflow state — it becomes available at VERIFICATION and must stay available in
// every later phase, so it uses a MINIMUM phase rather than an exact match.
const minPhaseRouter = router({
  fromMapping: minPhaseGuard("MAPPING").query(() => "ok"),
  fromVerification: minPhaseGuard("VERIFICATION").query(() => "ok"),
  fromStrategy: minPhaseGuard("STRATEGY").query(() => "ok"),
});

function ctxWithState(state: WorkflowState | null): Context {
  const db = {
    household: {
      findFirst: async () => (state ? { id: "h1", workflowState: state, baseCurrency: "ILS" } : null),
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

describe("minPhaseGuard — the cross-phase guard behind Financial Operations", () => {
  // Ordered as the state machine orders them.
  const ORDER: WorkflowState[] = ["MAPPING", "VERIFICATION", "ALLOCATION", "STRATEGY", "MONITORING"];
  const probes = [
    { proc: "fromMapping", min: "MAPPING" },
    { proc: "fromVerification", min: "VERIFICATION" },
    { proc: "fromStrategy", min: "STRATEGY" },
  ] as const;

  it("allows the required phase AND every phase after it, blocks only earlier ones", async () => {
    for (const { proc, min } of probes) {
      for (const state of ORDER) {
        const caller = minPhaseRouter.createCaller(ctxWithState(state));
        const call = caller[proc]();
        const allowed = ORDER.indexOf(state) >= ORDER.indexOf(min);
        if (allowed) {
          await expect(call, `${proc} @ ${state} should be allowed`).resolves.toBe("ok");
        } else {
          await expect(call, `${proc} @ ${state} should be blocked`).rejects.toMatchObject({ code: "FORBIDDEN" });
        }
      }
    }
  });

  it("stays open once reached — this is the difference from workflowGuard", async () => {
    // workflowGuard("VERIFICATION") rejects in STRATEGY; minPhaseGuard must not.
    await expect(
      minPhaseRouter.createCaller(ctxWithState("STRATEGY")).fromVerification(),
    ).resolves.toBe("ok");
    await expect(
      probeRouter.createCaller(ctxWithState("STRATEGY")).verification(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks operations during MAPPING — before anything is verified there is nothing to operate on", async () => {
    await expect(
      minPhaseRouter.createCaller(ctxWithState("MAPPING")).fromVerification(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when no household exists", async () => {
    await expect(
      minPhaseRouter.createCaller(ctxWithState(null)).fromVerification(),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects unauthenticated callers before touching the DB", async () => {
    const ctx = { session: null, db: undefined as never } as Context;
    await expect(
      minPhaseRouter.createCaller(ctx).fromVerification(),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("exposes baseCurrency on the context so procedures need not re-query the household", async () => {
    const probe = router({ echo: minPhaseGuard("VERIFICATION").query(({ ctx }) => ctx.baseCurrency) });
    await expect(probe.createCaller(ctxWithState("STRATEGY")).echo()).resolves.toBe("ILS");
  });
});
