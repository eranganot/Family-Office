import { TRPCError } from "@trpc/server";
import { ledgerRepo } from "@wealthos/db";
import {
  assessHousehold,
  buildMissingDocsReport,
  type ItemProjection,
  type LedgerItemDoc,
} from "@wealthos/engine-verification";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const verificationRouter = router({
  /** The full Phase-2 picture: item assessments, scores, gate status, missing docs. */
  assessment: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const now = new Date();

    const items = await ledgerRepo.list(ctx.db, householdId);
    const projections: ItemProjection[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      verification: i.verification,
      confidence: i.confidence,
      lastConfirmedAt: i.lastConfirmedAt,
      latestValuationAsOf: i.latestValuation?.asOf ?? null,
    }));
    const pendingSuspense = await ctx.db.suspenseItem.count({ where: { status: "PENDING" } });
    const assessment = assessHousehold(projections, pendingSuspense, now);

    const docItems: LedgerItemDoc[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      accountType: i.accountDetail?.accountType,
      hasSalaryFlow: i.cashFlowDetail?.flowType === "SALARY",
    }));
    const docs = await ctx.db.document.findMany({ select: { docType: true, uploadedAt: true } });
    const missingDocs = buildMissingDocsReport(docItems, docs, now);

    return { assessment, missingDocs };
  }),

  /** Human sign-off: this item's data is correct as shown. */
  verify: protectedProcedure.input(z.object({ itemId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const item = await ctx.db.ledgerItem.findUnique({ where: { id: input.itemId } });
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return ctx.db.ledgerItem.update({
      where: { id: input.itemId },
      data: { verification: "VERIFIED", confidence: 100, lastConfirmedAt: new Date() },
    });
  }),

  /** Human rejection: data is wrong; item stays blocked until corrected and re-verified. */
  reject: protectedProcedure
    .input(z.object({ itemId: z.uuid(), note: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.ledgerItem.findUnique({ where: { id: input.itemId } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.ledgerItem.update({
        where: { id: input.itemId },
        data: {
          verification: "REJECTED",
          confidence: 0,
          notes: `[REJECTED] ${input.note}${item.notes ? ` | ${item.notes}` : ""}`,
        },
      });
    }),
});
