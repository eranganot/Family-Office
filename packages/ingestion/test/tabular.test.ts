import { describe, expect, it } from "vitest";
import {
  detectHeaderRow, normaliseGrid, parseCsvGrid, parseHtmlGrid, sniffEncoding, sniffFormat, toRecords,
} from "../src/tabular";
import {
  applyMapping, buildExternalRef, guessMapping, looksRecurring, normaliseMinus, parseInstalments,
  type MappingProfile,
} from "../src/statement-mapping";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/**
 * Fixtures are SYNTHETIC but reproduce the STRUCTURE of the owner's real exports
 * (docs/architecture/07 Appendix B): FIBI's debit/credit columns with a preamble,
 * OneZero's signed amount + direction column, and the Isracard-via-FIBI HTML table.
 */
describe("format & encoding sniffing", () => {
  it("detects UTF-8 Hebrew", () => {
    expect(sniffEncoding(enc("תאריך,סכום"))).toBe("utf-8");
  });

  it("detects Windows-1255 Hebrew (invalid UTF-8 high bytes)", () => {
    // 0xE0..0xFA is the CP1255 Hebrew block; as UTF-8 this is invalid.
    const bytes = new Uint8Array([0xfa, 0xe0, 0xf8, 0xe9, 0xea, 0x2c, 0xf1]);
    expect(sniffEncoding(bytes)).toBe("windows-1255");
  });

  it("recognises CSV and HTML", () => {
    expect(sniffFormat(enc("date,amount\n2026-01-01,5"), "x.csv").format).toBe("CSV");
    expect(sniffFormat(enc("<html><table><tr><td>a</td></tr></table>"), "x.html").format).toBe("HTML");
  });

  it("refuses legacy .xls with an actionable reason rather than mis-parsing it", () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    const r = sniffFormat(ole, "OZ_Movements.xls");
    expect(r.format).toBe("UNSUPPORTED_XLS");
    expect(r.reason).toBe("LEGACY_XLS");
  });
});

describe("header detection", () => {
  it("skips title/account preamble rows above the real header", () => {
    // Real statements put a title and account line above the header; assuming row 0
    // would mis-parse the entire file.
    const grid = parseCsvGrid(
      ["תנועות בחשבון", "סניף 65 | מתאריך 01/01/2026", "תאריך,תיאור,חובה,זכות,יתרה", "01/01/2026,משכורת,,28000,28000"].join("\n"),
    );
    expect(detectHeaderRow(grid.rows)).toBe(2);
  });

  it("uses row 0 when the file starts with its header", () => {
    expect(detectHeaderRow(parseCsvGrid("date,description,amount\n2026-01-01,x,5").rows)).toBe(0);
  });
});

describe("visual-order repair across a grid", () => {
  it("repairs reversed Hebrew via the orthographic signal (word has a final letter)", () => {
    const reversed = [..."תשלום"].reverse().join(""); // ends in final mem
    const grid = normaliseGrid({ rows: [["תאריך"], [reversed]] });
    expect(grid.rows[1]?.[0]).toBe("תשלום");
  });

  it("repairs a reversed word with NO final letters, via the statement lexicon", () => {
    // "משכורת" contains no final form, so final-letter position cannot decide it.
    // This is exactly the documented limitation the lexicon tie-breaker exists to close.
    const reversed = [..."משכורת"].reverse().join("");
    const grid = normaliseGrid({ rows: [["תיאור"], [reversed]] });
    expect(grid.rows[1]?.[0]).toBe("משכורת");
  });

  it("leaves correctly-ordered Hebrew untouched", () => {
    const grid = normaliseGrid({ rows: [["תאריך", "תיאור"], ["01/01/2026", "משכורת"]] });
    expect(grid.rows[1]?.[1]).toBe("משכורת");
  });
});

describe("HTML table extraction", () => {
  const html = `
    <html><body>
      <table><tr><td>layout junk</td></tr></table>
      <table>
        <tr><th>תאריך עסקה</th><th>שם  העסק</th><th>סכום חיוב</th><th>פירוט</th></tr>
        <tr><td>22/07/2025</td><td>ביטוח חובה</td><td>147.83</td><td>תשלום 12 מתוך 12</td></tr>
        <tr><td>05/05/2026</td><td>עיריית ר"ג</td><td>1,603.59</td><td>תשלום 1 מתוך 3</td></tr>
      </table>
    </body></html>`;

  it("picks the LARGEST table, not the first (layout tables come first)", () => {
    const grid = parseHtmlGrid(html);
    expect(grid.rows).toHaveLength(3);
    expect(grid.rows[0]?.[0]).toBe("תאריך עסקה");
  });

  it("maps to records and parses instalments from the details column", () => {
    const grid = parseHtmlGrid(html);
    const table = toRecords(grid, detectHeaderRow(grid.rows));
    const profile: MappingProfile = {
      amountMode: "SIGNED",
      defaultCurrency: "ILS",
      dayFirst: true,
      columns: { date: "תאריך עסקה", description: "שם העסק", amount: "סכום חיוב" },
    };
    const { drafts } = applyMapping(table, profile);
    expect(drafts).toHaveLength(2);
    expect(drafts[1]?.instalmentNumber).toBe(1);
    expect(drafts[1]?.instalmentTotal).toBe(3);
    expect(drafts[1]?.amount).toBe("1603.59");
  });
});

describe("applyMapping — debit/credit mode (FIBI shape)", () => {
  const csv = [
    "תאריך,תיאור,חובה,זכות,יתרה,אסמכתא",
    "01/01/2026,משכורת,,36986.94,36986.94,99411",
    "02/01/2026,ישראכרט בעמ,12644.47,,24342.47,8547",
    "03/01/2026,סיכום ביניים,,,,",
  ].join("\n");

  const table = (() => {
    const grid = parseCsvGrid(csv);
    return toRecords(grid, detectHeaderRow(grid.rows));
  })();

  const profile: MappingProfile = {
    amountMode: "DEBIT_CREDIT",
    defaultCurrency: "ILS",
    dayFirst: true,
    columns: { date: "תאריך", description: "תיאור", debit: "חובה", credit: "זכות", reference: "אסמכתא" },
  };

  it("signs debit as outflow and credit as inflow", () => {
    const { drafts } = applyMapping(table, profile);
    expect(drafts[0]?.amount).toBe("36986.94");
    expect(drafts[1]?.amount).toBe("-12644.47");
  });

  it("REPORTS unusable rows instead of silently dropping them", () => {
    // Subtotal/footer rows are legitimate but unusable; the preview must show how many
    // were skipped, or the user is left wondering why the total is short.
    const { issues } = applyMapping(table, profile);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.reason).toBe("NO_AMOUNT");
  });

  it("guesses DEBIT_CREDIT mode from the headers", () => {
    const g = guessMapping(table.headers);
    expect(g.amountMode).toBe("DEBIT_CREDIT");
    expect(g.date).toBe("תאריך");
    expect(g.debit).toBe("חובה");
    expect(g.credit).toBe("זכות");
  });
});

describe("applyMapping — signed mode, and the details that bite", () => {
  it("normalises U+2212 MINUS SIGN so refunds are not lost", () => {
    expect(normaliseMinus("−603.00")).toBe("-603.00");
    const grid = parseCsvGrid("תאריך,תיאור,סכום\n21/06/2026,החזר,−603.00");
    const table = toRecords(grid, 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts[0]?.amount).toBe("-603.00");
  });

  it("marks pending rows so they do not count until they settle", () => {
    const grid = parseCsvGrid("תאריך,תיאור,סכום,מצב\n27/07/2026,חנות,130.85,בתהליך קליטה");
    const table = toRecords(grid, 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום", pendingMarker: "בתהליך קליטה" },
    });
    expect(drafts[0]?.status).toBe("PENDING");
  });

  it("REDACTS during mapping — raw PII never leaves this function", () => {
    const grid = parseCsvGrid("תאריך,תיאור,סכום\n01/01/2026,כרטיס 4111111111111111,‎-50");
    const table = toRecords(grid, 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts[0]?.descriptionRedacted).toContain("[CARD]");
    expect(drafts[0]?.descriptionRedacted).not.toContain("4111");
    expect(drafts[0]?.counterpartyMasked).toBe("1111");
  });

  it("flags standing orders as recurring candidates", () => {
    expect(looksRecurring("הוראת קבע")).toBe(true);
    expect(looksRecurring("סתם חנות")).toBe(false);
  });
});

describe("externalRef — idempotent re-import", () => {
  it("prefers the statement's own reference", () => {
    expect(buildExternalRef("2026-01-01", "-5", "x", "99411")).toBe("ref:99411");
  });
  it("is stable for identical rows and different for different ones", () => {
    const a = buildExternalRef("2026-01-01", "-5", "SHOP", "");
    const b = buildExternalRef("2026-01-01", "-5", "SHOP", "");
    const c = buildExternalRef("2026-01-01", "-6", "SHOP", "");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("parseInstalments", () => {
  it("reads the Hebrew form", () => {
    expect(parseInstalments("תשלום 3 מתוך 12")).toEqual({ number: 3, total: 12 });
  });
  it("reads an English form", () => {
    expect(parseInstalments("payment 2 of 6")).toEqual({ number: 2, total: 6 });
  });
  it("returns undefined when absent", () => {
    expect(parseInstalments("הוראת קבע")).toBeUndefined();
  });
});

describe("merchantKey is stamped at import time", () => {
  it("every mapped draft carries a merchant key derived from the REDACTED text", () => {
    // Without this, imported rows cannot participate in owner memory or
    // "apply to this merchant" — the learning loop silently excludes them.
    const grid = parseCsvGrid("תאריך,תיאור,סכום\n01/01/2026,SPOTIFY P43CD5B1CB,-33.90");
    const table = toRecords(grid, 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts[0]?.merchantKey).toBe("SPOTIFY");
  });

  it("groups the same merchant across differing reference codes", () => {
    const grid = parseCsvGrid(
      "תאריך,תיאור,סכום\n01/01/2026,SPOTIFY P43CD5B1CB,-33.90\n01/02/2026,SPOTIFY Q99XX1A2BC,-33.90",
    );
    const { drafts } = applyMapping(toRecords(grid, 0), {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts[0]?.merchantKey).toBe(drafts[1]?.merchantKey);
  });

  it("derives the key from redacted text, so no PII can leak into it", () => {
    const grid = parseCsvGrid("תאריך,תיאור,סכום\n01/01/2026,כרטיס 4111111111111111,-50");
    const { drafts } = applyMapping(toRecords(grid, 0), {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts[0]?.merchantKey).not.toContain("4111");
  });
});
