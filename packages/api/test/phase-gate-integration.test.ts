import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@wealthos/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "../src/index";
import type { Context } from "../src/context";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);

const caller = () => appRouter.createCaller({ session: { email: "t@t.t" }, db } as Context);

async function wipe(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE "ImportedField","SuspenseItem","ImportBatch","Valuation","OwnershipShare",
      "AccountDetail","LedgerItem","Document","Institution","AuditEvent","WorkflowTransition",
      "FamilyMember","Household" CASCADE
  `);
}

d("phase gate — full flow against real PostgreSQL", () => {
  beforeEach(wipe);
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("blocks VERIFICATION→STRATEGY until every item is verified and suspense is empty; audits transitions", async () => {
    const c = caller();
    const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
    const m = await db.familyMember.create({ data: { householdId: h.id, name: "ערן", role: "ADULT" } });

    // MAPPING → VERIFICATION is unconditional
    await c.workflow.transition({ to: "VERIFICATION", reason: "test" });

    // Unverified item blocks the gate
    const { id: itemId } = await c.ledger.createOther({
      kind: "OTHER_ASSET", name: "נכס", currency: "ILS",
      ownership: [{ familyMemberId: m.id, sharePct: "100" }],
      initialValuation: { asOf: new Date(), value: "100", currency: "ILS", confidence: 60 },
    });
    await expect(c.workflow.transition({ to: "STRATEGY", reason: "try" })).rejects.toMatchObject({
      message: "VERIFICATION_INCOMPLETE",
    });

    // Verify it; add a pending suspense row → still blocked
    await c.verification.verify({ itemId });
    const doc = await db.document.create({
      data: { householdId: h.id, sha256: "x1", filename: "f.csv", mimeType: "text/csv", storageKey: "/tmp/x" },
    });
    const batch = await db.importBatch.create({
      data: { documentId: doc.id, adapterId: "t", adapterVersion: "1", status: "COMPLETED", rawPayload: {} },
    });
    const suspense = await db.suspenseItem.create({ data: { batchId: batch.id, rawData: {}, reason: "X" } });
    await expect(c.workflow.transition({ to: "STRATEGY", reason: "try" })).rejects.toMatchObject({
      message: "SUSPENSE_NOT_EMPTY",
    });

    // Resolve suspense → gate opens
    await c.suspense.discard({ id: suspense.id, note: "junk" });
    const updated = await c.workflow.transition({ to: "STRATEGY", reason: "verified all" });
    expect(updated.workflowState).toBe("STRATEGY");

    const transitions = await db.workflowTransition.findMany({ orderBy: { at: "asc" } });
    expect(transitions.map((t) => `${t.fromState}->${t.toState}`)).toEqual([
      "MAPPING->VERIFICATION",
      "VERIFICATION->STRATEGY",
    ]);

    // Verify/reject round trip is reflected in the assessment
    const assessment = await c.verification.assessment();
    expect(assessment.assessment.completenessScore).toBe(100);
  }, 60000);
});
