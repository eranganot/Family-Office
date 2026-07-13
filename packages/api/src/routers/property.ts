import { TRPCError } from "@trpc/server";
import { ledgerRepo } from "@wealthos/db";
import { totalPrincipal, validateMortgageTracks } from "@wealthos/domain";
import { z } from "zod";
import { DecimalString, LedgerBaseSchema, ValuationInputSchema } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { assertOwnership, requireHouseholdId } from "./ledger";

const CreateRealEstateSchema = LedgerBaseSchema.extend({
  address: z.string().min(1).max(300),
  city: z.string().max(120).optional(),
  propertyType: z.enum(["APARTMENT", "HOUSE", "LOT", "COMMERCIAL"]),
  isPrimaryResidence: z.boolean().default(false),
  purchaseDate: z.coerce.date().optional(),
  purchasePrice: DecimalString.optional(),
  initialValuation: ValuationInputSchema.optional(),
});

const MortgageTrackSchema = z.object({
  trackType: z.enum(["PRIME", "FIXED_LINKED", "FIXED_UNLINKED", "VARIABLE_LINKED", "VARIABLE_UNLINKED", "FOREIGN_CURRENCY"]),
  principalRemaining: DecimalString,
  annualRatePct: DecimalString,
  cpiLinked: z.boolean(),
  monthlyPayment: DecimalString.optional(),
  endDate: z.coerce.date(),
});

const CreateMortgageSchema = LedgerBaseSchema.extend({
  lenderName: z.string().max(200).optional(),
  linkedPropertyId: z.uuid().optional(),
  startDate: z.coerce.date(),
  tracks: z.array(MortgageTrackSchema).min(1),
});

export const propertyRouter = router({
  createRealEstate: protectedProcedure.input(CreateRealEstateSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      { kind: "REAL_ESTATE", name: input.name, currency: input.currency, notes: input.notes, ownership: input.ownership },
      input.initialValuation ? { ...input.initialValuation, source: "MANUAL_ENTRY" } : undefined,
      async (tx, itemId) => {
        await tx.realEstateDetail.create({
          data: {
            ledgerItemId: itemId,
            address: input.address,
            city: input.city ?? null,
            propertyType: input.propertyType,
            isPrimaryResidence: input.isPrimaryResidence,
            purchaseDate: input.purchaseDate ?? null,
            purchasePrice: input.purchasePrice ?? null,
            purchaseCurrency: input.purchasePrice ? input.currency : null,
          },
        });
      },
    );
    return { id };
  }),

  /** Mortgage balance = sum of track principals; recorded as an initial CALCULATED valuation. */
  createMortgage: protectedProcedure.input(CreateMortgageSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    const tracksForValidation = input.tracks.map((t) => ({ ...t, endDate: t.endDate }));
    const validation = validateMortgageTracks(tracksForValidation);
    if (!validation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });
    if (input.linkedPropertyId) {
      const property = await ctx.db.realEstateDetail.findUnique({ where: { ledgerItemId: input.linkedPropertyId } });
      if (!property) throw new TRPCError({ code: "BAD_REQUEST", message: "LINKED_PROPERTY_NOT_FOUND" });
    }
    const principal = totalPrincipal(tracksForValidation).toFixed(4);
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      { kind: "MORTGAGE", name: input.name, currency: input.currency, notes: input.notes, ownership: input.ownership },
      { asOf: new Date(), value: principal, currency: input.currency, source: "CALCULATED", confidence: 80 },
      async (tx, itemId) => {
        await tx.mortgageDetail.create({
          data: {
            ledgerItemId: itemId,
            lenderId: null,
            linkedPropertyId: input.linkedPropertyId ?? null,
            originalPrincipal: principal,
            startDate: input.startDate,
            tracks: {
              create: input.tracks.map((t) => ({
                trackType: t.trackType,
                principalRemaining: t.principalRemaining,
                annualRatePct: t.annualRatePct,
                cpiLinked: t.cpiLinked,
                monthlyPayment: t.monthlyPayment ?? null,
                endDate: t.endDate,
              })),
            },
          },
        });
        if (input.lenderName) {
          await tx.ledgerItem.update({ where: { id: itemId }, data: { notes: `Lender: ${input.lenderName}${input.notes ? ` | ${input.notes}` : ""}` } });
        }
      },
    );
    return { id };
  }),

  updateRealEstate: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        address: z.string().min(1).max(300).optional(),
        city: z.string().max(120).optional(),
        propertyType: z.enum(["APARTMENT", "HOUSE", "LOT", "COMMERCIAL"]).optional(),
        isPrimaryResidence: z.boolean().optional(),
        purchaseDate: z.coerce.date().optional(),
        purchasePrice: DecimalString.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, name, notes, ...detail } = input;
      await ctx.db.$transaction(async (tx) => {
        const base: Record<string, unknown> = {};
        if (name !== undefined) base["name"] = name;
        if (notes !== undefined) base["notes"] = notes;
        if (Object.keys(base).length > 0) await tx.ledgerItem.update({ where: { id }, data: base });
        const detailData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(detail)) if (v !== undefined) detailData[k] = v;
        if (Object.keys(detailData).length > 0) {
          await tx.realEstateDetail.update({ where: { ledgerItemId: id }, data: detailData as never });
        }
      });
      return { id };
    }),

  /** Track edits replace the full track set (same validation as create); a new CALCULATED valuation is appended. */
  updateMortgage: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        linkedPropertyId: z.uuid().nullable().optional(),
        startDate: z.coerce.date().optional(),
        tracks: z.array(MortgageTrackSchema).min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, name, notes, linkedPropertyId, startDate, tracks } = input;
      if (linkedPropertyId) {
        const property = await ctx.db.realEstateDetail.findUnique({ where: { ledgerItemId: linkedPropertyId } });
        if (!property) throw new TRPCError({ code: "BAD_REQUEST", message: "LINKED_PROPERTY_NOT_FOUND" });
      }
      await ctx.db.$transaction(async (tx) => {
        const base: Record<string, unknown> = {};
        if (name !== undefined) base["name"] = name;
        if (notes !== undefined) base["notes"] = notes;
        if (Object.keys(base).length > 0) await tx.ledgerItem.update({ where: { id }, data: base });

        const detailData: Record<string, unknown> = {};
        if (linkedPropertyId !== undefined) detailData["linkedPropertyId"] = linkedPropertyId;
        if (startDate !== undefined) detailData["startDate"] = startDate;
        if (Object.keys(detailData).length > 0) {
          await tx.mortgageDetail.update({ where: { ledgerItemId: id }, data: detailData as never });
        }

        if (tracks !== undefined) {
          const validation = validateMortgageTracks(tracks);
          if (!validation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });
          await tx.mortgageTrack.deleteMany({ where: { mortgageId: id } });
          await tx.mortgageTrack.createMany({
            data: tracks.map((t) => ({
              mortgageId: id,
              trackType: t.trackType,
              principalRemaining: t.principalRemaining,
              annualRatePct: t.annualRatePct,
              cpiLinked: t.cpiLinked,
              monthlyPayment: t.monthlyPayment ?? null,
              endDate: t.endDate,
            })),
          });
          const item = await tx.ledgerItem.findUniqueOrThrow({ where: { id }, select: { currency: true } });
          await tx.valuation.create({
            data: {
              ledgerItemId: id,
              asOf: new Date(),
              value: totalPrincipal(tracks).toFixed(4),
              currency: item.currency,
              source: "CALCULATED",
              confidence: 80,
            },
          });
        }
      });
      return { id };
    }),
});
