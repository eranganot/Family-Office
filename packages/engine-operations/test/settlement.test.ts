import { describe, expect, it } from "vitest";
import {
  committedInstalmentsInWindow,
  projectRemainingInstalments,
  reconcileSettlements,
  type CardStatementTotal,
  type SettlementCandidate,
} from "../src/settlement";
import { baselineFromMonths, detectStatementRange, normaliseToMonthly } from "../src/normalize";
import { isRefusal } from "../src/types";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

const settlement = (over: Partial<SettlementCandidate> = {}): SettlementCandidate => ({
  id: "s1",
  bookedAt: d("2026-07-02"),
  amountBase: -5611.17,
  merchantKey: "ישראכרט",
  cardLast4: "1069",
  ...over,
});

const statement = (over: Partial<CardStatementTotal> = {}): CardStatementTotal => ({
  cardLast4: "1069",
  totalBase: 5611.17,
  chargedOn: d("2026-07-02"),
  transactionIds: ["a", "b"],
  ...over,
});

describe("reconcileSettlements — the double-count guard", () => {
  it("LINKS an aggregate bank debit to a matching card statement", () => {
    const [r] = reconcileSettlements([settlement()], [statement()]);
    expect(r?.kind).toBe("LINKED");
  });

  it("tolerates small rounding differences", () => {
    const [r] = reconcileSettlements([settlement()], [statement({ totalBase: 5611.9 })]);
    expect(r?.kind).toBe("LINKED");
  });

  it("does NOT link when the totals genuinely disagree - the bank line must stand", () => {
    const [r] = reconcileSettlements([settlement()], [statement({ totalBase: 4000 })]);
    expect(r?.kind).toBe("UNRECONCILED");
    if (r?.kind === "UNRECONCILED") expect(r.reason).toBe("TOTAL_MISMATCH");
  });

  it("does NOT link when no card statement was imported at all", () => {
    // This is the important safety case: without the itemisation, silently marking the
    // bank line TRANSFER would erase thousands of shekels of real spending.
    const [r] = reconcileSettlements([settlement()], []);
    expect(r?.kind).toBe("UNRECONCILED");
    if (r?.kind === "UNRECONCILED") expect(r.reason).toBe("NO_STATEMENT");
  });

  it("does not match a statement for a DIFFERENT card", () => {
    const [r] = reconcileSettlements([settlement({ cardLast4: "7796" })], [statement({ cardLast4: "1069" })]);
    expect(r?.kind).toBe("UNRECONCILED");
  });

  it("does not match a statement charged weeks away", () => {
    const [r] = reconcileSettlements([settlement()], [statement({ chargedOn: d("2026-06-02") })]);
    expect(r?.kind).toBe("UNRECONCILED");
  });

  it("picks the closest statement when several are in range", () => {
    const [r] = reconcileSettlements(
      [settlement()],
      [statement({ totalBase: 9000, cardLast4: "1069" }), statement({ totalBase: 5611.17, cardLast4: "1069" })],
    );
    expect(r?.kind).toBe("LINKED");
  });
});

describe("projectRemainingInstalments — committed future outflows", () => {
  const txn = {
    id: "t1",
    bookedAt: d("2026-07-05"),
    amountBase: -1603.59,
    instalmentNumber: 1,
    instalmentTotal: 3,
    descriptionRedacted: "ARNONA",
  };

  it("projects only the REMAINING instalments, monthly", () => {
    const out = projectRemainingInstalments(txn);
    expect(out).toHaveLength(2);
    expect(out[0]?.dueDate.toISOString().slice(0, 10)).toBe("2026-08-05");
    expect(out[1]?.dueDate.toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(out[0]?.amountBase).toBe(1603.59);
  });

  it("returns nothing for the final instalment", () => {
    expect(projectRemainingInstalments({ ...txn, instalmentNumber: 3 })).toHaveLength(0);
  });

  it("labels each instalment bilingually", () => {
    const [first] = projectRemainingInstalments(txn);
    expect(first?.titleHe).toContain("תשלום 2 מתוך 3");
    expect(first?.titleEn).toContain("Instalment 2/3");
  });

  it("sums only the instalments inside the Safe-to-Spend window", () => {
    const all = projectRemainingInstalments(txn);
    // A 30-day window from 2026-07-06 catches only the August charge.
    expect(committedInstalmentsInWindow(all, d("2026-07-06"), 30)).toBe(1603.59);
    expect(committedInstalmentsInWindow(all, d("2026-07-06"), 90)).toBe(3207.18);
  });
});

describe("statement range normalisation", () => {
  it("detects a single-month statement", () => {
    expect(detectStatementRange(d("2026-07-01"), d("2026-07-31")).kind).toBe("SINGLE_MONTH");
  });

  it("detects a multi-month range", () => {
    const r = detectStatementRange(d("2026-01-01"), d("2026-07-27"));
    expect(r.kind).toBe("MULTI_MONTH");
    expect(r.activeDays).toBe(208);
  });

  it("reports a full month as OBSERVED, not normalised", () => {
    const r = normaliseToMonthly(12000, detectStatementRange(d("2026-07-01"), d("2026-07-31")), 20);
    expect(isRefusal(r)).toBe(false);
    if (!isRefusal(r)) {
      expect(r.method).toBe("OBSERVED");
      expect(r.amountBase).toBe(12000);
    }
  });

  it("scales a multi-month range by ACTIVE DAYS, not by a hardcoded 30", () => {
    const range = detectStatementRange(d("2026-01-01"), d("2026-03-01")); // 60 days
    const r = normaliseToMonthly(60000, range, 20);
    if (!isRefusal(r)) {
      expect(r.method).toBe("NORMALISED");
      expect(r.amountBase).toBeCloseTo(30436.88, 1); // 60000/60 * 30.436875
    }
  });

  it("REFUSES to extrapolate from too few days", () => {
    const r = normaliseToMonthly(2000, detectStatementRange(d("2026-07-01"), d("2026-07-05")), 20);
    expect(isRefusal(r)).toBe(true);
    if (isRefusal(r)) expect(r.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("averages history WITHOUT treating a missing month as a zero", () => {
    // A month with no data is missing data, not evidence of no spending. Averaging in
    // a zero would understate the baseline and overstate surplus.
    const r = baselineFromMonths([3000, null, 3600]);
    if (!isRefusal(r)) expect(r.amountBase).toBe(3300); // not 2200
  });

  it("refuses when there is no observed month at all", () => {
    expect(isRefusal(baselineFromMonths([null, null]))).toBe(true);
  });
});
