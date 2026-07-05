import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assumptionRegistry } from "../src/assumption-registry";
import { seedRegistries } from "../src/seed";
import { taxRegistry } from "../src/tax-registry";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);

d("registries against real PostgreSQL", () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe('TRUNCATE "TaxRuleSet","Assumption","Household" CASCADE');
    const first = await seedRegistries(db);
    expect(first.taxSeeded).toBe(12); // 6 rule types × 2 years
    const second = await seedRegistries(db);
    expect(second.taxSeeded).toBe(0); // idempotent
    expect(second.assumptionsSeeded).toBe(0);
  });
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("tax registry returns year-correct, schema-validated matrices; 2026 reform visible", async () => {
    const y26 = await taxRegistry(db).forYear(2026).get("INCOME_TAX_BRACKETS");
    const y25 = await taxRegistry(db).forYear(2025).get("INCOME_TAX_BRACKETS");
    expect(y26.payload.brackets[2]!.upToAnnualILS).toBe(228_000); // widened 20% bracket
    expect(y25.payload.brackets[2]!.upToAnnualILS).toBe(193_800); // pre-reform
    expect(y26.payload.creditPointAnnualILS).toBe(2_904);
    expect(y26.source).toContain("msl.org.il");
    await expect(taxRegistry(db).forYear(1999).get("INCOME_TAX_BRACKETS")).rejects.toThrow("TAX_RULES_MISSING");
    expect(await taxRegistry(db).availableYears()).toEqual([2026, 2025]);
  });

  it("hishtalmut + purchase-tax matrices carry sources and review status", async () => {
    const h = await taxRegistry(db).forYear(2026).get("HISHTALMUT_CEILINGS");
    expect(h.payload.selfEmployedExemptDepositAnnualILS).toBe(20_566);
    expect(h.payload.meta.ownerReviewed).toBe(false); // pending Eran's sign-off
    const p = await taxRegistry(db).forYear(2026).get("PURCHASE_TAX");
    expect(p.payload.singleHome[0]).toEqual({ upToAnnualILS: 1_978_745, ratePct: 0 });
  });

  it("assumptions: default → override creates new version and wins; default remains", async () => {
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    const reg = assumptionRegistry(db);

    const before = await reg.current("emergency_fund_months", h.id);
    expect(before).toMatchObject({ value: 6, isOverride: false, version: 1 });

    await reg.setOverride(h.id, "emergency_fund_months", 9);
    const after = await reg.current("emergency_fund_months", h.id);
    expect(after).toMatchObject({ value: 9, isOverride: true, version: 1 });

    await reg.setOverride(h.id, "emergency_fund_months", 12);
    const v2 = await reg.current("emergency_fund_months", h.id);
    expect(v2).toMatchObject({ value: 12, version: 2 });

    const noHousehold = await reg.current("emergency_fund_months");
    expect(noHousehold).toMatchObject({ value: 6, isOverride: false });

    const all = await reg.all(h.id);
    expect(all.find((a) => a.key === "emergency_fund_months")!.value).toBe(12);
    expect(all.find((a) => a.key === "priority_weights")!.isOverride).toBe(false);
  });
});
