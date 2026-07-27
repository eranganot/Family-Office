import { describe, expect, it } from "vitest";
import { guessIssuer, parseStatementLines, PDF_PROFILES } from "../src/pdf-statement";
import { toggleVisualHebrewLine } from "../src/normalize";

/**
 * Fixtures are SYNTHETIC but reproduce the exact LINE SHAPE of the owner's real PDFs
 * (docs/architecture/07 Appendix B): Hebrew in visual order with digits intact, the
 * Isracard "transaction amount then charge amount" pair, and CAL's grouped batches.
 * Merchant names are generic — the public-repo rule forbids shipping household data.
 */
const L = (text: string, page = 1) => ({ text, page });

/** Build a visual-order line the way these PDF producers emit it. */
const visual = (logical: string) => toggleVisualHebrewLine(logical);

describe("guessIssuer", () => {
  it("detects Isracard in either orientation", () => {
    expect(guessIssuer("ישראכרט בעמ")).toBe("ISRACARD");
    expect(guessIssuer(visual("ישראכרט בעמ"))).toBe("ISRACARD");
  });
  it("detects the bank", () => {
    expect(guessIssuer("תנועות בחשבון")).toBe("FIBI_BANK");
  });
  it("returns UNKNOWN rather than guessing wildly", () => {
    expect(guessIssuer("hello world")).toBe("UNKNOWN");
  });
});

describe("parseStatementLines — Isracard shape", () => {
  // Real shape: תאריך רכישה | שם בית עסק | סכום עסקה | סכום חיוב | מס' שובר
  const lines = [
    L(visual("פירוט עסקאות ישראכרט")),
    L(visual("28.06.26 חנות הספרים ₪469.00 ₪469.00 629076429")),
    L(visual("24.06.26 שירות ענן $10.00 ₪29.79 601610564")),
    L(visual("22.06.26 מנוי מוזיקה ₪33.90 ₪33.90 587779908 הוראת קבע")),
  ];

  it("parses the date, description and CHARGE amount", () => {
    const { rows } = parseStatementLines(lines);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.bookedAt).toBe("2026-06-28");
    expect(rows[0]?.amount).toBe("-469");
    expect(rows[0]?.descriptionRaw).toContain("חנות הספרים");
  });

  it("picks the CHARGE (second) amount, not the transaction amount", () => {
    // $10.00 was charged as ILS 29.79 - the charge is what hits the account.
    const { rows } = parseStatementLines(lines);
    const fx = rows.find((r) => r.descriptionRaw.includes("ענן"));
    expect(fx?.amount).toBe("-29.79");
    expect(fx?.originalAmount).toBe("10.00");
  });

  it("flags standing orders as recurring", () => {
    const { rows } = parseStatementLines(lines);
    expect(rows.find((r) => r.descriptionRaw.includes("מוזיקה"))?.isRecurringCandidate).toBe(true);
  });

  it("does NOT mistake a voucher number for an amount", () => {
    // 629076429 has no currency symbol and no decimals - it is a reference, not money.
    const { rows } = parseStatementLines(lines);
    expect(rows[0]?.amount).toBe("-469");
  });

  it("produces readable (logical-order) Hebrew, not reversed text", () => {
    const { rows } = parseStatementLines(lines);
    // "הספרים" ends in a final mem; reversed text would put it at the start.
    expect(rows[0]?.descriptionRaw).toContain("הספרים");
  });
});

describe("parseStatementLines — CAL shape with a pending section", () => {
  const lines = [
    L(visual("עסקאות בתהליך קליטה")),
    L(visual("₪130.85 מינימרקט 27/07/26")),
    L(visual("עסקאות לחיוב ב-02/07/26")),
    L(visual("₪100.04 תחנת דלק 30/06/26")),
  ];

  it("marks rows under the in-process heading as PENDING", () => {
    const { rows } = parseStatementLines(lines, PDF_PROFILES.CAL);
    const mini = rows.find((r) => r.descriptionRaw.includes("מינימרקט"));
    expect(mini?.pending).toBe(true);
  });

  it("still parses amounts and dates in CAL's amount-first layout", () => {
    const { rows } = parseStatementLines(lines, PDF_PROFILES.CAL);
    expect(rows.find((r) => r.descriptionRaw.includes("דלק"))?.amount).toBe("-100.04");
  });
});

describe("parseStatementLines — instalments and refunds", () => {
  it("reads instalment counters", () => {
    const { rows } = parseStatementLines([
      L(visual("05.05.26 עירייה ₪4,702.60 ₪1,603.59 123456 תשלום 1 מתוך 3")),
    ]);
    expect(rows[0]?.instalmentNumber).toBe(1);
    expect(rows[0]?.instalmentTotal).toBe(3);
    expect(rows[0]?.amount).toBe("-1603.59");
  });

  it("treats an explicit minus as a refund (inflow)", () => {
    const { rows } = parseStatementLines([L(visual("21.06.26 החזר נסיעות −₪603.00 579191249"))]);
    expect(Number(rows[0]?.amount)).toBeGreaterThan(0);
  });

  it("parses thousands separators", () => {
    const { rows } = parseStatementLines([L(visual("22.06.26 ריהוט ₪2,360.00 ₪2,360.00 586556958"))]);
    expect(rows[0]?.amount).toBe("-2360");
  });
});

describe("parseStatementLines — robustness", () => {
  it("skips headers and totals rather than inventing rows", () => {
    const { rows } = parseStatementLines([
      L(visual("סך הכל לחיוב החודש")),
      L("---------"),
      L(visual("28.06.26 חנות ₪10.00 ₪10.00 1")),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("REPORTS date-bearing lines it could not parse instead of hiding them", () => {
    const { unparsed } = parseStatementLines([L("28.06.26 no amount here at all")]);
    expect(unparsed).toHaveLength(1);
  });

  it("rejects an impossible date rather than coercing it", () => {
    const { rows } = parseStatementLines([L(visual("31.02.26 חנות ₪10.00"))]);
    expect(rows).toHaveLength(0);
  });

  it("parses logical-order PDFs too — no configuration needed", () => {
    // A producer that emits logical order already must still work.
    const { rows } = parseStatementLines([L("28.06.26 חנות הספרים ₪469.00 ₪469.00")]);
    expect(rows[0]?.descriptionRaw).toContain("הספרים");
  });
});
