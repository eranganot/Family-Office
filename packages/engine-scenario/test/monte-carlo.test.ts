import type { SnapshotItem, SnapshotPayload } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import { buildScenarioParams } from "../src/scenarios";
import { projectMonteCarlo } from "../src/monte-carlo";

const item = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  id: "i-" + Math.random().toString(36).slice(2, 8),
  kind: "ACCOUNT", name: "x", currency: "ILS", accountType: "BROKERAGE_IL", institutionName: null,
  liquidityClass: null, managementFeePct: null, growthSharePct: null, growthShareEstimated: false,
  valueBase: 1_000_000, valueAsOf: "2026-06-01", verified: true, ownerMemberIds: ["m1"], mortgageTracks: null, cashFlow: null, ...over,
});
const snap = (items: SnapshotItem[], goals: SnapshotPayload["goals"] = []): SnapshotPayload => ({
  schemaVersion: 1, takenAt: "2026-01-15T00:00:00.000Z", baseCurrency: "ILS", workflowState: "STRATEGY",
  members: [], items, goals, fxRatesUsed: [],
  dataQuality: { completenessScore: 100, confidenceScore: 90, pendingSuspense: 0, unconvertedItemIds: [] },
});
const mc = { runs: 400, volatilityPct: 12, seed: 42 };

describe("Monte Carlo projector (C2)", () => {
  it("is reproducible for a fixed seed", () => {
    const p = buildScenarioParams(20, 3, {});
    const a = projectMonteCarlo(snap([item()]), p, mc);
    const b = projectMonteCarlo(snap([item()]), p, mc);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces ordered percentile bands each year (P10 <= P50 <= P90)", () => {
    const r = projectMonteCarlo(snap([item()]), buildScenarioParams(20, 3, {}), mc);
    for (const y of r.years) {
      expect(y.netWorthP10).toBeLessThanOrEqual(y.netWorthP50);
      expect(y.netWorthP50).toBeLessThanOrEqual(y.netWorthP90);
    }
  });

  it("reports goal-success probabilities in [0,1]", () => {
    const goals = [{ id: "g1", type: "PROPERTY_PURCHASE", name: "House", priority: 1, targetDate: "2036-01-01", requiredFundingBase: 1_500_000 }];
    const r = projectMonteCarlo(snap([item()], goals), buildScenarioParams(20, 3, {}), mc);
    const g = r.goals.find((x) => x.goalId === "g1")!;
    expect(g.probabilityFunded).not.toBeNull();
    expect(g.probabilityFunded!).toBeGreaterThanOrEqual(0);
    expect(g.probabilityFunded!).toBeLessThanOrEqual(1);
  });

  it("reports a depletion probability in [0,1]; a heavy-drawdown household risks depletion", () => {
    const drawdown = snap([item({ valueBase: 200_000 }), item({ kind: "CASH_FLOW", accountType: null, valueBase: null, cashFlow: { flowType: "OUT", direction: "OUT", amountBase: 12_000, frequency: "MONTHLY" } })]);
    const r = projectMonteCarlo(drawdown, buildScenarioParams(20, 3, {}), mc);
    expect(r.depletionProbability).toBeGreaterThan(0);
    expect(r.depletionProbability).toBeLessThanOrEqual(1);
  });
});
