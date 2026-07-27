import { describe, expect, it } from "vitest";
import { detectColumns, parseBankTable } from "../src/pdf-bank-table";
import type { CellLine } from "../src/pdf/extract";

/**
 * Synthetic, but reproduces the REAL FIBI column layout catalogued in
 * docs/architecture/07 Appendix B:
 *   תאריך ערך | סופ"פ | אסמכתא | יתרה | חובה | זכות | תיאור | תאריך
 * with Hebrew stored in visual order.
 */
const rev = (s: string) => [...s].reverse().join("");
const line = (page: number, y: number, cells: Array<[number, string]>): CellLine => ({
  page,
  y,
  cells: cells.map(([x, text]) => ({ x, text })),
});

const HEADER = line(1, 700, [
  [40, rev("תאריך ערך")], [130, rev('סופ"פ')], [200, rev("אסמכתא")], [300, rev("יתרה")],
  [390, rev("חובה")], [470, rev("זכות")], [560, rev("תיאור")], [680, rev("תאריך")],
]);

// Salary: balance 33001.18 sits in the balance column, the 36986.94 CREDIT is the movement.
const SALARY = line(1, 680, [
  [40, "01/01/2026"], [130, "222"], [200, "99411"], [300, "33001.18"],
  [470, "36986.94"], [560, rev("משכורת")], [680, "01/01/2026"],
]);

// Card settlement: a DEBIT.
const CARD = line(1, 660, [
  [40, "02/01/2026"], [130, "162"], [200, "8547"], [390, "12644.47"],
  [560, rev("ישראכרט")], [680, "02/01/2026"],
]);

describe("detectColumns", () => {
  it("finds the header row and every column", () => {
    const cols = detectColumns([HEADER, SALARY]);
    const keys = cols.map((c) => c.key);
    expect(keys).toContain("date");
    expect(keys).toContain("debit");
    expect(keys).toContain("credit");
    expect(keys).toContain("balance");
    expect(keys).toContain("description");
  });

  it("does NOT mistake a title line for a header", () => {
    const title = line(1, 750, [[40, rev("תנועות בחשבון")]]);
    expect(detectColumns([title])).toHaveLength(0);
  });
});

describe("parseBankTable — the bug that imported balances as expenses", () => {
  it("takes the CREDIT as the movement, never the balance", () => {
    // The whole point: 33001.18 is a running balance and must not become a transaction.
    const { rows } = parseBankTable([HEADER, SALARY]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe("36986.94");
    expect(rows[0]?.balance).toBe("33001.18");
  });

  it("signs a debit as an outflow", () => {
    const { rows } = parseBankTable([HEADER, CARD]);
    expect(rows[0]?.amount).toBe("-12644.47");
  });

  it("recovers income that the old line heuristic discarded entirely", () => {
    const { rows } = parseBankTable([HEADER, SALARY, CARD]);
    const income = rows.filter((r) => Number(r.amount) > 0);
    expect(income).toHaveLength(1);
    expect(Number(income[0]?.amount)).toBe(36986.94);
  });

  it("repairs the description to logical-order Hebrew", () => {
    const { rows } = parseBankTable([HEADER, SALARY]);
    expect(rows[0]?.descriptionRaw).toContain("משכורת");
  });

  it("keeps the reference for idempotent re-import", () => {
    const { rows } = parseBankTable([HEADER, SALARY]);
    expect(rows[0]?.reference).toBe("99411");
  });

  it("skips header and title lines without inventing rows", () => {
    const title = line(1, 750, [[40, rev("תנועות בחשבון")]]);
    expect(parseBankTable([title, HEADER, SALARY]).rows).toHaveLength(1);
  });

  it("REFUSES when the columns cannot be identified — never falls back to guessing", () => {
    // Importing plausible-but-wrong numbers into a ledger is worse than importing none.
    const r = parseBankTable([line(1, 700, [[40, "just"], [100, "some"], [200, "text"]])]);
    expect(r.columnsFound).toBe(false);
    expect(r.rows).toHaveLength(0);
  });

  it("reports a dated row that carried no movement rather than dropping it silently", () => {
    const noMoney = line(1, 640, [[40, "03/01/2026"], [560, rev("הערה")], [680, "03/01/2026"]]);
    expect(parseBankTable([HEADER, noMoney]).unparsed).toHaveLength(1);
  });
});
