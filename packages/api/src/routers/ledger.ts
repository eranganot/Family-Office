import { TRPCError } from "@trpc/server";
import { ledgerRepo } from "@wealthos/db";
import { validateOwnershipShares } from "@wealthos/domain";
import { z } from "zod";
import {
  AddValuationSchema,
  LedgerBaseSchema,
  LedgerKindSchema,
  ValuationInputSchema,
} from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";

export async function requireHouseholdId(db: Parameters<typeof ledgerRepo.list>[0]): Promise<string> {
  const household = await db.household.findFirst({ select: { id: true } });
  if (!household) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Bootstrap household first" });
  return household.id;
}

export function assertOwnership(ownership: { familyMemberId: string; sharePct: string }[]): void {
  const validation = validateOwnershipShares(ownership);
  if (!validation.valid) {
    throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });
  }
}

export const ledgerRouter = router({
  list: protectedProcedure
    .input(z.object({ kind: LedgerKindSchema.optional(), includeClosed: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      return ledgerRepo.list(ctx.db, householdId, {
        kind: input?.kind,
        includeClosed: input?.includeClosed,
      });
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const item = await ledgerRepo.get(ctx.db, input.id);
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  }),

  /** Untyped assets/liabilities only; typed kinds have dedicated create procedures. */
  createOther: protectedProcedure
    .input(
      LedgerBaseSchema.extend({
        kind: z.enum(["OTHER_ASSET", "OTHER_LIABILITY"]),
        initialValuation: ValuationInputSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      assertOwnership(input.ownership);
      const id = await ledgerRepo.createItem(
        ctx.db,
        householdId,
        {
          kind: input.kind,
          name: input.name,
          currency: input.currency,
          notes: input.notes,
          ownership: input.ownership,
        },
        input.initialValuation
          ? { ...input.initialValuation, source: "MANUAL_ENTRY" }
          : undefined,
      );
      return { id };
    }),

  updateBase: protectedProcedure
    .input(z.object({ id: z.uuid(), name: z.string().min(1).max(200).optional(), notes: z.string().max(2000).optional() }))
    .mutation(({ ctx, input: { id, ...patch } }) => ledgerRepo.updateBase(ctx.db, id, patch)),

  close: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => ledgerRepo.closeItem(ctx.db, input.id)),

  addValuation: protectedProcedure.input(AddValuationSchema).mutation(({ ctx, input }) =>
    ledgerRepo.addValuation(ctx.db, input.ledgerItemId, {
      asOf: input.asOf,
      value: input.value,
      currency: input.currency,
      source: "MANUAL_ENTRY",
      confidence: input.confidence,
      supersedesId: input.supersedesId,
    }),
  ),

  valuationHistory: protectedProcedure
    .input(z.object({ ledgerItemId: z.uuid() }))
    .query(({ ctx, input }) => ledgerRepo.valuationHistory(ctx.db, input.ledgerItemId)),
});
