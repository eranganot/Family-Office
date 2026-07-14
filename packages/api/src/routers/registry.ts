import { assumptionRegistry, RuleTypeSchema, taxRegistry, wizardAnswersToAssumptions } from "@wealthos/registry";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const registryRouter = router({
  assumptions: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return assumptionRegistry(ctx.db).all(householdId);
  }),

  setAssumption: protectedProcedure
    .input(z.object({ key: z.string().min(1), value: z.union([z.number(), z.record(z.string(), z.number())]) }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      return assumptionRegistry(ctx.db).setOverride(householdId, input.key, input.value);
    }),

  /** M23b: plain-language wizard — writes ONLY values that differ from current (no gratuitous invalidation). */
  applyWizard: protectedProcedure
    .input(
      z.object({
        bufferMonths: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
        spendRigidity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        nagging: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        concentrationSensitivity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        israelDependence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        regretType: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        homeView: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        driftSpeed: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        feeImportance: z.union([z.literal(1), z.literal(2)]),
        largeLoanBase: z.number().min(0).max(100_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      const reg = assumptionRegistry(ctx.db);
      const current = new Map((await reg.all(householdId)).map((a) => [a.key, a.value]));
      const changed: string[] = [];
      for (const { key, value } of wizardAnswersToAssumptions(input)) {
        if (JSON.stringify(current.get(key)) === JSON.stringify(value)) continue;
        await reg.setOverride(householdId, key, value);
        changed.push(key);
      }
      return { changed };
    }),

  taxYears: protectedProcedure.query(({ ctx }) => taxRegistry(ctx.db).availableYears()),

  taxRules: protectedProcedure
    .input(z.object({ taxYear: z.number().int().min(2000).max(2100) }))
    .query(({ ctx, input }) => taxRegistry(ctx.db).forYear(input.taxYear).list()),

  taxRule: protectedProcedure
    .input(z.object({ taxYear: z.number().int(), ruleType: RuleTypeSchema }))
    .query(({ ctx, input }) => taxRegistry(ctx.db).forYear(input.taxYear).get(input.ruleType)),

  /** D5: owner sign-off — mark a tax matrix as reviewed (audited via the mutation middleware). */
  reviewTaxRule: protectedProcedure
    .input(z.object({ taxYear: z.number().int(), ruleType: RuleTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireHouseholdId(ctx.db);
      const reviewed = await taxRegistry(ctx.db).forYear(input.taxYear).review(input.ruleType);
      return { reviewed };
    }),
});
