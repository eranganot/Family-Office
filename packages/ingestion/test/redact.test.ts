import { describe, expect, it } from "vitest";
import { isLuhnValid, isValidTeudatZehut, redact, redactRow, REDACTION_VERSION } from "../src/redact";

/**
 * All fixtures are SYNTHETIC (public-repo rule). The ID and card numbers below are
 * constructed to satisfy their check digits so the validators are genuinely exercised.
 */
describe("check-digit validators", () => {
  it("validates Israeli ID check digits", () => {
    expect(isValidTeudatZehut("000000018")).toBe(true);
    expect(isValidTeudatZehut("000000019")).toBe(false);
  });
  it("validates Luhn", () => {
    expect(isLuhnValid("4111111111111111")).toBe(true);
    expect(isLuhnValid("4111111111111112")).toBe(false);
  });
});

describe("redact", () => {
  it("redacts a Luhn-valid card number and keeps only the last 4", () => {
    const r = redact("PURCHASE 4111 1111 1111 1111 TEL AVIV");
    expect(r.text).not.toContain("4111");
    expect(r.text).toContain("[CARD]");
    expect(r.counterpartyMasked).toBe("1111");
  });

  it("does NOT redact a 16-digit run that fails Luhn - it is a reference, not a card", () => {
    const r = redact("REF 1234567890123456");
    expect(r.text).toContain("1234567890123456");
  });

  it("redacts an Israeli IBAN", () => {
    const r = redact("Transfer to IL620108000000099999999 today");
    expect(r.text).toContain("[IBAN]");
    expect(r.text).not.toContain("IL62");
  });

  it("redacts branch-account numbers in both Israeli forms", () => {
    expect(redact("חשבון 65-326475").text).toContain("[ACCT]");   // branch-account
    expect(redact("012-345-678901").text).toContain("[ACCT]");     // bank-branch-account
  });

  it("does NOT mistake dates for account numbers", () => {
    // The trailing run must be >= 5 digits, which is what keeps ISO dates safe.
    expect(redact("bookedAt 2026-07-27").text).toContain("2026-07-27");
    expect(redact("period 07-27").text).toContain("07-27");
  });

  it("redacts a VALID Teudat Zehut", () => {
    const r = redact("ת.ז. 000000018 בעל החשבון");
    expect(r.text).toContain("[ID]");
  });

  it("does NOT shred a 9-digit number that fails the ID check digit", () => {
    // This is the whole reason the check digit is validated: voucher numbers and
    // amounts are frequently 9 digits, and destroying them would corrupt the import.
    const r = redact("שובר 629076429");
    expect(r.text).toContain("629076429");
    expect(r.hits).toHaveLength(0);
  });

  it("redacts household member names, including next to Hebrew", () => {
    const r = redact("על שם ישראל ישראלי", ["ישראל ישראלי"]);
    expect(r.text).toContain("[NAME]");
    expect(r.text).not.toContain("ישראלי");
  });

  it("prefers the LONGEST matching name so a full name wins over a first name", () => {
    const r = redact("Account holder: Dana Levi", ["Dana", "Dana Levi"]);
    expect(r.text).toBe("Account holder: [NAME]");
  });

  it("is case-insensitive and tolerates extra whitespace in names", () => {
    expect(redact("DANA   LEVI paid", ["Dana Levi"]).text).toContain("[NAME]");
  });

  it("is IDEMPOTENT - redacting twice changes nothing further", () => {
    const once = redact("card 4111111111111111 id 000000018", ["X"]).text;
    const twice = redact(once, ["X"]).text;
    expect(twice).toBe(once);
  });

  it("leaves ordinary merchant text completely untouched", () => {
    const desc = "SPOTIFY P43CD5B1CB";
    const r = redact(desc);
    expect(r.text).toBe(desc);
    expect(r.hits).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(redact("").text).toBe("");
  });

  it("reports what it found, without ever echoing the original value", () => {
    const r = redact("4111111111111111");
    expect(r.hits[0]?.kind).toBe("CARD_PAN");
    expect(JSON.stringify(r.hits)).not.toContain("4111");
  });

  it("is version-stamped so a rule change is auditable", () => {
    expect(REDACTION_VERSION).toMatch(/^redact@/);
  });
});

describe("redactRow", () => {
  it("redacts values but never column names", () => {
    const { row, counterpartyMasked } = redactRow({
      "תיאור": "כרטיס 4111111111111111",
      "סכום": "-250.00",
    });
    expect(Object.keys(row)).toEqual(["תיאור", "סכום"]);
    expect(row["תיאור"]).toContain("[CARD]");
    expect(row["סכום"]).toBe("-250.00");
    expect(counterpartyMasked).toBe("1111");
  });
});
