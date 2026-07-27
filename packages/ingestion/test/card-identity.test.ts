import { describe, expect, it } from "vitest";
import { detectCardLast4, parseSettlementLine } from "../src/card-identity";

/**
 * The double-count hazard in one line: the bank shows a card bill as ONE aggregate
 * debit carrying the card's last 4 ("ישראכרט בע\"מ - 6170"), while the card statement
 * itemises the same money.
 */
describe("parseSettlementLine", () => {
  it("recognises a card settlement and extracts the last 4", () => {
    expect(parseSettlementLine('ישראכרט בע"מ - 6170')).toEqual({ last4: "6170", issuerText: "ישראכרט" });
    expect(parseSettlementLine("כרטיסי אשראי לי - 1401")?.last4).toBe("1401");
  });

  it("handles issuers without a dash", () => {
    expect(parseSettlementLine("ויזה כאל 7796")?.last4).toBe("7796");
  });

  it("returns undefined for an ordinary expense — a false positive would ERASE it", () => {
    // If this matched, a real supermarket charge would be silently excluded as a transfer.
    expect(parseSettlementLine("מינימרקט שוקי בע\"מ")).toBeUndefined();
    expect(parseSettlementLine("משכורת")).toBeUndefined();
  });

  it("requires a card number, not just an issuer name", () => {
    expect(parseSettlementLine('ישראכרט בע"מ')).toBeUndefined();
  });
});

describe("detectCardLast4", () => {
  it("prefers the statement text over the filename", () => {
    expect(detectCardLast4("פלטינה מאסטרקארד | 1069", "statement.pdf")).toBe("1069");
  });

  it("falls back to the filename", () => {
    expect(detectCardLast4("", "1069_07_2026.pdf")).toBe("1069");
  });

  it("returns undefined when neither is available — an unlinked statement is safe, a WRONG link is not", () => {
    expect(detectCardLast4("", "statement.pdf")).toBeUndefined();
  });
});
