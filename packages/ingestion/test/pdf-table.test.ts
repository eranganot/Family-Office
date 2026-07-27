import { describe, expect, it } from "vitest";
import { parsePdfTable } from "../src/pdf-table";
import type { CellLine } from "../src/pdf/extract";

/**
 * Cell coordinates below are taken from the OWNER'S REAL statements (structure only —
 * merchants and amounts are synthetic). Verified by running the parser against the
 * actual PDFs; the earlier synthetic-only fixtures are what let three separate
 * mis-parses ship.
 *
 * Two hard-won facts encoded here:
 *  - pdfjs returns Hebrew in LOGICAL order. Never character-reverse it.
 *  - Hebrew cells join RIGHT-TO-LEFT; numeric cells join LEFT-TO-RIGHT with no gap
 *    (producers split "₪130." and "85" across two items).
 */
const line = (page: number, y: number, cells: Array<[number, string]>): CellLine => ({
  page, y, cells: cells.map(([x, text]) => ({ x, text })),
});

describe("BANK table (FIBI layout)", () => {
  const HEADER = line(1, 700, [
    [62, "תאריך ערך"], [139, 'סו"פ'], [185, "אסמכתא"], [285, "יתרה"],
    [357, "חובה"], [434, "זכות"], [554, "תיאור"], [636, "תאריך"],
  ]);
  const DESC_ABOVE = line(1, 690, [[529, "משיכת שיק"]]);
  const CHEQUE = line(1, 680, [[54, "01/01/2026"], [142, "162"], [181, "1750400"], [335, "5300.00"], [602, "01/01/2026"]]);
  const CHEQUE_NO = line(1, 670, [[533, "1750400"]]);
  const SALARY = line(1, 660, [
    [54, "01/01/2026"], [142, "222"], [196, "99411"], [255, "33001.18"], [401, "36986.94"],
    [545, "משכורת"], [602, "01/01/2026"],
  ]);

  it("takes the CREDIT as income, never the running balance", () => {
    const { rows } = parsePdfTable([HEADER, SALARY]);
    const salary = rows.find((r) => r.descriptionRaw.includes("משכורת"));
    expect(salary?.amount).toBe("36986.94");
    expect(salary?.balance).toBe("33001.18");
  });

  it("signs a debit as an outflow", () => {
    const { rows } = parsePdfTable([HEADER, DESC_ABOVE, CHEQUE, CHEQUE_NO]);
    expect(rows[0]?.amount).toBe("-5300");
  });

  it("assembles a description from the line ABOVE plus the numeric line BELOW", () => {
    const { rows } = parsePdfTable([HEADER, DESC_ABOVE, CHEQUE, CHEQUE_NO]);
    expect(rows[0]?.descriptionRaw).toBe("משיכת שיק 1750400");
  });

  it("never mistakes the header row for a description", () => {
    const { rows } = parsePdfTable([HEADER, SALARY]);
    expect(rows[0]?.descriptionRaw).not.toContain("יתרה");
  });

  it("leaves logical-order Hebrew untouched — no character reversal anywhere", () => {
    const { rows } = parsePdfTable([HEADER, SALARY]);
    expect(rows[0]?.descriptionRaw).toContain("משכורת");
  });
});

describe("CARD table (Isracard layout)", () => {
  const HEADER = line(1, 700, [
    [78, "נוסף"], [99, "פירוט"], [153, "שובר"], [176, "מס'"], [225, "חיוב"], [245, "סכום"],
    [292, "עסקה"], [319, "סכום"], [438, "עסק"], [459, "בית"], [476, "שם"], [504, "רכישה"], [533, "תאריך"],
  ]);
  const ROW = line(1, 690, [
    [145, "629076429"], [230, "₪469.00"], [304, "₪469.00"],
    [385, "בעמ-מ"], [416, "העתקות"], [453, "גרמושקה"], [523, "28.06.26"],
  ]);
  const FX = line(1, 680, [
    [85, 'חו"ל'], [105, "אתר"], [148, "601610564"], [237, "₪29.79"], [311, "$10.00"],
    [437, "ANTHROPIC"], [523, "24.06.26"],
  ]);
  const STANDING = line(1, 670, [[76, "קבע"], [96, "הוראת"]]);

  it("joins Hebrew merchant words RIGHT-TO-LEFT (the real word-order bug)", () => {
    // Ascending x would give "בעמ-מ העתקות גרמושקה" - every word right, order reversed.
    const { rows } = parsePdfTable([HEADER, ROW]);
    expect(rows[0]?.descriptionRaw).toBe("גרמושקה העתקות בעמ-מ");
  });

  it("accepts two-digit years, which the shared date parser rejects", () => {
    const { rows } = parsePdfTable([HEADER, ROW]);
    expect(rows[0]?.bookedAt).toBe("2026-06-28");
  });

  it("treats a card charge as an OUTFLOW — the statement prints it unsigned", () => {
    const { rows } = parsePdfTable([HEADER, ROW]);
    expect(Number(rows[0]?.amount)).toBeLessThan(0);
  });

  it("keeps the ILS charge and records the foreign original separately", () => {
    const { rows } = parsePdfTable([HEADER, FX]);
    expect(rows[0]?.amount).toBe("-29.79");
    expect(rows[0]?.originalAmount).toBe("10.00");
    expect(rows[0]?.originalCurrency).toBe("USD");
  });

  it("uses the metadata line beneath a row as context, not as the merchant name", () => {
    const { rows } = parsePdfTable([HEADER, FX, STANDING]);
    expect(rows[0]?.descriptionRaw).toBe("ANTHROPIC");
    expect(rows[0]?.isRecurringCandidate).toBe(true);
  });
});

describe("HEADERLESS card (Visa CAL browser print)", () => {
  // No header row at all; amount split across two cells.
  const rows = Array.from({ length: 6 }, (_, i) =>
    line(1, 700 - i * 10, [[64, "₪130."], [93, "85"], [414, "מינימרקט שוקי בע\"מ"], [524, `2${i}/07/26`]]),
  );

  it("derives columns from the data when there is no header", () => {
    const r = parsePdfTable(rows);
    expect(r.columnsFound).toBe(true);
    expect(r.kind).toBe("CARD");
  });

  it("reassembles a split amount LEFT-TO-RIGHT with no separator", () => {
    // Joining these RTL would produce "85 ₪130." and parse as 85.
    const r = parsePdfTable(rows);
    expect(r.rows[0]?.amount).toBe("-130.85");
  });

  it("still reads the merchant", () => {
    expect(parsePdfTable(rows).rows[0]?.descriptionRaw).toContain("מינימרקט");
  });
});

describe("refusal", () => {
  it("returns nothing when no table can be identified — never guesses", () => {
    const r = parsePdfTable([line(1, 700, [[40, "just"], [100, "prose"]])]);
    expect(r.columnsFound).toBe(false);
    expect(r.rows).toHaveLength(0);
  });
});
