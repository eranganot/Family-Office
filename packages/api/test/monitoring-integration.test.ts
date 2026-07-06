import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { seedRegistries } from "@wealthos/registry";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Context } from "../src/context";
import { appRouter } from "../src/index";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) }) : (undefined as never);

const caller = () => appRouter.createCaller({ session: { email: "eran@test" }, db } as Context);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

d("M9 monitoring loop — cycle, drift, staleness, re-evaluation (real PostgreSQL)", () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(`
      TRUNCATE "MonitoringAlert","MonitoringRun","DecisionJournalEntry","RecommendationAssumption",
        "RecommendationGoal","RecommendationEvidence","Recommendation","HouseholdSnapshot","GoalDependency",
        "Goal","ImportedField","SuspenseItem","ImportBatch","Valuation","OwnershipShare","AccountDetail",
        "MortgageTrack","MortgageDetail","RealEstateDetail","LoanDetail","CashFlowDetail","InsuranceDetail",
        "LedgerItem","Document","Institution","AuditEvent","WorkflowTransition","FamilyMember","TaxRuleSet",
        "Assumption","FxRate","Household" CASCADE`);
    await seedRegistries(db);
  });
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  let cashId = "";

  it("reaches MONITORING with a strategy baseline, then a clean cycle finds no drift", async () => {
    const c = caller();
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    const m = await db.familyMember.create({ data: { householdId: h.id, name: "ערן", role: "ADULT", employmentStatus: "EMPLOYED" } });
    const own = [{ familyMemberId: m.id, sharePct: "100" }];

    const cash = await c.accounts.create({
      name: "עו\"ש", currency: "ILS", ownership: own, accountType: "BANK_CHECKING", institutionName: "בנק",
      initialValuation: { asOf: new Date(), value: "500000", currency: "ILS", confidence: 90 },
    } as never);
    cashId = (cash as { id: string }).id;
    await c.flows.createCashFlow({
      name: "הוצאות", currency: "ILS", ownership: own, flowType: "LIVING_EXPENSE",
      amount: "15000", frequency: "MONTHLY", startDate: new Date(),
    } as never);
    await c.goals.create({ type: "EMERGENCY_FUND", name: "קרן חירום", priority: 1, riskTolerance: "LOW", dependsOnGoalIds: [] } as never);

    await c.workflow.transition({ to: "VERIFICATION", reason: "map done" });
    const items = await db.ledgerItem.findMany({ where: { householdId: h.id } });
    for (const it of items) await c.verification.verify({ itemId: it.id });
    await c.workflow.transition({ to: "STRATEGY", reason: "verified" });

    const run = await c.strategy.run();
    expect(run.ran).toBe(true); // establishes the PRE_STRATEGY baseline
    await c.workflow.transition({ to: "MONITORING", reason: "enter monitoring" });

    const cycle = await c.monitoring.runNow();
    expect(cycle.severity).toBe("NONE");
    expect(cycle.driftFindings).toBe(0);
    expect(cycle.itemsFlaggedStale).toBe(0);

    const runs = await c.monitoring.runs();
    expect(runs[0]!.trigger).toBe("MANUAL");
  }, 120000);

  it("detects a net-worth drift after balances move and opens a RERUN_STRATEGY alert", async () => {
    const c = caller();
    // A large new valuation (latest by asOf) moves net worth far beyond the 10% threshold.
    await db.valuation.create({
      data: { ledgerItemId: cashId, asOf: new Date(), value: "50000", currency: "ILS", source: "MANUAL_ENTRY", confidence: 90 },
    });
    const cycle = await c.monitoring.runNow();
    expect(cycle.driftFindings).toBeGreaterThanOrEqual(1);
    const alerts = await c.monitoring.alerts();
    const nw = alerts.find((a) => a.kind === "NET_WORTH_DRIFT");
    expect(nw).toBeDefined();
    expect(nw!.recommendedAction).toBe("RERUN_STRATEGY");
    expect(["MEDIUM", "HIGH"]).toContain(nw!.severity);
  }, 120000);

  it("sweeps stale valuations, flips VERIFIED items to STALE, and opens a REVERIFY alert", async () => {
    const c = caller();
    // Age every valuation well past the ACCOUNT staleness threshold (400d).
    await db.$executeRawUnsafe(`UPDATE "Valuation" SET "asOf" = $1`, daysAgo(500));
    const cycle = await c.monitoring.runNow();
    expect(cycle.itemsFlaggedStale).toBeGreaterThanOrEqual(1);

    const cashItem = await db.ledgerItem.findUniqueOrThrow({ where: { id: cashId } });
    expect(cashItem.verification).toBe("STALE");

    const alerts = await c.monitoring.alerts();
    expect(alerts.some((a) => a.kind === "STALENESS" && a.recommendedAction === "REVERIFY")).toBe(true);
  }, 120000);

  it("re-evaluation routes MONITORING → VERIFICATION and resolves open alerts", async () => {
    const c = caller();
    const before = await c.monitoring.alerts();
    expect(before.length).toBeGreaterThan(0);

    const result = await c.monitoring.reevaluate({ target: "VERIFICATION", reason: "stale data" });
    expect(result.to).toBe("VERIFICATION");
    expect(result.alertsResolved).toBeGreaterThan(0);

    const household = await db.household.findFirstOrThrow();
    expect(household.workflowState).toBe("VERIFICATION");

    const open = await c.monitoring.alerts();
    expect(open).toHaveLength(0); // all resolved

    const transition = await db.workflowTransition.findFirst({ where: { toState: "VERIFICATION" }, orderBy: { at: "desc" } });
    expect(transition!.reason).toContain("re-evaluation");
  }, 120000);
});
