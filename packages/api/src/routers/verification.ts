import { TRPCError } from "@trpc/server";
import { ledgerRepo } from "@wealthos/db";
import {
  assessHousehold,
  buildMissingDocsReport,
  type ItemProjection,
  type LedgerItemDoc,
} from "@wealthos/engine-verification";
import { z } from "zod";
import { assumptionRegistry } from "@wealthos/registry";
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
    /**
     * ⚠️ Deliberately NOT household-scoped, unlike the document query below.
     *
     * SuspenseItem has no householdId. It reaches one only through
     * `batch.document.householdId`, and `ImportBatch.documentId` is NULLABLE — manual
     * imports have no document. So the obvious scoping, `batch: { document: { householdId } }`,
     * would silently DROP every manually-created suspense row from the count.
     *
     * An under-counted suspense queue reads as a clean one, which unblocks the
     * VERIFICATION gate and makes every closed month look less provisional than it is.
     * That is this module's recurring failure exactly: a correct-looking narrowing that
     * disables the thing it filters. One household exists, so the unscoped count is
     * currently right; scoping it properly needs householdId denormalised onto
     * ImportBatch, which is a migration and its own decision.
     */
    const pendingSuspense = await ctx.db.suspenseItem.count({ where: { status: "PENDING" } });
    // Thresholds come from the AssumptionRegistry (household overrides respected).
    const reg = assumptionRegistry(ctx.db);
    const [staleness, lowConfidence] = await Promise.all([
      reg.current("staleness_days_by_kind", householdId).catch(() => null),
      reg.current("low_confidence_threshold", householdId).catch(() => null),
    ]);
    const assessment = assessHousehold(projections, pendingSuspense, now, {
      stalenessDaysByKind: (staleness?.value as Record<string, number> | undefined) ?? undefined,
      lowConfidenceThreshold: (lowConfidence?.value as number | undefined) ?? undefined,
    });

    const docItems: LedgerItemDoc[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      accountType: i.accountDetail?.accountType,
      hasSalaryFlow: i.cashFlowDetail?.flowType === "SALARY",
    }));
    // Scoped to the household. Both this and the suspense count above were unscoped —
    // harmless while exactly one household exists, wrong the moment a second one does,
    // and the kind of latent fault that is far cheaper to fix before it has data.
    const docs = await ctx.db.document.findMany({
      where: { householdId },
      select: { docType: true, uploadedAt: true },
    });
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
