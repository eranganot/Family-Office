import { describe, expect, it } from "vitest";
import { runAnalyzers } from "../src/analyzers/index";
import { analyzeConcentration } from "../src/analyzers/concentration";
import { analyzeCurrency } from "../src/analyzers/currency";
import { analyzeDebt } from "../src/analyzers/debt";
import { analyzeLiquidity } from "../src/analyzers/liquidity";
import { analyzeTaxHeadroom } from "../src/analyzers/tax-headroom";
import { CTX, expense, item, snapshot } from "./fixtures";

const codes = (f: { code: string }[]) => f.map((x) => x.code);

describe("liquidity", () => {
  it("warns below emergency target; notices idle cash beyond 2× target", () => {
    const low = analyzeLiquidity(snapshot([item({ valueBase: 30_000 }), expense(10_000)]), CTX);
    expect(codes(low)).toContain("LIQUIDITY_BELOW_TARGET");
    expect(low[0]!.metrics["runwayMonths"]).toBe(3);

    const idle = analyzeLiquidity(snapshot([item({ valueBase: 200_000 }), expense(10_000)]), CTX);
    expect(codes(idle)).toContain("EXCESS_IDLE_CASH");

    const ok = analyzeLiquidity(snapshot([item({ valueBase: 80_000, accountType: "BROKERAGE_IL" }), item({ valueBase: 60_000 }), expense(10_000)]), CTX);
    expect(ok).toHaveLength(0);
  });
  it("reports unknown expenses instead of guessing", () => {
    const r = analyzeLiquidity(snapshot([item()]), CTX);
    expect(codes(r)).toEqual(["LIQUIDITY_UNKNOWN_EXPENSES"]);
  });
});

describe("concentration", () => {
  it("flags single non-real-estate asset over threshold; real estate exempt", () => {
    const r = analyzeConcentration(
      snapshot([item({ name: "תיק מרוכז", accountType: "BROKERAGE_IL", valueBase: 700_000 }), item({ valueBase: 300_000 })]),
      CTX,
    );
    expect(codes(r)).toContain("CONCENTRATION_SINGLE_ASSET");
    const re = analyzeConcentration(
      snapshot([item({ kind: "REAL_ESTATE", accountType: null, institutionName: null, valueBase: 2_000_000 }), item({ valueBase: 300_000 })]),
      CTX,
    );
    expect(codes(re)).not.toContain("CONCENTRATION_SINGLE_ASSET");
  });
  it("flags institution concentration across accounts", () => {
    const r = analyzeConcentration(
      snapshot([
        item({ institutionName: "מנורה", accountType: "KEREN_HISHTALMUT", valueBase: 400_000 }),
        item({ institutionName: "מנורה", accountType: "KUPAT_GEMEL", valueBase: 300_000 }),
        item({ institutionName: "בנק אחר", valueBase: 300_000 }),
      ]),
      CTX,
    );
    expect(codes(r)).toContain("CONCENTRATION_INSTITUTION");
  });
});

describe("currency", () => {
  it("notices home bias and foreign excess", () => {
    expect(codes(analyzeCurrency(snapshot([item({ valueBase: 1_000_000 })]), CTX))).toContain("CURRENCY_HOME_BIAS");
    expect(
      codes(analyzeCurrency(snapshot([item({ currency: "USD", valueBase: 600_000 }), item({ valueBase: 400_000 })]), CTX)),
    ).toContain("CURRENCY_FOREIGN_EXCESS");
    expect(
      analyzeCurrency(snapshot([item({ currency: "USD", valueBase: 200_000 }), item({ valueBase: 800_000 })]), CTX),
    ).toHaveLength(0);
  });
});

describe("tax headroom", () => {
  it("flags adults without hishtalmut/pension; ignores retirees for pension", () => {
    const r = analyzeTaxHeadroom(snapshot([item()]), CTX);
    expect(codes(r)).toEqual(expect.arrayContaining(["TAX_HISHTALMUT_MISSING", "TAX_PENSION_MISSING"]));
    const withVehicles = analyzeTaxHeadroom(
      snapshot([
        item({ accountType: "KEREN_HISHTALMUT" }),
        item({ accountType: "PENSION_COMPREHENSIVE" }),
      ]),
      CTX,
    );
    expect(withVehicles).toHaveLength(0);
  });
  it("notices high management fees with the ceiling metric attached", () => {
    const r = analyzeTaxHeadroom(snapshot([item({ accountType: "KEREN_HISHTALMUT", managementFeePct: 1.2 }), item({ accountType: "PENSION_COMPREHENSIVE" })]), CTX);
    expect(codes(r)).toContain("HIGH_MANAGEMENT_FEE");
  });
});

describe("debt", () => {
  it("flags CPI-linked concentration and expensive tracks", () => {
    const mortgage = item({
      kind: "MORTGAGE", accountType: null, valueBase: 800_000,
      mortgageTracks: [
        { trackType: "FIXED_LINKED", principalRemaining: 600_000, annualRatePct: 3.2, cpiLinked: true, endDate: "2045-01-01" },
        { trackType: "PRIME", principalRemaining: 200_000, annualRatePct: 9.1, cpiLinked: false, endDate: "2045-01-01" },
      ],
    });
    const r = analyzeDebt(snapshot([mortgage]), CTX);
    expect(codes(r)).toEqual(expect.arrayContaining(["MORTGAGE_CPI_CONCENTRATION", "MORTGAGE_EXPENSIVE_TRACK"]));
  });
});

describe("runAnalyzers", () => {
  it("aggregates across all analyzers", () => {
    const r = runAnalyzers(snapshot([item({ valueBase: 1_000_000 }), expense(10_000)]), CTX);
    expect(r.length).toBeGreaterThanOrEqual(3); // idle cash + home bias + hishtalmut/pension missing...
  });
});

describe("fee benchmark by product type (B5)", () => {
  it("flags a pension fee above its per-type threshold that the global default would miss", () => {
    // 0.6% on a comprehensive pension (type threshold 0.5) — global default 0.8 would NOT flag it.
    const codes = runAnalyzers(
      snapshot([item({ accountType: "PENSION_COMPREHENSIVE", managementFeePct: 0.6 })]),
      CTX,
    ).map((f) => f.code);
    expect(codes).toContain("HIGH_MANAGEMENT_FEE");
  });
  it("does not flag a bank/brokerage fee below the global fallback", () => {
    const codes = runAnalyzers(
      snapshot([item({ accountType: "BROKERAGE_IL", managementFeePct: 0.7 })]),
      CTX,
    ).map((f) => f.code);
    expect(codes).not.toContain("HIGH_MANAGEMENT_FEE");
  });
});

describe("mortgage refinance signal (B6)", () => {
  const mortgage = (rate: number, trackType = "PRIME") =>
    item({ kind: "MORTGAGE", accountType: null, valueBase: -1_000_000,
      mortgageTracks: [{ trackType, principalRemaining: 1_000_000, annualRatePct: rate, cpiLinked: false, endDate: "2040-01-01" }] });

  it("flags a variable track priced above the BOI-derived prime benchmark", () => {
    // BOI 3.75 + spread 1.5 = 5.25 benchmark; +0.5 notice = 5.75. A 6.5% PRIME track is above.
    const codes = analyzeDebt(snapshot([mortgage(6.5, "PRIME")]), CTX).map((f) => f.code);
    expect(codes).toContain("MORTGAGE_ABOVE_BENCHMARK");
  });
  it("does not flag a track at or below the benchmark", () => {
    const codes = analyzeDebt(snapshot([mortgage(5.5, "PRIME")]), CTX).map((f) => f.code);
    expect(codes).not.toContain("MORTGAGE_ABOVE_BENCHMARK");
  });
  it("does not flag fixed tracks (not benchmarked to prime)", () => {
    const codes = analyzeDebt(snapshot([mortgage(6.5, "FIXED_UNLINKED")]), CTX).map((f) => f.code);
    expect(codes).not.toContain("MORTGAGE_ABOVE_BENCHMARK");
  });
  it("skips the signal when no BOI rate is available", () => {
    const noBoi = { ...CTX, marketRates: { boiRatePct: null } };
    const codes = analyzeDebt(snapshot([mortgage(6.5, "PRIME")]), noBoi).map((f) => f.code);
    expect(codes).not.toContain("MORTGAGE_ABOVE_BENCHMARK");
  });
});
