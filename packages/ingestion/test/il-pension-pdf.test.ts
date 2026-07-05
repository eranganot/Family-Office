import { buildFromPayload } from "@wealthos/domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ilPensionPdfAdapter } from "../src/adapters/il-pension-pdf";
import { fixVisualOrderLine, toggleVisualHebrewLine } from "../src/normalize";

describe("visual-order RTL repair", () => {
  it("toggle (generator transform) is an involution", () => {
    const logical = "יתרת צבירה: 415,230.50 שח";
    const visual = toggleVisualHebrewLine(logical);
    expect(visual).not.toBe(logical);
    expect(toggleVisualHebrewLine(visual)).toBe(logical);
  });

  it("repairs the pdf.js artifact (full char reversal) and leaves logical lines untouched", () => {
    const logical = "יתרת צבירה: 415,230.50 שח";
    const pdfJsArtifact = [...logical].reverse().join(""); // what pdf.js yields for visual-order PDFs
    expect(fixVisualOrderLine(pdfJsArtifact)).toBe(logical);
    expect(fixVisualOrderLine(logical)).toBe(logical);
    expect(fixVisualOrderLine("Balance: 1,234.56")).toBe("Balance: 1,234.56"); // non-Hebrew untouched
  });
});

describe("il-pension-pdf adapter — end to end on the generated fixture", () => {
  it("extracts the visual-order Hebrew PDF into a fully canonical pension account", async () => {
    const bytes = readFileSync(join(__dirname, "..", "fixtures", "pension-annual-report.pdf"));
    const payload = await ilPensionPdfAdapter.parse(bytes, {
      filename: "pension-annual-report.pdf",
      mimeType: "application/pdf",
      docType: "PENSION_REPORT",
      sha256: "fixture",
    });

    expect(payload.items).toHaveLength(1);
    const item = payload.items[0]!;
    expect(item.externalRef).toBe("987654");

    const result = buildFromPayload(payload);
    expect(result.stats).toEqual({ total: 1, canonical: 1, suspense: 0 });
    const acc = result.canonical[0]!;
    expect(acc.accountType).toBe("PENSION_COMPREHENSIVE");
    expect(acc.institutionName).toContain("סינתטית");
    expect(acc.valuation).toEqual({ asOf: "2025-12-31", value: "415230.50", confidence: 85 });
    expect(acc.managementFeePct).toBe("0.22");
    expect(acc.depositFeePct).toBe("1.49");
    expect(acc.trackName).toBe("כללי ב");
  }, 30000);
});
