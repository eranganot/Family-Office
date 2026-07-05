import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assumptionRegistry } from "../src/assumption-registry";
import { seedRegistries } from "../src/seed";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);

d("assumption invalidation", () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "RecommendationAssumption","Recommendation","HouseholdSnapshot","TaxRuleSet","Assumption","Household" CASCADE',
    );
    await seedRegistries(db);
  });
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("changing an assumption invalidates recommendations pinned to its older versions — and only those", async () => {
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    const snapshot = await db.householdSnapshot.create({
      data: { householdId: h.id, kind: "PRE_STRATEGY", schemaVersion: 1, payload: {} },
    });
    const pinnedAssumption = await db.assumption.findFirstOrThrow({
      where: { householdId: null, key: "emergency_fund_months" },
    });
    const otherAssumption = await db.assumption.findFirstOrThrow({
      where: { householdId: null, key: "inflation_il_pct" },
    });

    const makeRec = (title: string, assumptionId: string) =>
      db.recommendation.create({
        data: {
          householdId: h.id,
          snapshotId: snapshot.id,
          engineVersion: "test",
          type: "INCREASE_LIQUIDITY",
          title,
          rationale: {},
          confidenceScore: 80,
          dataCompletenessScore: 90,
          priorityScore: "50",
          status: "PROPOSED",
          assumptionPins: { create: [{ assumptionId }] },
        },
      });
    const affected = await makeRec("pinned to emergency fund", pinnedAssumption.id);
    const untouched = await makeRec("pinned to inflation", otherAssumption.id);

    await assumptionRegistry(db).setOverride(h.id, "emergency_fund_months", 9);

    expect((await db.recommendation.findUniqueOrThrow({ where: { id: affected.id } })).status).toBe("INVALIDATED");
    expect((await db.recommendation.findUniqueOrThrow({ where: { id: untouched.id } })).status).toBe("PROPOSED");
  }, 60000);
});
