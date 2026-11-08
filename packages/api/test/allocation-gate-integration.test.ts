import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { seedRegistries } from "@wealthos/registry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context";
import { appRouter } from "../src/index";

/**
 * WO-4 (2026-11-05): the surplus ready-gate in runAllocation, end to end on a
 * real database. allocation-service.ts:47-66 hands the engine the last closed
 * month's surplus ONLY when allocationHandoffReadiness says READY; a provisional
 * surplus still carries a number, so a leak here would put unverified money
 * into the deployment plan. Until now only the engine side was tested.
 */
const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);
const caller = () => appRouter.createCaller({ session: { email: "eran@test" }, db } as Context);

d("allocation surplus gate - real PostgreSQL", () => {
  let householdId = "";

  beforeAll(async () => {
    await db.$executeRawUnsafe(`TRUNCATE "Household" CASCADE`);
    await seedRegistries(db);
    const c = caller();
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    householdId = h.id;
    const m = await db.familyMember.create({ data: { householdId: h.id, name: "ערן", role: "ADULT", employmentStatus: "EMPLOYED" } });
    const own = [{ familyMemberId: m.id, sharePct: "100" }];
    // 400k cash against 15k/month expenses: the 6-month buffer (90k) is full, so
    // a surplus, if admitted, is deployable and shows up in the plan.
    const { id: cashId } = await c.accounts.create({
      name: "עו\"ש", currency: "ILS", ownership: own, accountType: "BANK_CHECKING", institutionName: "בנק",
      initialValuation: { asOf: new Date(), value: "400000", currency: "ILS", confidence: 90 },
    } as never);
    const { id: cfId } = await c.flows.createCashFlow({
      name: "הוצאות", currency: "ILS", ownership: own, flowType: "LIVING_EXPENSE",
      amount: "15000", frequency: "MONTHLY", startDate: new Date(),
    } as never);
    await c.workflow.transition({ to: "VERIFICATION", reason: "test" });
    for (const id of [cashId, cfId]) await c.verification.verify({ itemId: id });
    await c.workflow.transition({ to: "ALLOCATION", reason: "test" });
  });
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  async function closedMonth(surplus: string, provisional: boolean) {
    await db.operatingPeriod.deleteMany({ where: { householdId } });
    await db.operatingPeriod.create({
      data: { householdId, year: 2026, month: 10, status: "CLOSED", surplusBase: surplus,
              surplusIsProvisional: provisional, closedAt: new Date() },
    });
  }

  it("a PROVISIONAL surplus is refused: not in the plan, and the refusal is on the plan", async () => {
    await closedMonth("10000", true);
    const { plan } = await caller().allocation.generate();
    expect(plan.surplusHandoff).toMatchObject({ ready: false, reason: "SURPLUS_PROVISIONAL", verifiedSurplusBase: 10000 });
    expect(plan.surplusBase).toBe(0);
    expect(plan.notes ?? []).not.toContain("SURPLUS_INCLUDED");
  });

  it("a verified (READY) surplus is added to the deployable amount", async () => {
    await closedMonth("10000", false);
    const { plan } = await caller().allocation.generate();
    expect(plan.surplusHandoff).toMatchObject({ ready: true, reason: "READY", verifiedSurplusBase: 10000 });
    expect(plan.surplusBase).toBe(10000);
    expect(plan.notes).toContain("SURPLUS_INCLUDED");
    expect(plan.freeCashBase).toBe(plan.idleCashBase + 10000);
  });

  it("no closed month: nothing offered, and it says why", async () => {
    await db.operatingPeriod.deleteMany({ where: { householdId } });
    const { plan } = await caller().allocation.generate();
    expect(plan.surplusHandoff).toMatchObject({ ready: false, reason: "NO_CLOSED_PERIOD" });
    expect(plan.surplusBase).toBe(0);
  });
});
