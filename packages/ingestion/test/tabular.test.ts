import { describe, expect, it } from "vitest";
import {
  detectHeaderRow, normaliseGrid, parseCsvGrid, parseHtmlGrid, sniffEncoding, sniffFormat, toRecords,
} from "../src/tabular";
import {
  applyMapping, buildExternalRef, detectDateOrder, guessMapping, looksLikeCardStatement, looksRecurring,
  normaliseMinus, parseDateWithOrder, parseInstalments,
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
  it("NEVER keys on the statement reference alone", () => {
    // The FIBI bank statement's אסמכתא is an OPERATION-TYPE code, not a transaction id:
    // "13795" appears on 41 different rows. Keying on it collapsed 111 real transactions
    // to 38 unique keys, and the unique constraint silently discarded the other 73 -
    // including a July salary that collided with January's.
    const jan = buildExternalRef("2026-01-01", "36986.94", "משכורת", "99411");
    const jul = buildExternalRef("2026-07-06", "70711.40", "משכורת", "99411");
    expect(jan).not.toBe(jul);
  });

  it("is stable for identical rows and different for different ones", () => {
    const a = buildExternalRef("2026-01-01", "-5", "SHOP", "");
    const b = buildExternalRef("2026-01-01", "-5", "SHOP", "");
    const c = buildExternalRef("2026-01-01", "-6", "SHOP", "");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("still distinguishes rows that differ only by reference", () => {
    expect(buildExternalRef("2026-01-01", "-5", "SHOP", "A1"))
      .not.toBe(buildExternalRef("2026-01-01", "-5", "SHOP", "B2"));
  });

  it("gives genuinely identical same-day rows DISTINCT keys", () => {
    // Two identical coffees on one day are two transactions, not a duplicate.
    const csv = "תאריך,תיאור,סכום\n01/07/2026,קפה,-12\n01/07/2026,קפה,-12";
    const table = toRecords(parseCsvGrid(csv), 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.externalRef).not.toBe(drafts[1]?.externalRef);
  });

  it("assigns the SAME keys on a re-import, so overlapping ranges still deduplicate", () => {
    const csv = "תאריך,תיאור,סכום\n01/07/2026,קפה,-12\n01/07/2026,קפה,-12";
    const run = () => applyMapping(toRecords(parseCsvGrid(csv), 0), {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום" },
    }).drafts.map((d) => d.externalRef);
    expect(run()).toEqual(run());
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

describe("card-statement detection — the safety net for a mis-declared file", () => {
  it("recognises a card statement from its headers alone", () => {
    // Real Isracard-via-FIBI HTML headers.
    expect(looksLikeCardStatement(["תאריך עסקה", "שם העסק", "סכום עסקה", "סכום חיוב", "פירוט"])).toBe(true);
  });

  it("does NOT flag a bank statement — it has the debit/credit pair", () => {
    expect(looksLikeCardStatement(["תאריך", "תיאור", "חובה", "זכות", "יתרה", "אסמכתא"])).toBe(false);
  });

  it("forces every card row to an outflow, keeping an explicit refund positive", () => {
    // Card statements print charges UNSIGNED. Without allOutflow every expense
    // imports as income - which is exactly what the owner saw.
    const csv = "תאריך עסקה,שם העסק,סכום חיוב\n01/07/2026,חנות,100.00\n02/07/2026,החזר,-50.00";
    const table = toRecords(parseCsvGrid(csv), 0);
    const cols = { date: "תאריך עסקה", description: "שם העסק", amount: "סכום חיוב" };
    const asBank = applyMapping(table, { amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true, columns: cols });
    expect(asBank.drafts[0]?.amount).toBe("100.00"); // wrong direction without the flag
    const asCard = applyMapping(table, { amountMode: "SIGNED", allOutflow: true, defaultCurrency: "ILS", dayFirst: true, columns: cols });
    expect(asCard.drafts[0]?.amount).toBe("-100");   // charge
    expect(asCard.drafts[1]?.amount).toBe("50");     // refund stays an inflow
  });
});

describe("real-file regressions: OneZero CSV", () => {
  it("detects MONTH-FIRST dates so a US-format export is not rejected wholesale", () => {
    // "07/15/2026" parsed day-first makes month 15; every row fails and the import
    // yields ZERO rows, which looks like "the tool cannot read this file".
    expect(detectDateOrder(["07/15/2026", "07/03/2026"])).toBe("MDY");
    expect(detectDateOrder(["15/07/2026", "03/07/2026"])).toBe("DMY");
    expect(detectDateOrder(["01/02/2026"])).toBe("DMY"); // ambiguous -> Israeli norm
  });

  it("parses with the detected order", () => {
    expect(parseDateWithOrder("07/15/2026", "MDY")).toBe("2026-07-15");
    expect(parseDateWithOrder("15/07/2026", "DMY")).toBe("2026-07-15");
  });

  it("treats a single חיוב/זיכוי column as a DIRECTION, not two money columns", () => {
    // Matching it as both debit AND credit found no numbers in either and produced
    // zero usable rows.
    const g = guessMapping(["תאריך תנועה", "תיאור", "סכום פעולה", "חיוב/זיכוי", "יתרה"]);
    expect(g.amountMode).toBe("SIGNED");
    expect(g.direction).toBe("חיוב/זיכוי");
    expect(g.debit).toBeUndefined();
    expect(g.credit).toBeUndefined();
  });

  it("uses the stated direction to sign the amount", () => {
    const csv = [
      "תאריך תנועה,תיאור,סכום פעולה,חיוב/זיכוי",
      "07/15/2026,העברה,2006,חיוב",
      "06/30/2026,משכורת,28279.51,זיכוי",
    ].join("\n");
    const table = toRecords(parseCsvGrid(csv), 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך תנועה", description: "תיאור", amount: "סכום פעולה", direction: "חיוב/זיכוי" },
    });
    expect(drafts[0]?.amount).toBe("-2006");      // חיוב -> outflow
    expect(drafts[1]?.amount).toBe("28279.51");   // זיכוי -> inflow
    expect(drafts[0]?.bookedAt).toBe("2026-07-15");
  });

  it("keeps the reference OUT of the description", () => {
    // Appending it made the redactor mistake "25-21416640" for an account number.
    const csv = "תאריך,תיאור,סכום,אסמכתא\n01/07/2026,חנות,-50,25-21416640";
    const table = toRecords(parseCsvGrid(csv), 0);
    const { drafts } = applyMapping(table, {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום", reference: "אסמכתא" },
    });
    expect(drafts[0]?.descriptionRedacted).toBe("חנות");
    // The reference still contributes to the key, but is no longer the key itself.
    const withRef = drafts[0]?.externalRef;
    const withoutRef = applyMapping(toRecords(parseCsvGrid("תאריך,תיאור,סכום,אסמכתא\n01/07/2026,חנות,-50,"), 0), {
      amountMode: "SIGNED", defaultCurrency: "ILS", dayFirst: true,
      columns: { date: "תאריך", description: "תיאור", amount: "סכום", reference: "אסמכתא" },
    }).drafts[0]?.externalRef;
    expect(withRef).not.toBe(withoutRef);
  });
});
