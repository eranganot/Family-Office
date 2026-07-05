import { describe, expect, it } from "vitest";
import { buildFromPayload } from "../src/ingestion/ledger-factory";
import type { RawDataPayload, RawItem } from "../src/ingestion/raw-payload";

const payload = (items: RawItem[]): RawDataPayload => ({
  schemaVersion: 1,
  adapterId: "test",
  adapterVersion: "1.0.0",
  extractedAt: "2026-07-01T00:00:00.000Z",
  items,
  warnings: [],
});

const goodAccount = (over: Partial<RawItem> = {}): RawItem => ({
  externalRef: "12345",
  suggestedKind: "ACCOUNT",
  suggestedName: "קרן השתלמות — מנורה",
  fields: [
    { path: "accountType", rawValue: "קרן השתלמות", normalizedValue: "KEREN_HISHTALMUT", confidence: 90 },
    { path: "institutionName", rawValue: "מנורה מבטחים", confidence: 95 },
    { path: "balance", rawValue: "₪ 152,340.75", normalizedValue: "152340.75", originalCurrency: "ILS", confidence: 90 },
    { path: "balanceAsOf", rawValue: "31/12/2025", normalizedValue: "2025-12-31", confidence: 90 },
    { path: "managementFeePct", rawValue: "0.25%", normalizedValue: "0.25", confidence: 85 },
  ],
  ...over,
});

describe("LedgerFactory", () => {
  it("builds a canonical account with valuation and full provenance", () => {
    const r = buildFromPayload(payload([goodAccount()]));
    expect(r.stats).toEqual({ total: 1, canonical: 1, suspense: 0 });
    const acc = r.canonical[0]!;
    expect(acc.accountType).toBe("KEREN_HISHTALMUT");
    expect(acc.institutionName).toBe("מנורה מבטחים");
    expect(acc.valuation).toEqual({ asOf: "2025-12-31", value: "152340.75", confidence: 90 });
    expect(acc.managementFeePct).toBe("0.25");
    expect(acc.provenance).toHaveLength(5);
    expect(acc.provenance[2]!.originalValue).toBe("₪ 152,340.75"); // verbatim preserved
  });

  it("routes every failure mode to suspense with a machine-readable reason — never throws, never guesses", () => {
    const cases: Array<[RawItem, string]> = [
      [goodAccount({ suggestedKind: "UNKNOWN" }), "UNKNOWN_KIND"],
      [goodAccount({ suggestedKind: "MORTGAGE" }), "UNSUPPORTED_KIND"],
      [goodAccount({ suggestedName: "  " }), "MISSING_NAME"],
      [
        goodAccount({
          fields: [
            { path: "accountType", rawValue: "משהו לא מוכר", confidence: 40 },
            { path: "institutionName", rawValue: "מנורה", confidence: 95 },
          ],
        }),
        "UNKNOWN_ACCOUNT_TYPE",
      ],
      [
        goodAccount({
          fields: [{ path: "accountType", rawValue: "x", normalizedValue: "KEREN_HISHTALMUT", confidence: 90 }],
        }),
        "MISSING_INSTITUTION",
      ],
      [
        goodAccount({
          fields: [
            { path: "accountType", rawValue: "x", normalizedValue: "KEREN_HISHTALMUT", confidence: 90 },
            { path: "institutionName", rawValue: "מנורה", confidence: 95 },
            { path: "balance", rawValue: "100", normalizedValue: "100", originalCurrency: "GBP", confidence: 90 },
          ],
        }),
        "UNKNOWN_CURRENCY",
      ],
      [
        goodAccount({
          fields: [
            { path: "accountType", rawValue: "x", normalizedValue: "KEREN_HISHTALMUT", confidence: 90 },
            { path: "institutionName", rawValue: "מנורה", confidence: 95 },
            { path: "balance", rawValue: "אין נתון", confidence: 20 },
          ],
        }),
        "UNPARSEABLE_BALANCE",
      ],
      [
        goodAccount({
          fields: [
            { path: "accountType", rawValue: "x", normalizedValue: "KEREN_HISHTALMUT", confidence: 90 },
            { path: "institutionName", rawValue: "מנורה", confidence: 95 },
            { path: "balance", rawValue: "100", normalizedValue: "100", confidence: 90 },
            { path: "balanceAsOf", rawValue: "מחר", confidence: 20 },
          ],
        }),
        "UNPARSEABLE_DATE",
      ],
    ];
    for (const [item, reason] of cases) {
      const r = buildFromPayload(payload([item]));
      expect(r.stats.canonical, reason).toBe(0);
      expect(r.suspense[0]!.reason, reason).toBe(reason);
      expect(r.suspense[0]!.rawItem, reason).toEqual(item); // raw preserved verbatim
    }
  });

  it("mixes canonical and suspense in one batch; defaults currency to ILS and asOf to extraction date", () => {
    const minimal = goodAccount({
      fields: [
        { path: "accountType", rawValue: "x", normalizedValue: "BANK_CHECKING", confidence: 90 },
        { path: "institutionName", rawValue: "בנק לאומי", confidence: 95 },
        { path: "balance", rawValue: "5,000", normalizedValue: "5000", confidence: 80 },
      ],
    });
    const r = buildFromPayload(payload([minimal, goodAccount({ suggestedKind: "UNKNOWN" }), goodAccount()]));
    expect(r.stats).toEqual({ total: 3, canonical: 2, suspense: 1 });
    expect(r.canonical[0]!.currency).toBe("ILS");
    expect(r.canonical[0]!.valuation!.asOf).toBe("2026-07-01");
  });

  it("account without balance field is canonical with no valuation (verification will flag it)", () => {
    const noBalance = goodAccount({
      fields: [
        { path: "accountType", rawValue: "x", normalizedValue: "KUPAT_GEMEL", confidence: 90 },
        { path: "institutionName", rawValue: "הראל", confidence: 95 },
      ],
    });
    const r = buildFromPayload(payload([noBalance]));
    expect(r.stats.canonical).toBe(1);
    expect(r.canonical[0]!.valuation).toBeUndefined();
  });
});
