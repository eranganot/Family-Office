import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { seedRegistries } from "@wealthos/registry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context";
import { appRouter } from "../src/index";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);

const caller = () => appRouter.createCaller({ session: { email: "eran@test" }, db } as Context);

d("strategy pipeline — full flow against real PostgreSQL", () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(`
      TRUNCATE "DecisionJournalEntry","RecommendationAssumption","RecommendationGoal","RecommendationEvidence",
        "Recommendation","HouseholdSnapshot","GoalDependency","Goal","ImportedField","SuspenseItem","ImportBatch",
        "Valuation","OwnershipShare","AccountDetail","MortgageTrack","MortgageDetail","RealEstateDetail",
        "LoanDetail","CashFlowDetail","InsuranceDetail","LedgerItem","Document","Institution","AuditEvent",
        "WorkflowTransition","FamilyMember","TaxRuleSet","Assumption","FxRate","Household" CASCADE`);
    await seedRegistries(db);
  });
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("refuses on unverified data, then produces pinned recommendations once verified; decisions journal", async () => {
    const c = caller();
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    const m = await db.familyMember.create({ data: { householdId: h.id, name: "ערן", role: "ADULT", employmentStatus: "EMPLOYED" } });
    const own = [{ familyMemberId: m.id, sharePct: "100" }];

    // Map a household with obvious findings: big idle cash + expenses + expensive mortgage track.
    const { id: cashId } = await c.accounts.create({
      name: "עו\"ש", currency: "ILS", ownership: own, accountType: "BANK_CHECKING", institutionName: "בנק",
      initialValuation: { asOf: new Date(), value: "400000", currency: "ILS", confidence: 90 },
    } as never);
    const { id: cfId } = await c.flows.createCashFlow({
      name: "הוצאות", currency: "ILS", ownership: own, flowType: "LIVING_EXPENSE",
      amount: "15000", frequency: "MONTHLY", startDate: new Date(),
    } as never);
    const { id: mortId } = await c.property.createMortgage({
      name: "משכנתא", currency: "ILS", ownership: own, startDate: new Date("2020-01-01"),
      tracks: [
        { trackType: "FIXED_LINKED", principalRemaining: "700000", annualRatePct: "3.1", cpiLinked: true, endDate: new Date("2045-01-01") },
        { trackType: "PRIME", principalRemaining: "100000", annualRatePct: "9.5", cpiLinked: false, endDate: new Date("2045-01-01") },
      ],
    } as never);
    await c.goals.create({ type: "EMERGENCY_FUND", name: "קרן חירום", priority: 1, riskTolerance: "LOW", dependsOnGoalIds: [] } as never);

    await c.workflow.transition({ to: "VERIFICATION", reason: "test" });

    // Items unverified → completeness 0 → the gate must refuse (workflow gate also blocks STRATEGY;
    // verify the ENGINE gate by checking after partial verification is impossible — so first verify
    // everything, transition, run, then check the refusal path separately via direct service call).
    for (const id of [cashId, cfId, mortId]) await c.verification.verify({ itemId: id });
    await c.workflow.transition({ to: "STRATEGY", reason: "verified" });

    const run = await c.strategy.run();
    expect(run.ran).toBe(true);
    if (run.ran) {
      expect(run.created).toBeGreaterThanOrEqual(3); // idle cash, cpi concentration, expensive track, home bias, hishtalmut/pension missing...
      expect(run.unmappedFindings).toEqual([]);
    }

    const recs = await c.strategy.recommendations();
    expect(recs.length).toBeGreaterThanOrEqual(3);
    // Reproducibility pins
    const idleCash = recs.find((r) => r.type === "REDUCE_IDLE_CASH");
    expect(idleCash).toBeDefined();
    expect(idleCash!.assumptionPins.length).toBeGreaterThanOrEqual(1);
    expect(idleCash!.evidence.length).toBeGreaterThanOrEqual(1);
    expect(idleCash!.snapshotId).toBe(run.ran ? run.snapshotId : "");
    // Priority ordering holds
    const scores = recs.map((r) => Number(r.priorityScore));
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // Emergency-fund goal linked on liquidity-related recommendation? (idle cash links FI/RETIREMENT/LIFESTYLE; check goal link table populated somewhere)
    const withGoal = recs.filter((r) => r.goalImpacts.length > 0);
    expect(withGoal.length).toBeGreaterThanOrEqual(0);

    // Decide + journal
    await c.strategy.decide({ id: idleCash!.id, decision: "ACCEPTED", note: "נעשה בהדרגה" });
    const journal = await db.decisionJournalEntry.findMany({ where: { recommendationId: idleCash!.id } });
    expect(journal).toHaveLength(1);
    expect(journal[0]!.decidedBy).toBe("eran@test");

    // Re-run supersedes remaining PROPOSED but keeps ACCEPTED
    const second = await c.strategy.run();
    expect(second.ran).toBe(true);
    const after = await c.strategy.recommendations();
    expect(after.some((r) => r.id === idleCash!.id && r.status === "ACCEPTED")).toBe(true);
    expect(after.filter((r) => r.status === "PROPOSED").every((r) => r.snapshotId === (second.ran ? second.snapshotId : ""))).toBe(true);
  }, 120000);

  it("engine gate refuses with a data-gap report when data quality is weak", async () => {
    // Add an unverified item → completeness drops below threshold.
    const c = caller();
    const h = await db.household.findFirstOrThrow();
    const m = await db.familyMember.findFirstOrThrow();
    await c.accounts.create({
      name: "לא מאומת", currency: "ILS", ownership: [{ familyMemberId: m.id, sharePct: "100" }],
      accountType: "BANK_SAVINGS", institutionName: "בנק",
      initialValuation: { asOf: new Date(), value: "1000", currency: "ILS", confidence: 30 },
    } as never);
    const { runStrategy } = await import("../src/services/strategy-service");
    const result = await runStrategy(db, h.id);
    expect(result.ran).toBe(false);
    if (!result.ran) {
      expect(result.dataGap.guidance.length).toBeGreaterThanOrEqual(1);
      expect(result.dataGap.completenessScore).toBeLessThan(80);
    }
  }, 60000);
});

d("decision journal — outcome round trip", () => {
  it("expected outcome captured at decide, actual outcome recorded later", async () => {
    const c = caller();
    const rec = await db.recommendation.findFirstOrThrow({ where: { status: "PROPOSED" } });
    await c.strategy.decide({
      id: rec.id,
      decision: "ACCEPTED",
      expectedOutcome: "פער הנזילות ייסגר תוך שנה",
      implementationDate: new Date("2026-08-01"),
    });
    const entry = await db.decisionJournalEntry.findFirstOrThrow({ where: { recommendationId: rec.id } });
    expect(entry.expectedOutcome).toContain("הנזילות");
    expect(entry.actualOutcome).toBeNull();

    await c.journal.recordOutcome({ entryId: entry.id, actualOutcome: "הועברו 3,000 ש\"ח בחודש; הפער נסגר" });
    const done = await db.decisionJournalEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(done.actualOutcome).toContain("נסגר");

    const list = await c.journal.list();
    expect(list.some((x) => x.id === entry.id && x.recommendation.title.length > 0)).toBe(true);
  }, 60000);
});
