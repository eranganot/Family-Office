import { TRPCError } from "@trpc/server";
import {
  buildScenarioParams,
  CANNED_SCENARIOS,
  project,
  type CannedScenarioType,
  type ProjectionParams,
} from "@wealthos/engine-scenario";
import { SnapshotPayloadSchema } from "@wealthos/domain";
import { assumptionRegistry } from "@wealthos/registry";
import { z } from "zod";
import { buildSnapshot } from "../services/snapshot-service";
import { router, workflowGuard } from "../trpc";

const ScenarioTypeSchema = z.enum([
  "RETIRE_EARLIER", "RETIRE_LATER", "JOB_LOSS", "MARKET_CRASH",
  "HIGH_INFLATION", "MORTGAGE_REFINANCE", "SAVINGS_RATE_UP", "SAVINGS_RATE_DOWN",
]);

const OverridesSchema = z.object({
  years: z.number().int().min(1).max(60).default(20),
  extraMonthlySavings: z.number().min(-1_000_000).max(1_000_000).optional(),
  incomeStopsAtYear: z.number().int().min(1).max(60).nullable().optional(),
});

/** Scenario procedures live behind the STRATEGY gate like all Phase-3 modules. */
export const scenariosRouter = router({
  run: workflowGuard("STRATEGY")
    .input(z.object({ type: ScenarioTypeSchema, name: z.string().max(200).optional(), overrides: OverridesSchema.default({ years: 20 }) }))
    .mutation(async ({ ctx, input }) => {
      const { snapshotId, payload } = await buildSnapshot(ctx.db, ctx.householdId, "MANUAL");
      const realReturn = await assumptionRegistry(ctx.db).current("goal_projection_real_return_pct", ctx.householdId);

      const years = input.overrides.years;
      const baselineParams = buildScenarioParams(years, realReturn.value as number, {});
      const canned = CANNED_SCENARIOS[input.type as CannedScenarioType];
      const scenarioOverrides: Partial<ProjectionParams> = {
        ...canned,
        ...(input.overrides.extraMonthlySavings !== undefined ? { extraMonthlySavings: input.overrides.extraMonthlySavings } : {}),
        ...(input.overrides.incomeStopsAtYear !== undefined && input.overrides.incomeStopsAtYear !== null
          ? { incomeStopsAtYear: input.overrides.incomeStopsAtYear }
          : {}),
      };
      const scenarioParams = buildScenarioParams(years, realReturn.value as number, scenarioOverrides);

      const baseline = project(payload, baselineParams);
      const scenario = project(payload, scenarioParams);

      const row = await ctx.db.scenario.create({
        data: {
          householdId: ctx.householdId,
          name: input.name ?? input.type,
          type: input.type,
          parameterOverrides: scenarioOverrides as never,
          resultSnapshot: { baseline, scenario, realReturnPct: realReturn.value, years } as never,
          baselineSnapshotId: snapshotId,
        },
      });
      return { scenarioId: row.id, baseline, scenario };
    }),

  list: workflowGuard("STRATEGY").query(({ ctx }) =>
    ctx.db.scenario.findMany({
      where: { householdId: ctx.householdId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, name: true, type: true, createdAt: true, parameterOverrides: true },
    }),
  ),

  get: workflowGuard("STRATEGY").input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const s = await ctx.db.scenario.findUnique({ where: { id: input.id } });
    if (!s) throw new TRPCError({ code: "NOT_FOUND" });
    return s;
  }),
});

// keep zod schema import used for payload validation elsewhere
void SnapshotPayloadSchema;
