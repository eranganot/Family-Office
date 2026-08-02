import { TRPCError } from "@trpc/server";
import { validateGoalDependencies } from "@wealthos/domain";
import { z } from "zod";
import { DecimalString } from "../schemas/ledger";
import { householdFundingGaps } from "../services/goals-service";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const GoalTypeSchema = z.enum([
  "EMERGENCY_FUND", "RETIREMENT", "CHILDREN_EDUCATION", "PROPERTY_PURCHASE", "INVESTMENT_PROPERTY",
  "FINANCIAL_INDEPENDENCE", "LIFESTYLE", "LEGACY", "INHERITANCE", "PHILANTHROPY", "OTHER",
]);

const INCOME_MODE_TYPES = new Set(["FINANCIAL_INDEPENDENCE", "RETIREMENT"]);

const GoalInputSchema = z.object({
  type: GoalTypeSchema,
  name: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(99),
  targetDate: z.coerce.date().optional(),
  requiredFunding: DecimalString.optional(),
  /** Income mode: desired monthly income (FI/RETIREMENT only); capital target derived at read time. */
  targetMonthlyIncome: DecimalString.optional(),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dependsOnGoalIds: z.array(z.uuid()).default([]),
});

/**
 * requiredFunding derived from monthly income at the CURRENT real-return assumption
 * (perpetuity). Kept HERE, throwing, for interactive edits: a household setting a goal
 * against a non-positive real return should be stopped and told, not quietly given a
 * meaningless capital target.
 *
 * `goals-service.derivedRequiredFundingILS` is the same formula returning null instead.
 * That difference is deliberate: a background health-score reading must degrade one goal
 * to "not computable" rather than fail the whole score over one assumption.
 */
export function derivedRequiredFunding(targetMonthlyIncome: string, realReturnPct: number): string {
  const rate = realReturnPct / 100;
  if (rate <= 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "REAL_RETURN_NOT_POSITIVE" });
  return String((Number(targetMonthlyIncome) * 12) / rate);
}

async function assertAcyclic(
  db: Parameters<typeof requireHouseholdId>[0],
  householdId: string,
  goalId: string,
  dependsOnGoalIds: string[],
): Promise<void> {
  const existing = await db.goalDependency.findMany({
    where: { goal: { householdId }, NOT: { goalId } },
    select: { goalId: true, dependsOnGoalId: true },
  });
  const edges = [...existing, ...dependsOnGoalIds.map((dependsOnGoalId) => ({ goalId, dependsOnGoalId }))];
  const validation = validateGoalDependencies(edges);
  if (!validation.valid) throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });
}

export const goalsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return ctx.db.goal.findMany({
      where: { householdId, status: "ACTIVE" },
      include: { dependsOn: { include: { dependsOnGoal: { select: { id: true, name: true } } } } },
      orderBy: { priority: "asc" },
    });
  }),

  create: protectedProcedure.input(GoalInputSchema).mutation(async ({ ctx, input }) => {
    const householdId = await requireHouseholdId(ctx.db);
    if (input.targetMonthlyIncome && !INCOME_MODE_TYPES.has(input.type)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "INCOME_MODE_ONLY_FOR_FI_RETIREMENT" });
    }
    const household = await ctx.db.household.findFirstOrThrow({ select: { baseCurrency: true } });
    return ctx.db.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          householdId,
          type: input.type,
          name: input.name,
          priority: input.priority,
          targetDate: input.targetDate ?? null,
          requiredFunding: input.requiredFunding ?? null,
          targetMonthlyIncome: input.targetMonthlyIncome ?? null,
          currency: household.baseCurrency,
          riskTolerance: input.riskTolerance,
        },
      });
      if (input.dependsOnGoalIds.length > 0) {
        await assertAcyclic(tx as never, householdId, goal.id, input.dependsOnGoalIds);
        await tx.goalDependency.createMany({
          data: input.dependsOnGoalIds.map((dependsOnGoalId) => ({ goalId: goal.id, dependsOnGoalId })),
        });
      }
      return goal;
    });
  }),

  update: protectedProcedure
    .input(GoalInputSchema.partial().extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input: { id, dependsOnGoalIds, ...patch } }) => {
      const householdId = await requireHouseholdId(ctx.db);
      if (patch.targetMonthlyIncome) {
        const existing = await ctx.db.goal.findUniqueOrThrow({ where: { id }, select: { type: true } });
        const effectiveType = patch.type ?? existing.type;
        if (!INCOME_MODE_TYPES.has(effectiveType)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "INCOME_MODE_ONLY_FOR_FI_RETIREMENT" });
        }
      }
      return ctx.db.$transaction(async (tx) => {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) if (v !== undefined) data[k] = v;
        const goal = await tx.goal.update({ where: { id }, data: data as never });
        if (dependsOnGoalIds !== undefined) {
          await assertAcyclic(tx as never, householdId, id, dependsOnGoalIds);
          await tx.goalDependency.deleteMany({ where: { goalId: id } });
          if (dependsOnGoalIds.length > 0) {
            await tx.goalDependency.createMany({
              data: dependsOnGoalIds.map((dependsOnGoalId) => ({ goalId: id, dependsOnGoalId })),
            });
          }
        }
        return goal;
      });
    }),

  /**
   * Funding-gap report: verified assets only, ILS-converted, assumption-driven return.
   *
   * The body moved to `services/goals-service.householdFundingGaps` in M43 so the health
   * score could consume the same computation instead of re-deriving it. This is a
   * pass-through on purpose: two callers producing two funding figures that disagree is
   * worse than either one being slightly wrong.
   */
  fundingGap: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return householdFundingGaps(ctx.db, householdId);
  }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "ACHIEVED", "ABANDONED"]) }))
    .mutation(({ ctx, input }) => ctx.db.goal.update({ where: { id: input.id }, data: { status: input.status } })),

  /** B7: pin (or unpin) an account/asset to a goal. */
  earmarkAccount: protectedProcedure
    .input(z.object({ itemId: z.uuid(), goalId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      const item = await ctx.db.ledgerItem.findFirst({ where: { id: input.itemId, householdId } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.goalId) {
        const goal = await ctx.db.goal.findFirst({ where: { id: input.goalId, householdId } });
        if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "GOAL_NOT_FOUND" });
      }
      return ctx.db.ledgerItem.update({ where: { id: input.itemId }, data: { earmarkedGoalId: input.goalId } });
    }),
});
