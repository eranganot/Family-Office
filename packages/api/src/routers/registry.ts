import { assumptionRegistry, RuleTypeSchema, taxRegistry } from "@wealthos/registry";
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
