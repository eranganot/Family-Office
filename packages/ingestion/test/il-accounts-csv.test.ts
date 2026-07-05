import { buildFromPayload } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import { ilAccountsCsvAdapter } from "../src/adapters/il-accounts-csv";

const meta = { filename: "statement.csv", mimeType: "text/csv", sha256: "deadbeef" };
const enc = (s: string) => new TextEncoder().encode(s);

const HISHTALMUT_CSV = `שם קופה,מספר חשבון,סוג מוצר,חברה מנהלת,יתרת צבירה,נכון לתאריך,דמי ניהול מצבירה,מסלול השקעה
השתלמות כללי,123456,קרן השתלמות,מנורה מבטחים,"152,340.75",31/12/2025,0.25%,כללי
גמל להשקעה מניות,789012,גמל להשקעה,אלטשולר שחם,"48,020.10",31/12/2025,0.6%,מניות
`;

describe("il-accounts-csv adapter", () => {
  it("parses a hishtalmut statement into a valid payload that the factory fully canonicalizes", async () => {
    const payload = await ilAccountsCsvAdapter.parse(enc(HISHTALMUT_CSV), meta);
    expect(payload.adapterId).toBe("il-accounts-csv");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]!.suggestedName).toBe("השתלמות כללי");
    expect(payload.items[0]!.externalRef).toBe("123456");

    const result = buildFromPayload(payload);
    expect(result.stats).toEqual({ total: 2, canonical: 2, suspense: 0 });
    const first = result.canonical[0]!;
    expect(first.accountType).toBe("KEREN_HISHTALMUT");
    expect(first.institutionName).toBe("מנורה מבטחים");
    expect(first.valuation).toEqual({ asOf: "2025-12-31", value: "152340.75", confidence: 85 });
    expect(first.managementFeePct).toBe("0.25");
    expect(first.trackName).toBe("כללי");
    expect(result.canonical[1]!.accountType).toBe("GEMEL_LEHASHKAA");
  });

  it("routes unknown product types to suspense instead of guessing", async () => {
    const csv = `שם קופה,סוג מוצר,חברה מנהלת,יתרת צבירה
מוצר עלום,ביטוח מנהלים ישן,מגדל,"10,000"
`;
    const payload = await ilAccountsCsvAdapter.parse(enc(csv), meta);
    const result = buildFromPayload(payload);
    expect(result.stats.suspense).toBe(1);
    expect(result.suspense[0]!.reason).toBe("UNKNOWN_ACCOUNT_TYPE");
    expect(result.suspense[0]!.rawItem.fields.find((f) => f.path === "accountType")!.rawValue).toBe(
      "ביטוח מנהלים ישן",
    );
  });

  it("keeps unparseable balances as suspense with verbatim raw value", async () => {
    const csv = `שם קופה,סוג מוצר,חברה מנהלת,יתרת צבירה
קופה תקולה,קרן השתלמות,מנורה,אין נתון
`;
    const payload = await ilAccountsCsvAdapter.parse(enc(csv), meta);
    const result = buildFromPayload(payload);
    expect(result.suspense[0]!.reason).toBe("UNPARSEABLE_BALANCE");
  });

  it("warns when no recognizable name column exists", async () => {
    const payload = await ilAccountsCsvAdapter.parse(enc("a,b\n1,2\n"), meta);
    expect(payload.warnings).toContain("NO_NAME_COLUMN_RECOGNIZED");
  });
});
