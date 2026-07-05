import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { householdRepo } from "../src/repositories/household";
import { ledgerRepo } from "../src/repositories/ledger";
import { testClient, TEST_URL, wipe } from "./helpers";

const d = describe.skipIf(!TEST_URL);

const db = TEST_URL ? testClient() : (undefined as never);

d("repositories against real PostgreSQL", () => {
  beforeEach(() => wipe(db));
  afterAll(async () => { if (TEST_URL) await db.$disconnect(); });

  it("household bootstrap enforces the single-household invariant", async () => {
    const h = await householdRepo.bootstrap(db, { name: "בית", baseCurrency: "ILS", locale: "he", timezone: "Asia/Jerusalem" });
    expect(h.id).toBeTruthy();
    await expect(
      householdRepo.bootstrap(db, { name: "שני", baseCurrency: "ILS", locale: "he", timezone: "Asia/Jerusalem" }),
    ).rejects.toThrow("HOUSEHOLD_ALREADY_EXISTS");
  });

  it("ledger item creation is atomic with ownership; valuations append immutably", async () => {
    const h = await householdRepo.bootstrap(db, { name: "בית", baseCurrency: "ILS", locale: "he", timezone: "Asia/Jerusalem" });
    const m = await householdRepo.addMember(db, h.id, { name: "ערן", role: "ADULT", taxResidency: "IL" });

    const itemId = await ledgerRepo.createItem(
      db, h.id,
      { kind: "OTHER_ASSET", name: "אוסף", currency: "ILS", ownership: [{ familyMemberId: m.id, sharePct: "100" }] },
      { asOf: new Date("2026-01-01"), value: "1000.0000", currency: "ILS", source: "MANUAL_ENTRY", confidence: 70 },
    );
    await ledgerRepo.addValuation(db, itemId, {
      asOf: new Date("2026-06-01"), value: "1200.0000", currency: "ILS", source: "MANUAL_ENTRY", confidence: 80,
    });

    const history = await ledgerRepo.valuationHistory(db, itemId);
    expect(history).toHaveLength(2);
    expect(history[0]!.value.toString()).toBe("1200");
    const full = await ledgerRepo.get(db, itemId);
    expect(full!.ownershipShares[0]!.sharePct.toString()).toBe("100");
    expect(full!.latestValuation!.value.toString()).toBe("1200");
  });
});
