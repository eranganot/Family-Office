import { ledgerRepo } from "@wealthos/db";
import { z } from "zod";
import { LedgerBaseSchema, ValuationInputSchema } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { assertOwnership, requireHouseholdId } from "./ledger";

export const AccountTypeSchema = z.enum([
  "BANK_CHECKING",
  "BANK_SAVINGS",
  "BANK_DEPOSIT",
  "BROKERAGE_IL",
  "BROKERAGE_FOREIGN",
  "PENSION_COMPREHENSIVE",
  "PENSION_GENERAL",
  "KUPAT_GEMEL",
  "GEMEL_LEHASHKAA",
  "KEREN_HISHTALMUT",
  "IRA_GEMEL",
  "FOREIGN_RETIREMENT",
  "CASH_OTHER",
]);

const CreateAccountSchema = LedgerBaseSchema.extend({
  accountType: AccountTypeSchema,
  institutionName: z.string().min(1).max(200),
  institutionCountry: z.string().length(2).default("IL"),
  accountNumberMasked: z.string().max(40).optional(),
  trackName: z.string().max(120).optional(),
  managementFeePct: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  depositFeePct: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  employerName: z.string().max(200).optional(),
  openedAt: z.coerce.date().optional(),
  liquidityClass: z.enum(["LIQUID", "RESTRICTED", "LOCKED"]).optional(),
  initialValuation: ValuationInputSchema.optional(),
});

export const accountsRouter = router({
  institutions: protectedProcedure.query(({ ctx }) =>
    ctx.db.institution.findMany({ orderBy: { name: "asc" } }),
  ),

  create: protectedProcedure.input(CreateAccountSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    assertOwnership(input.ownership);
    const institutionType = input.accountType.startsWith("BANK")
      ? "BANK"
      : input.accountType.startsWith("BROKERAGE")
        ? "BROKER"
        : "PENSION_COMPANY";
    const id = await ledgerRepo.createItem(
      ctx.db,
      householdId,
      {
        kind: "ACCOUNT",
        name: input.name,
        currency: input.currency,
        notes: input.notes,
        ownership: input.ownership,
      },
      input.initialValuation ? { ...input.initialValuation, source: "MANUAL_ENTRY" } : undefined,
      async (tx, itemId) => {
        const institution = await tx.institution.upsert({
          where: { name_country: { name: input.institutionName, country: input.institutionCountry } },
          create: { name: input.institutionName, country: input.institutionCountry, type: institutionType },
          update: {},
        });
        await tx.accountDetail.create({
          data: {
            ledgerItemId: itemId,
            institutionId: institution.id,
            accountType: input.accountType,
            accountNumberMasked: input.accountNumberMasked ?? null,
            trackName: input.trackName ?? null,
            managementFeePct: input.managementFeePct ?? null,
            depositFeePct: input.depositFeePct ?? null,
            employerName: input.employerName ?? null,
            openedAt: input.openedAt ?? null,
            liquidityClass: input.liquidityClass ?? null,
          },
        });
      },
    );
    return { id };
  }),
});
