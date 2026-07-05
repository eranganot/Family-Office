import { TRPCError } from "@trpc/server";
import { ledgerRepo } from "@wealthos/db";
import { computeFundingGaps, type AssetInput, type GoalInput } from "@wealthos/engine-goals";
import { assumptionRegistry } from "@wealthos/registry";
import { validateGoalDependencies } from "@wealthos/domain";
import { z } from "zod";
import { DecimalString } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const GoalTypeSchema = z.enum([
  "EMERGENCY_FUND", "RETIREMENT", "CHILDREN_EDUCATION", "PROPERTY_PURCHASE", "INVESTMENT_PROPERTY",
  "FINANCIAL_INDEPENDENCE", "LIFESTYLE", "LEGACY", "INHERITANCE", "PHILANTHROPY", "OTHER",
]);

const GoalInputSchema = z.object({
  type: GoalTypeSchema,
  name: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(99),
  targetDate: z.coerce.date().optional(),
  requiredFunding: DecimalString.optional(),
  riskTolerance: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dependsOnGoalIds: z.array(z.uuid()).default([]),
});

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

  /** Funding-gap report: verified assets only, ILS-converted, assumption-driven return. */
  fundingGap: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const goals = await ctx.db.goal.findMany({ where: { householdId, status: "ACTIVE" } });
    const items = await ledgerRepo.list(ctx.db, householdId);

    // Latest manual FX per pair for ILS conversion (same policy as net worth: no rate → excluded).
    const allRates = await ctx.db.fxRate.findMany({ orderBy: { asOf: "desc" } });
    const seen = new Set<string>();
    const rate = new Map<string, number>();
    for (const r of allRates) {
      const key = `${r.from}->${r.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rate.set(key, Number(r.rate));
    }
    const toILS = (value: string, currency: string): string | null => {
      if (currency === "ILS") return value;
      const direct = rate.get(`${currency}->ILS`);
      if (direct) return String(Number(value) * direct);
      const inverse = rate.get(`ILS->${currency}`);
      if (inverse) return String(Number(value) / inverse);
      return null;
    };

    const assets: AssetInput[] = items.map((i) => ({
      id: i.id,
      kind: i.kind,
      accountType: i.accountDetail?.accountType,
      valueILS: i.latestValuation ? toILS(i.latestValuation.value.toString(), i.latestValuation.currency) : null,
      verified: i.verification === "VERIFIED",
    }));

    const goalInputs: GoalInput[] = goals.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      priority: g.priority,
      targetDate: g.targetDate,
      requiredFundingILS: g.requiredFunding ? g.requiredFunding.toString() : null,
    }));

    const realReturn = await assumptionRegistry(ctx.db).current("goal_projection_real_return_pct", householdId);
    return computeFundingGaps(goalInputs, assets, realReturn.value as number, new Date());
  }),

  setStatus: protectedProcedure
    .input(z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "ACHIEVED", "ABANDONED"]) }))
    .mutation(({ ctx, input }) => ctx.db.goal.update({ where: { id: input.id }, data: { status: input.status } })),
});
