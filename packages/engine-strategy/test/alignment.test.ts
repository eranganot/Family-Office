import { describe, expect, it } from "vitest";
import { runAnalyzers } from "../src/analyzers/index";
import { CTX, expense, item, snapshot } from "./fixtures";

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe("M30 strategy↔allocation alignment", () => {
  const rich = () => snapshot([
    item({ accountType: "BANK_DEPOSIT", valueBase: 900_000 }), // huge idle cash
    expense(10_000),
    item({ accountType: "KEREN_HISHTALMUT", valueBase: 150_000, growthSharePct: 20 }),
    item({
      kind: "MORTGAGE", accountType: null, valueBase: 300_000,
      mortgageTracks: [{ trackType: "PRIME", principalRemaining: 300_000, annualRatePct: 9.5, cpiLinked: false, endDate: "2040-01-01" }],
    }),
  ]);

  it("without an approved plan, the overlapping findings fire", () => {
    const f = codes(runAnalyzers(rich(), CTX));
    expect(f).toContain("EXCESS_IDLE_CASH");
    expect(f).toContain("MORTGAGE_EXPENSIVE_TRACK");
  });

  it("an approved plan that deploys cash + repays the track SUPPRESSES those findings", () => {
    const mortgageId = rich().items.find((i) => i.kind === "MORTGAGE")!.id;
    const ctx = {
      ...CTX,
      committedPlan: { deploysIdleCash: true, investsGrowth: true, repaidTrackItemIds: [mortgageId], taxDeposited: true },
    };
    // rebuild with a stable id so the repaid id matches
    const s = rich();
    const mid = s.items.find((i) => i.kind === "MORTGAGE")!.id;
    const f = codes(runAnalyzers(s, { ...ctx, committedPlan: { ...ctx.committedPlan, repaidTrackItemIds: [mid] } }));
    expect(f).not.toContain("EXCESS_IDLE_CASH");
    expect(f).not.toContain("MORTGAGE_EXPENSIVE_TRACK");
    expect(f).not.toContain("TAX_HISHTALMUT_UNDERUTILIZED");
  });
});
