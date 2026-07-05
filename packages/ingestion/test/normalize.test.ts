import { describe, expect, it } from "vitest";
import {
  cleanHebrew,
  containsHebrew,
  parseIsraeliDate,
  parseLocalizedDecimal,
  reverseVisualHebrew,
} from "../src/normalize";

describe("parseLocalizedDecimal", () => {
  it("handles Israeli/US formats, currency symbols, negatives", () => {
    expect(parseLocalizedDecimal("1,234.56")).toBe("1234.56");
    expect(parseLocalizedDecimal("₪ 152,340.75")).toBe("152340.75");
    expect(parseLocalizedDecimal("1.234,56")).toBe("1234.56"); // European convention
    expect(parseLocalizedDecimal("1,234.56-")).toBe("-1234.56"); // trailing minus (bank exports)
    expect(parseLocalizedDecimal("(500.00)")).toBe("-500.00");
    expect(parseLocalizedDecimal("0.5")).toBe("0.5");
    expect(parseLocalizedDecimal("1,000,000")).toBe("1000000");
  });
  it("returns undefined for garbage — never guesses", () => {
    expect(parseLocalizedDecimal("")).toBeUndefined();
    expect(parseLocalizedDecimal("N/A")).toBeUndefined();
    expect(parseLocalizedDecimal("12..3")).toBeUndefined();
    expect(parseLocalizedDecimal("אין")).toBeUndefined();
  });
});

describe("parseIsraeliDate", () => {
  it("parses day-first and ISO", () => {
    expect(parseIsraeliDate("31/12/2025")).toBe("2025-12-31");
    expect(parseIsraeliDate("1.1.2026")).toBe("2026-01-01");
    expect(parseIsraeliDate("2025-06-30")).toBe("2025-06-30");
  });
  it("rejects impossible dates", () => {
    expect(parseIsraeliDate("31/02/2025")).toBeUndefined();
    expect(parseIsraeliDate("13/13/2025")).toBeUndefined();
    expect(parseIsraeliDate("yesterday")).toBeUndefined();
  });
});

describe("Hebrew helpers", () => {
  it("detects and cleans Hebrew", () => {
    expect(containsHebrew("קרן השתלמות")).toBe(true);
    expect(containsHebrew("pension")).toBe(false);
    expect(cleanHebrew("  קֶרֶן   השתלמות ")).toBe("קרן השתלמות");
  });
  it("reverses visual-order tokens", () => {
    expect(reverseVisualHebrew("ןרק")).toBe("קרן");
  });
});
