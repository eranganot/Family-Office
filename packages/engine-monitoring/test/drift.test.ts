import { describe, expect, it } from "vitest";
import type { SnapshotPayload } from "@wealthos/domain";
import { detectDrift, type DriftThresholds } from "../src/index";

const TH: DriftThresholds = { netWorthPct: 10, liquidityPct: 10, concentrationPct: 5, goalFundingPct: 10, allocationPct: 10 };

function snap(items: SnapshotPayload["items"], goals: SnapshotPayload["goals"] = []): SnapshotPayload {
  return {
    schemaVersion: 1,
    takenAt: "2026-07-06",
    baseCurrency: "ILS",
    workflowState: "MONITORING",
    members: [],
    items,
    goals,
    fxRatesUsed: [],
    dataQuality: { completenessScore: 100, confidenceScore: 100, pendingSuspense: 0, unconvertedItemIds: [] },
  };
}

function acct(id: string, valueBase: number, accountType = "BANK_CHECKING"): SnapshotPayload["items"][number] {
  return {
    id, kind: "ACCOUNT", name: id, currency: "ILS", accountType, institutionName: "Bank",
    liquidityClass: null, managementFeePct: null, growthSharePct: null, valueBase, valueAsOf: "2026-01-01",
    verified: true, ownerMemberIds: [], mortgageTracks: null, cashFlow: null,
  };
}

describe("detectDrift", () => {
  it("returns no findings when there is no baseline", () => {
    const r = detectDrift(snap([acct("a", 1000)]), null, TH);
    expect(r.hasBaseline).toBe(false);
    expect(r.findings).toHaveLength(0);
    expect(r.severity).toBe("NONE");
    expect(r.currentMetrics.netWorth).toBe(1000);
  });

  it("flags no drift when metrics are stable", () => {
    const base = snap([acct("a", 1000), acct("b", 1000)]);
    const cur = snap([acct("a", 1010), acct("b", 990)]);
    const r = detectDrift(cur, base, TH);
    expect(r.findings).toHaveLength(0);
    expect(r.severity).toBe("NONE");
  });

  it("detects a net-worth drop beyond threshold and recommends re-running strategy", () => {
    const base = snap([acct("a", 1000)]);
    const cur = snap([acct("a", 800)]); // -20%
    const r = detectDrift(cur, base, TH);
    const f = r.findings.find((x) => x.kind === "NET_WORTH_DRIFT");
    expect(f).toBeDefined();
    expect(f!.recommendedAction).toBe("RERUN_STRATEGY");
    expect(f!.severity).toBe("HIGH"); // 20% >= 2x threshold(10)
    expect(f!.delta).toBe(-20);
  });

  it("grades a smaller breach as MEDIUM", () => {
    const base = snap([acct("a", 1000)]);
    const cur = snap([acct("a", 870)]); // -13%
    const r = detectDrift(cur, base, TH);
    const f = r.findings.find((x) => x.kind === "NET_WORTH_DRIFT")!;
    expect(f.severity).toBe("MEDIUM");
  });

  it("detects a liquidity-share shift in percentage points", () => {
    // baseline: 50% liquid (checking) / 50% retirement; current: fully liquid
    const base = snap([acct("a", 500), acct("r", 500, "PENSION_COMPREHENSIVE")]);
    const cur = snap([acct("a", 1000), acct("r", 0, "PENSION_COMPREHENSIVE")]);
    const r = detectDrift(cur, base, TH);
    expect(r.findings.some((x) => x.kind === "LIQUIDITY_DRIFT")).toBe(true);
  });

  it("only flags concentration when it increases", () => {
    // concentration falls (diversifies): no finding
    const base = snap([acct("a", 900), acct("b", 100)]);
    const cur = snap([acct("a", 500), acct("b", 500)]);
    const r = detectDrift(cur, base, TH);
    expect(r.findings.some((x) => x.kind === "CONCENTRATION_DRIFT")).toBe(false);
  });

  it("detects goal-coverage drift when assets fall relative to goal need", () => {
    const goals: SnapshotPayload["goals"] = [
      { id: "g1", type: "RETIREMENT", name: "Retire", priority: 1, targetDate: null, requiredFundingBase: 1000 },
    ];
    const base = snap([acct("a", 1000)], goals); // 100% coverage
    const cur = snap([acct("a", 700)], goals); // 70% coverage -> 30pp drop
    const r = detectDrift(cur, base, TH);
    expect(r.findings.some((x) => x.kind === "GOAL_FUNDING_DRIFT")).toBe(true);
  });

  it("reports items added and removed since the baseline", () => {
    const base = snap([acct("a", 1000)]);
    const cur = snap([acct("a", 1000), acct("c", 5)]);
    const r = detectDrift(cur, base, TH);
    const added = r.findings.find((x) => x.kind === "ITEM_ADDED")!;
    expect(added.detail["addedItemIds"]).toEqual(["c"]);
  });

  it("takes household severity as the max across findings", () => {
    const base = snap([acct("a", 1000)]);
    const cur = snap([acct("a", 700), acct("c", 5)]); // -30.5% net worth (HIGH) + item added (LOW)
    const r = detectDrift(cur, base, TH);
    expect(r.severity).toBe("HIGH");
  });

  it("flags allocation drift when the known growth share moves beyond the threshold", () => {
    const grow = (id: string, valueBase: number, pct: number) => ({ ...acct(id, valueBase, "BROKERAGE_IL"), growthSharePct: pct });
    const base = snap([grow("a", 500_000, 60), acct("b", 500_000, "BANK_DEPOSIT")]); // growth 30%
    const cur = snap([grow("a", 900_000, 60), acct("b", 100_000, "BANK_DEPOSIT")]); // growth 54%
    const r = detectDrift(cur, base, TH);
    const f = r.findings.find((x) => x.kind === "ALLOCATION_DRIFT");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("HIGH"); // 24pp ≥ 2×10pp
    expect(f!.recommendedAction).toBe("RERUN_STRATEGY");
  });

  it("emits no allocation drift when the mix is unknown in either snapshot", () => {
    const base = snap([acct("a", 500_000, "BROKERAGE_IL")]); // unknown mix, no cash → null
    const cur = snap([acct("a", 900_000, "BROKERAGE_IL")]);
    const r = detectDrift(cur, base, TH);
    expect(r.findings.some((x) => x.kind === "ALLOCATION_DRIFT")).toBe(false);
  });

});
