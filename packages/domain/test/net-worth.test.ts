import { describe, expect, it } from "vitest";
import { calculateNetWorth, type NetWorthItem } from "../src/ledger/net-worth";

const item = (over: Partial<NetWorthItem>): NetWorthItem => ({
  id: "i",
  name: "item",
  kind: "ACCOUNT",
  currency: "ILS",
  latestValue: "1000",
  ...over,
});

describe("calculateNetWorth", () => {
  it("consolidates assets minus liabilities in base currency", () => {
    const r = calculateNetWorth(
      [
        item({ id: "a", latestValue: "100000" }),
        item({ id: "b", kind: "REAL_ESTATE", latestValue: "2000000" }),
        item({ id: "c", kind: "MORTGAGE", latestValue: "800000" }),
      ],
      [],
      "ILS",
    );
    expect(r.totalAssets).toBe("2100000.00");
    expect(r.totalLiabilities).toBe("800000.00");
    expect(r.netWorth).toBe("1300000.00");
  });

  it("converts foreign currency via direct rate, and inverse when only reverse pair exists", () => {
    const items = [item({ id: "usd", currency: "USD", latestValue: "1000" })];
    const direct = calculateNetWorth(items, [{ from: "USD", to: "ILS", rate: "3.6" }], "ILS");
    expect(direct.netWorth).toBe("3600.00");
    const inverse = calculateNetWorth(items, [{ from: "ILS", to: "USD", rate: "0.25" }], "ILS");
    expect(inverse.netWorth).toBe("4000.00");
  });

  it("NEVER guesses: excludes and reports items lacking valuation or FX rate", () => {
    const r = calculateNetWorth(
      [
        item({ id: "ok", latestValue: "500" }),
        item({ id: "novalue", name: "pension", latestValue: null }),
        item({ id: "nofx", name: "eur account", currency: "EUR", latestValue: "100" }),
      ],
      [],
      "ILS",
    );
    expect(r.netWorth).toBe("500.00");
    expect(r.excluded).toEqual([
      { id: "novalue", name: "pension", reason: "NO_VALUATION" },
      { id: "nofx", name: "eur account", reason: "NO_FX_RATE" },
    ]);
  });

  it("ignores cash flow and insurance; tracks currency exposure gross", () => {
    const r = calculateNetWorth(
      [
        item({ id: "cf", kind: "CASH_FLOW", latestValue: "9999" }),
        item({ id: "usd", currency: "USD", latestValue: "100" }),
        item({ id: "usd2", kind: "LOAN", currency: "USD", latestValue: "40" }),
      ],
      [{ from: "USD", to: "ILS", rate: "3.5" }],
      "ILS",
    );
    expect(r.byCurrency["USD"]).toBe("140.00");
    expect(r.netWorth).toBe("210.00");
  });
});
