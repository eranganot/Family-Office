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
  /**
   * M43: PENSION_REPORT and HISHTALMUT_STATEMENT are ITEM-scoped, so they now need a
   * link to count as present. Before attribution existed this test passed with no links
   * at all — which is precisely the bug, in miniature: a document floating free of any
   * account was evidence for every account of that shape.
   */
  it("derives expectations from ledger composition and classifies present/stale/missing", () => {
    const report = buildMissingDocsReport(
      items,
      [
        { docType: "PENSION_REPORT", uploadedAt: days(100), linkedItemIds: ["p"] },
        { docType: "HISHTALMUT_STATEMENT", uploadedAt: days(600), linkedItemIds: ["h"] },
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

  /**
   * The defect this pins: a Mislaka clearinghouse pull is ONE document covering every
   * pension, gemel and hishtalmut product a person holds. It is a selectable docType,
   * and no rule accepted it — so the owner uploaded the document that answers the
   * question and watched every retirement row stay red.
   */
  it("a MISLAKA satisfies pension and hishtalmut expectations — it covers both", () => {
    const report = buildMissingDocsReport(items, [{ docType: "MISLAKA", uploadedAt: days(30) }], NOW);
    expect(report.expectations.find((e) => e.itemId === "p")!.status).toBe("PRESENT");
    expect(report.expectations.find((e) => e.itemId === "h")!.status).toBe("PRESENT");
    // ...but it says nothing about a mortgage, and must not pretend otherwise.
    expect(report.expectations.find((e) => e.itemId === "m")!.status).toBe("MISSING");
    expect(report.missingCount).toBe(1);
  });

  it("reports WHICH document type satisfied the row, so a Mislaka green is explicable", () => {
    const report = buildMissingDocsReport(items, [{ docType: "MISLAKA", uploadedAt: days(30) }], NOW);
    const pension = report.expectations.find((e) => e.itemId === "p")!;
    expect(pension.expectedDocType).toBe("PENSION_REPORT");
    expect(pension.satisfiedByDocType).toBe("MISLAKA");
  });

  it("an untyped (null docType) document satisfies NOTHING — it is not evidence of anything", () => {
    const report = buildMissingDocsReport(items, [{ docType: null, uploadedAt: days(1) }], NOW);
    expect(report.missingCount).toBe(3);
  });

  it("a MISLAKA ages out on the same clock as the report it stands in for", () => {
    const report = buildMissingDocsReport(items, [{ docType: "MISLAKA", uploadedAt: days(600) }], NOW);
    expect(report.expectations.find((e) => e.itemId === "p")!.status).toBe("STALE");
  });
});

/**
 * M43 — per-item attribution.
 *
 * The report matched by TYPE across the whole household, so ONE bank statement marked
 * EVERY bank account present. The naive fix — demanding a per-item link — would have
 * flipped those rows to MISSING and claimed a document the household demonstrably holds
 * does not exist. Both are false, in opposite directions, which is why UNATTRIBUTED
 * exists: the evidence is real, and nothing connects it to this account.
 */
describe("missing-docs attribution", () => {
  const banks = [
    { id: "b1", name: "בנק א", kind: "ACCOUNT", accountType: "BANK_CHECKING" },
    { id: "b2", name: "בנק ב", kind: "ACCOUNT", accountType: "BANK_CHECKING" },
  ];

  it("THE BUG: one statement no longer marks a DIFFERENT bank account present", () => {
    const report = buildMissingDocsReport(
      banks,
      [{ docType: "BANK_STATEMENT", uploadedAt: days(10), linkedItemIds: ["b1"] }],
      NOW,
    );
    expect(report.expectations.find((e) => e.itemId === "b1")!.status).toBe("PRESENT");
    expect(report.expectations.find((e) => e.itemId === "b2")!.status).toBe("UNATTRIBUTED");
  });

  it("an unlinked document is NOT reported as missing — the household holds it", () => {
    const report = buildMissingDocsReport(
      banks,
      [{ docType: "BANK_STATEMENT", uploadedAt: days(10), linkedItemIds: ["b1"] }],
      NOW,
    );
    expect(report.missingCount).toBe(0);
    expect(report.unattributedCount).toBe(1);
    // ...and it still names what exists, so the row is actionable rather than mysterious.
    expect(report.expectations.find((e) => e.itemId === "b2")!.satisfiedByDocType).toBe("BANK_STATEMENT");
  });

  it("no document of the type at all is still MISSING, not merely unlinked", () => {
    const report = buildMissingDocsReport(banks, [], NOW);
    expect(report.missingCount).toBe(2);
    expect(report.unattributedCount).toBe(0);
  });

  it("HOUSEHOLD-scoped documents need no per-item link — a Mislaka covers the person", () => {
    const retirement = [
      { id: "p1", name: "פנסיה", kind: "ACCOUNT", accountType: "PENSION_COMPREHENSIVE" },
      { id: "g1", name: "גמל", kind: "ACCOUNT", accountType: "KUPAT_GEMEL" },
    ];
    // No linkedItemIds at all, and both rows are still satisfied.
    const report = buildMissingDocsReport(retirement, [{ docType: "MISLAKA", uploadedAt: days(10) }], NOW);
    expect(report.expectations.every((e) => e.status === "PRESENT")).toBe(true);
    expect(report.unattributedCount).toBe(0);
  });

  it("a 106 is household-scoped too — it covers a person, not an account", () => {
    const salary = [{ id: "s1", name: "משכורת", kind: "CASH_FLOW", hasSalaryFlow: true }];
    const report = buildMissingDocsReport(salary, [{ docType: "TAX_106", uploadedAt: days(10) }], NOW);
    expect(report.expectations[0]!.status).toBe("PRESENT");
  });

  it("a missing linkedItemIds is treated as unattributed, never as covering everything", () => {
    // The old behaviour in one assertion: absent attribution must not mean "matches all".
    const report = buildMissingDocsReport(banks, [{ docType: "BANK_STATEMENT", uploadedAt: days(5) }], NOW);
    expect(report.unattributedCount).toBe(2);
    expect(report.expectations.every((e) => e.status === "UNATTRIBUTED")).toBe(true);
  });

  it("an item-scoped document linked to BOTH accounts marks both present", () => {
    const report = buildMissingDocsReport(
      banks,
      [{ docType: "BANK_STATEMENT", uploadedAt: days(10), linkedItemIds: ["b1", "b2"] }],
      NOW,
    );
    expect(report.expectations.every((e) => e.status === "PRESENT")).toBe(true);
  });
});
