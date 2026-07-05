import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Context } from "../src/context";
import { protectedProcedure, router } from "../src/trpc";

function makeCtx() {
  const auditWrites: unknown[] = [];
  const db = {
    household: { findFirst: async () => ({ id: "h1" }) },
    auditEvent: { create: async (args: unknown) => void auditWrites.push(args) },
  };
  const ctx: Context = { session: { email: "test@household.local" }, db: db as never };
  return { ctx, auditWrites };
}

const testRouter = router({
  doMutation: protectedProcedure.input(z.object({ v: z.number() })).mutation(({ input }) => input.v * 2),
  doQuery: protectedProcedure.query(() => "data"),
});

describe("audit middleware", () => {
  it("writes an AuditEvent for every successful mutation", async () => {
    const { ctx, auditWrites } = makeCtx();
    await testRouter.createCaller(ctx).doMutation({ v: 21 });
    expect(auditWrites).toHaveLength(1);
    expect(auditWrites[0]).toMatchObject({
      data: { actor: "test@household.local", eventType: "doMutation", payload: { v: 21 } },
    });
  });

  it("does not audit queries", async () => {
    const { ctx, auditWrites } = makeCtx();
    await testRouter.createCaller(ctx).doQuery();
    expect(auditWrites).toHaveLength(0);
  });

  it("does not audit failed mutations", async () => {
    const { ctx, auditWrites } = makeCtx();
    await expect(testRouter.createCaller(ctx).doMutation({ v: "x" as never })).rejects.toThrow();
    expect(auditWrites).toHaveLength(0);
  });
});
