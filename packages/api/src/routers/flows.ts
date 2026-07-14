import { ledgerRepo } from "@wealthos/db";
import { z } from "zod";
import { DecimalString, LedgerBaseSchema, PositiveDecimalString } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { assertOwnership, requireHouseholdId } from "./ledger";

const CreateCashFlowSchema = LedgerBaseSchema.extend({
  flowType: z.enum([
    "SALARY",
    "SELF_EMPLOYMENT_INCOME",
    "RENTAL_INCOME",
    "PENSION_INCOME",
    "OTHER_INCOME",
    "LIVING_EXPENSE",
    "HOUSING_EXPENSE",
    "EDUCATION_EXPENSE",
    "INSURANCE_PREMIUM",
    "LOAN_PAYMENT",
    "OTHER_EXPENSE",
    "HISHTALMUT_CONTRIBUTION",
    "PENSION_CONTRIBUTION",
  ]),
  amount: PositiveDecimalString,
  frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  isGross: z.boolean().default(true),
});

const INCOME_TYPES = new Set(["SALARY", "SELF_EMPLOYMENT_INCOME", "RENTAL_INCOME", "PENSION_INCOME", "OTHER_INCOME"]);

const CreateInsuranceSchema = LedgerBaseSchema.extend({
  policyType: z.enum(["LIFE", "DISABILITY", "HEALTH", "LONG_TERM_CARE", "PROPERTY", "MORTGAGE_LIFE", "OTHER"]),
  coverageAmount: DecimalString.optional(),
  monthlyPremium: DecimalString.optional(),
  throughPension: z.boolean().default(false),
  insuredMemberId: z.uuid().optional(),
  endDate: z.coerce.date().optional(),
});

const CreateLoanSchema = LedgerBaseSchema.extend({
  lenderName: z.string().max(200).optional(),
  principalRemaining: PositiveDecimalString,
  annualRatePct: DecimalString,
  endDate: z.coerce.date().optional(),
  purpose: z.string().max(300).optional(),
});

export const flowsRouter = router({
  createCashFlow: protectedProcedure.input(CreateCashFlowSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    if (input.endDate && input.endDate < input.startDate) {
      throw new (await import("@trpc/server")).TRPCError({ code: "BAD_REQUEST", message: "END_BEFORE_START" });
    }
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      { kind: "CASH_FLOW", name: input.name, currency: input.currency, notes: input.notes, ownership: input.ownership },
      undefined,
      async (tx, itemId) => {
        await tx.cashFlowDetail.create({
          data: {
            ledgerItemId: itemId,
            flowType: input.flowType,
            direction: INCOME_TYPES.has(input.flowType) ? "IN" : "OUT",
            amount: input.amount,
            frequency: input.frequency,
            startDate: input.startDate,
            endDate: input.endDate ?? null,
            isGross: input.isGross,
          },
        });
      },
    );
    return { id };
  }),

  createInsurance: protectedProcedure.input(CreateInsuranceSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      { kind: "INSURANCE", name: input.name, currency: input.currency, notes: input.notes, ownership: input.ownership },
      undefined,
      async (tx, itemId) => {
        await tx.insuranceDetail.create({
          data: {
            ledgerItemId: itemId,
            policyType: input.policyType,
            coverageAmount: input.coverageAmount ?? null,
            monthlyPremium: input.monthlyPremium ?? null,
            throughPension: input.throughPension,
            insuredMemberId: input.insuredMemberId ?? null,
            endDate: input.endDate ?? null,
          },
        });
      },
    );
    return { id };
  }),

  createLoan: protectedProcedure.input(CreateLoanSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      { kind: "LOAN", name: input.name, currency: input.currency, notes: input.notes, ownership: input.ownership },
      { asOf: new Date(), value: input.principalRemaining, currency: input.currency, source: "MANUAL_ENTRY", confidence: 70 },
      async (tx, itemId) => {
        await tx.loanDetail.create({
          data: {
            ledgerItemId: itemId,
            lenderName: input.lenderName ?? null,
            principalRemaining: input.principalRemaining,
            annualRatePct: input.annualRatePct,
            endDate: input.endDate ?? null,
            purpose: input.purpose ?? null,
          },
        });
      },
    );
    return { id };
  }),

  updateCashFlow: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        flowType: CreateCashFlowSchema.shape.flowType.optional(),
        amount: PositiveDecimalString.optional(),
        frequency: z.enum(["MONTHLY", "ANNUAL", "ONE_TIME"]).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        isGross: z.boolean().optional(),
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
        if (input.flowType !== undefined) {
          detailData["direction"] = INCOME_TYPES.has(input.flowType) ? "IN" : "OUT";
        }
        if (Object.keys(detailData).length > 0) {
          await tx.cashFlowDetail.update({ where: { ledgerItemId: id }, data: detailData as never });
        }
      });
      return { id };
    }),

  updateInsurance: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        policyType: CreateInsuranceSchema.shape.policyType.optional(),
        coverageAmount: DecimalString.optional(),
        monthlyPremium: DecimalString.optional(),
        throughPension: z.boolean().optional(),
        insuredMemberId: z.uuid().nullable().optional(),
        endDate: z.coerce.date().optional(),
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
          await tx.insuranceDetail.update({ where: { ledgerItemId: id }, data: detailData as never });
        }
      });
      return { id };
    }),

  updateLoan: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().min(1).max(200).optional(),
        notes: z.string().max(2000).optional(),
        lenderName: z.string().max(200).optional(),
        principalRemaining: PositiveDecimalString.optional(),
        annualRatePct: DecimalString.optional(),
        endDate: z.coerce.date().optional(),
        purpose: z.string().max(300).optional(),
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
          await tx.loanDetail.update({ where: { ledgerItemId: id }, data: detailData as never });
        }
      });
      return { id };
    }),
});
