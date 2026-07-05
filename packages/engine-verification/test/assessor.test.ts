import { describe, expect, it } from "vitest";
import { assessHousehold, assessItem, type ItemProjection } from "../src/assessor";
import { buildMissingDocsReport } from "../src/missing-docs";

const NOW = new Date("2026-07-01T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const item = (over: Partial<ItemProjection>): ItemProjection => ({
  id: "i1",
  name: "חשבון",
  kind: "ACCOUNT",
  verification: "UNVERIFIED",
  confidence: 80,
  lastConfirmedAt: days(10),
  latestValuationAsOf: days(30),
  ...over,
});

describe("assessItem", () => {
  it("verified + fresh + confident + confirmed = no issues", () => {
    const a = assessItem(item({ verification: "VERIFIED" }), NOW);
    expect(a.verified).toBe(true);
    expect(a.issues).toEqual([]);
  });
  it("flags missing and stale valuations by kind threshold", () => {
    expect(assessItem(item({ latestValuationAsOf: null }), NOW).issues).toContainEqual({ type: "NO_VALUATION" });
    const stale = assessItem(item({ latestValuationAsOf: days(500) }), NOW);
    expect(stale.issues).toContainEqual({ type: "STALE_VALUATION", ageDays: 500, thresholdDays: 400 });
    // real estate has a longer leash
    expect(assessItem(item({ kind: "REAL_ESTATE", latestValuationAsOf: days(500) }), NOW).issues).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ type: "STALE_VALUATION" })]),
    );
  });
  it("flags never-confirmed, low confidence, rejected; verified status alone is not enough", () => {
    expect(assessItem(item({ lastConfirmedAt: null }), NOW).issues).toContainEqual({ type: "NEVER_CONFIRMED" });
    expect(assessItem(item({ confidence: 30 }), NOW).issues).toContainEqual({ type: "LOW_CONFIDENCE", confidence: 30 });
    expect(assessItem(item({ verification: "REJECTED" }), NOW).issues).toContainEqual({ type: "REJECTED" });
    const verifiedButStale = assessItem(item({ verification: "VERIFIED", latestValuationAsOf: days(999) }), NOW);
    expect(verifiedButStale.verified).toBe(false);
  });
});

describe("assessHousehold — the strategy gate", () => {
  it("opens only when every item is verified & clean and suspense is empty", () => {
    const clean = item({ verification: "VERIFIED" });
    const open = assessHousehold([clean], 0, NOW);
    expect(open.gate).toEqual({ canEnterStrategy: true, blockers: [] });
    expect(open.completenessScore).toBe(100);

    expect(assessHousehold([clean, item({ id: "i2" })], 0, NOW).gate.blockers).toContain("UNVERIFIED_ITEMS:1");
    expect(assessHousehold([clean], 2, NOW).gate.blockers).toContain("PENDING_SUSPENSE:2");
    expect(assessHousehold([], 0, NOW).gate.blockers).toContain("NO_ITEMS_MAPPED");
  });
  it("scores are honest averages", () => {
    const a = assessHousehold([item({ verification: "VERIFIED" }), item({ id: "b", confidence: 40 })], 0, NOW);
    expect(a.completenessScore).toBe(50);
    expect(a.confidenceScore).toBe(60);
  });
});

describe("missing-docs report", () => {
  const items = [
    { id: "p", name: "פנסיה", kind: "ACCOUNT", accountType: "PENSION_COMPREHENSIVE" },
    { id: "h", name: "השתלמות", kind: "ACCOUNT", accountType: "KEREN_HISHTALMUT" },
    { id: "m", name: "משכנתא", kind: "MORTGAGE" },
  ];
  it("derives expectations from ledger composition and classifies present/stale/missing", () => {
    const report = buildMissingDocsReport(
      items,
      [
        { docType: "PENSION_REPORT", uploadedAt: days(100) },
        { docType: "HISHTALMUT_STATEMENT", uploadedAt: days(600) },
      ],
      NOW,
    );
    expect(report.expectations).toHaveLength(3);
    expect(report.expectations.find((e) => e.itemId === "p")!.status).toBe("PRESENT");
    expect(report.expectations.find((e) => e.itemId === "h")!.status).toBe("STALE");
    expect(report.expectations.find((e) => e.itemId === "m")!.status).toBe("MISSING");
    expect(report.missingCount).toBe(1);
    expect(report.staleCount).toBe(1);
  });
});
