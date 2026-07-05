import { buildFromPayload } from "@wealthos/domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ilAccountsCsvAdapter } from "../src/adapters/il-accounts-csv";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", name));
const meta = (filename: string) => ({ filename, mimeType: "text/csv", sha256: "fixture" });

describe("fixture corpus — CSV golden results", () => {
  it("hishtalmut statement: 2/2 canonical", async () => {
    const payload = await ilAccountsCsvAdapter.parse(fixture("hishtalmut-statement.csv"), meta("hishtalmut-statement.csv"));
    const r = buildFromPayload(payload);
    expect(r.stats).toEqual({ total: 2, canonical: 2, suspense: 0 });
    expect(r.canonical.map((c) => c.accountType)).toEqual(["KEREN_HISHTALMUT", "KEREN_HISHTALMUT"]);
    expect(r.canonical[0]!.valuation!.value).toBe("152340.75");
  });

  it("bank summary: 3/3 canonical incl. USD account", async () => {
    const payload = await ilAccountsCsvAdapter.parse(fixture("bank-accounts-summary.csv"), meta("bank-accounts-summary.csv"));
    const r = buildFromPayload(payload);
    expect(r.stats).toEqual({ total: 3, canonical: 3, suspense: 0 });
    expect(r.canonical[2]!.currency).toBe("USD");
    expect(r.canonical.map((c) => c.accountType)).toEqual(["BANK_CHECKING", "BANK_DEPOSIT", "BANK_CHECKING"]);
  });

  it("mislaka-style export: 2 canonical + bituach menahalim honestly in suspense (unsupported type)", async () => {
    const payload = await ilAccountsCsvAdapter.parse(fixture("mislaka-style-export.csv"), meta("mislaka-style-export.csv"));
    const r = buildFromPayload(payload);
    expect(r.stats).toEqual({ total: 3, canonical: 2, suspense: 1 });
    expect(r.suspense[0]!.reason).toBe("UNKNOWN_ACCOUNT_TYPE"); // ביטוח מנהלים — not yet a supported type
    expect(r.canonical[0]!.accountType).toBe("PENSION_COMPREHENSIVE");
    expect(r.canonical[0]!.depositFeePct).toBe("1.49");
  });
});
