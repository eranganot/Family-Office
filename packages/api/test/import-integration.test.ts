import { PrismaPg } from "@prisma/adapter-pg";
import { DiskFileStore, PrismaClient, sha256Of } from "@wealthos/db";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runImport } from "../src/services/import-service";

const TEST_URL = process.env["TEST_DATABASE_URL"];
const d = describe.skipIf(!TEST_URL);
const db = TEST_URL
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) })
  : (undefined as never);

process.env["DOCUMENT_STORE_PATH"] = join(tmpdir(), `wealthos-test-docs-${Date.now()}`);

const fixture = (name: string) =>
  readFileSync(join(__dirname, "..", "..", "ingestion", "fixtures", name));

async function wipe(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE "ImportedField","SuspenseItem","ImportBatch","Valuation","OwnershipShare",
      "AccountDetail","LedgerItem","Document","Institution","AuditEvent","FamilyMember",
      "Household" CASCADE
  `);
}

async function setup() {
  const h = await db.household.create({ data: { name: "בית", baseCurrency: "ILS" } });
  const m = await db.familyMember.create({ data: { householdId: h.id, name: "ערן", role: "ADULT" } });
  return { h, m };
}

async function uploadFixture(householdId: string, name: string, mime: string, docType: string) {
  const bytes = fixture(name);
  const sha = sha256Of(bytes);
  const storageKey = await new DiskFileStore().put(sha, bytes);
  return db.document.create({
    data: { householdId, sha256: sha, filename: name, mimeType: mime, docType, storageKey },
  });
}

d("import pipeline against real PostgreSQL", () => {
  beforeEach(wipe);
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("CSV fixture → items, valuations, provenance; re-import appends instead of duplicating", async () => {
    const { h, m } = await setup();
    const ownership = [{ familyMemberId: m.id, sharePct: "100" }];
    const doc = await uploadFixture(h.id, "hishtalmut-statement.csv", "text/csv", "HISHTALMUT_STATEMENT");

    const report = await runImport(db, h.id, { documentId: doc.id, defaultOwnership: ownership });
    expect(report.created).toHaveLength(2);
    expect(report.suspense).toHaveLength(0);
    expect(report.provenanceFields).toBeGreaterThanOrEqual(10);

    const items = await db.ledgerItem.findMany({ include: { accountDetail: true } });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.kind === "ACCOUNT")).toBe(true);

    // Re-import the same document: matched by externalRef+institution → no new items, valuations appended.
    const second = await runImport(db, h.id, { documentId: doc.id, defaultOwnership: ownership });
    expect(second.created).toHaveLength(0);
    expect(second.updated).toHaveLength(2);
    expect(await db.ledgerItem.count()).toBe(2);
    expect(await db.valuation.count()).toBe(4);
  });

  it("Mislaka-style fixture routes the unsupported product to suspense with raw preserved", async () => {
    const { h, m } = await setup();
    const doc = await uploadFixture(h.id, "mislaka-style-export.csv", "text/csv", "MISLAKA");
    const report = await runImport(db, h.id, {
      documentId: doc.id,
      defaultOwnership: [{ familyMemberId: m.id, sharePct: "100" }],
    });
    expect(report.created).toHaveLength(2);
    expect(report.suspense).toEqual([{ reason: "UNKNOWN_ACCOUNT_TYPE" }]);
    const s = await db.suspenseItem.findFirstOrThrow();
    expect(s.status).toBe("PENDING");
    expect(JSON.stringify(s.rawData)).toContain("ביטוח מנהלים");
    const batch = await db.importBatch.findFirstOrThrow();
    expect(batch.status).toBe("COMPLETED");
  });

  it("pension PDF fixture imports end-to-end into a canonical pension account", async () => {
    const { h, m } = await setup();
    const doc = await uploadFixture(h.id, "pension-annual-report.pdf", "application/pdf", "PENSION_REPORT");
    const report = await runImport(db, h.id, {
      documentId: doc.id,
      defaultOwnership: [{ familyMemberId: m.id, sharePct: "100" }],
    });
    expect(report.created).toHaveLength(1);
    const item = await db.ledgerItem.findFirstOrThrow({ include: { accountDetail: true, valuations: true } });
    expect(item.accountDetail!.accountType).toBe("PENSION_COMPREHENSIVE");
    expect(item.valuations[0]!.value.toString()).toBe("415230.5");
    expect(item.accountDetail!.accountNumberMasked).toBe("987654");
  }, 30000);
});
