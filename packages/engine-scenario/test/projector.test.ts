import type { SnapshotItem, SnapshotPayload } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import { buildScenarioParams, CANNED_SCENARIOS } from "../src/scenarios";
import { project } from "../src/projector";

const item = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  id: "i-" + Math.random().toString(36).slice(2, 8),
  kind: "ACCOUNT", name: "x", currency: "ILS", accountType: "BROKERAGE_IL", institutionName: null,
  liquidityClass: null, managementFeePct: null, valueBase: 100_000, valueAsOf: "2026-06-01",
  verified: true, ownerMemberIds: ["m1"], mortgageTracks: null, cashFlow: null, ...over,
});
const flow = (dir: "IN" | "OUT", monthly: number): SnapshotItem =>
  item({ kind: "CASH_FLOW", accountType: null, valueBase: null, cashFlow: { flowType: "X", direction: dir, amountBase: monthly, frequency: "MONTHLY" } });

const snap = (items: SnapshotItem[], goals: SnapshotPayload["goals"] = []): SnapshotPayload => ({
  schemaVersion: 1, takenAt: "2026-01-15T00:00:00.000Z", baseCurrency: "ILS", workflowState: "STRATEGY",
  members: [], items, goals, fxRatesUsed: [],
  dataQuality: { completenessScore: 100, confidenceScore: 90, pendingSuspense: 0, unconvertedItemIds: [] },
});

const params = (over = {}) => buildScenarioParams(20, 3, over);

describe("projector — baseline mechanics", () => {
  it("zero savings, zero return: wealth is flat; with return it compounds", () => {
    const flat = project(snap([item({ valueBase: 100_000 })]), buildScenarioParams(10, 0, {}));
    expect(flat.rows[9]!.investable).toBe(100_000);
    const growing = project(snap([item({ valueBase: 100_000 })]), buildScenarioParams(10, 3, {}));
    expect(growing.rows[9]!.investable).toBeCloseTo(100_000 * 1.03 ** 10, -3);
  });

  it("negative savings deplete wealth and yearsToDepletion is reported", () => {
    const r = project(snap([item({ valueBase: 50_000 }), flow("OUT", 10_000)]), buildScenarioParams(10, 0, {}));
    expect(r.yearsToDepletion).toBe(1);
  });

  it("mortgage amortizes straight-line and reaches ~0 by end date", () => {
    const mortgage = item({
      kind: "MORTGAGE", accountType: null, valueBase: 500_000,
      mortgageTracks: [{ trackType: "PRIME", principalRemaining: 500_000, annualRatePct: 5, cpiLinked: false, endDate: "2036-01-01" }],
    });
    const r = project(snap([mortgage, item({ valueBase: 100_000 })]), params());
    expect(r.rows[0]!.debt).toBeLessThan(500_000);
    const y2036 = r.rows.find((x) => x.year === 2036)!;
    expect(y2036.debt).toBe(0);
  });

  it("goal outcomes: funded iff investable at target year covers the requirement", () => {
    const goals = [
      { id: "g1", type: "PROPERTY_PURCHASE", name: "דירה", priority: 1, targetDate: "2031-06-01", requiredFundingBase: 500_000 },
      { id: "g2", type: "OTHER", name: "בלי יעד", priority: 2, targetDate: null, requiredFundingBase: null },
    ];
    const rich = project(snap([item({ valueBase: 450_000 }), flow("IN", 30_000), flow("OUT", 20_000)], goals), params());
    expect(rich.goalOutcomes[0]!.funded).toBe(true);
    expect(rich.goalOutcomes[1]!.funded).toBeNull();
    const poor = project(snap([item({ valueBase: 100_000 })], goals), params());
    expect(poor.goalOutcomes[0]!.funded).toBe(false);
  });
});

describe("canned scenarios vs baseline", () => {
  const base = snap([
    item({ valueBase: 1_000_000 }),
    flow("IN", 30_000),
    flow("OUT", 20_000),
    item({
      kind: "MORTGAGE", accountType: null, valueBase: 800_000,
      mortgageTracks: [{ trackType: "FIXED_LINKED", principalRemaining: 800_000, annualRatePct: 3, cpiLinked: true, endDate: "2046-01-01" }],
    }),
  ]);
  const baseline = project(base, params());

  it("JOB_LOSS dents year-1 savings; MARKET_CRASH dents wealth; both end below baseline", () => {
    const jobLoss = project(base, params(CANNED_SCENARIOS.JOB_LOSS));
    expect(jobLoss.rows[0]!.income).toBe(0);
    expect(jobLoss.terminalNetWorth).toBeLessThan(baseline.terminalNetWorth);
    const crash = project(base, params(CANNED_SCENARIOS.MARKET_CRASH));
    expect(crash.rows[0]!.investable).toBeLessThan(baseline.rows[0]!.investable);
    expect(crash.terminalNetWorth).toBeLessThan(baseline.terminalNetWorth);
  });

  it("HIGH_INFLATION raises CPI-linked debt vs baseline in early years", () => {
    const hot = project(base, params(CANNED_SCENARIOS.HIGH_INFLATION));
    expect(hot.rows[2]!.debt).toBeGreaterThan(baseline.rows[2]!.debt);
    expect(hot.terminalNetWorth).toBeLessThanOrEqual(baseline.terminalNetWorth);
  });

  it("RETIRE_EARLIER stops income at year 6 and ends below RETIRE_LATER", () => {
    const early = project(base, params(CANNED_SCENARIOS.RETIRE_EARLIER));
    const later = project(base, params(CANNED_SCENARIOS.RETIRE_LATER));
    expect(early.rows[5]!.income).toBe(0);
    expect(early.rows[4]!.income).toBeGreaterThan(0);
    expect(early.terminalNetWorth).toBeLessThan(later.terminalNetWorth);
  });

  it("SAVINGS_RATE_UP beats baseline; DOWN loses; determinism holds", () => {
    const up = project(base, params(CANNED_SCENARIOS.SAVINGS_RATE_UP));
    const down = project(base, params(CANNED_SCENARIOS.SAVINGS_RATE_DOWN));
    expect(up.terminalNetWorth).toBeGreaterThan(baseline.terminalNetWorth);
    expect(down.terminalNetWorth).toBeLessThan(baseline.terminalNetWorth);
    expect(project(base, params(CANNED_SCENARIOS.SAVINGS_RATE_UP))).toEqual(up); // deterministic
  });
});
